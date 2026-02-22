from __future__ import annotations

"""
Corpus management for Gemini File Search.

Two corpora:
  - Global corpus  — 20k plant-based recipes, uploaded once via upload_global_corpus().
                     Shared across all users. File IDs stored in a local JSON cache.
  - User corpora   — one file per user, containing their bookmarked recipes as JSONL.
                     Updated via upsert_user_corpus() after each bookmark.
"""

import asyncio
import json
import logging
import re
import uuid
from pathlib import Path
from typing import Any

import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models import UserRecipe
from services.ai.gemini_embedder import embed_text

logger = logging.getLogger(__name__)

# Path where the global corpus file ID is persisted between runs
_CORPUS_CACHE_PATH = Path(__file__).parent.parent.parent / "data" / "corpus_cache.json"

# Hard limits to prevent abuse
_MAX_RECIPE_NAME_LEN = 200
_MAX_RECIPE_DESC_LEN = 2000
_MAX_JSONL_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


def _configure_genai() -> None:
    genai.configure(api_key=settings.gemini_api_key)


def _sanitize_text(value: str, max_len: int) -> str:
    """Strip control characters and enforce maximum length."""
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return cleaned[:max_len]


def _recipe_to_jsonl_line(recipe: UserRecipe) -> str:
    """Serialize a UserRecipe to a single JSONL line safe for corpus upload."""
    record: dict[str, Any] = {
        "id": str(recipe.id),
        "name": _sanitize_text(recipe.name, _MAX_RECIPE_NAME_LEN),
        "description": _sanitize_text(recipe.description or "", _MAX_RECIPE_DESC_LEN),
        "tags": [_sanitize_text(t, 100) for t in (recipe.tags or [])[:20]],
        "diet_type": recipe.diet_type or "",
        "prep_minutes": recipe.prep_minutes,
        "source": recipe.source,
    }
    return json.dumps(record, ensure_ascii=False)


async def upload_global_corpus(corpus_jsonl_path: Path) -> str:
    """
    One-time upload of the global recipe corpus to Gemini File Search.
    Returns the Gemini file ID. Stores the ID in corpus_cache.json so
    subsequent runs can retrieve candidates without re-uploading.

    corpus_jsonl_path: path to a local JSONL file, one recipe per line.
    """
    if not corpus_jsonl_path.exists():
        raise FileNotFoundError(f"Corpus file not found: {corpus_jsonl_path}")

    file_size = corpus_jsonl_path.stat().st_size
    if file_size > _MAX_JSONL_SIZE_BYTES:
        raise ValueError(
            f"Corpus file too large: {file_size} bytes (max {_MAX_JSONL_SIZE_BYTES})"
        )

    _configure_genai()

    def _upload() -> str:
        uploaded = genai.upload_file(
            path=str(corpus_jsonl_path),
            mime_type="text/plain",
            display_name="patri_eats_global_corpus",
        )
        return uploaded.name  # type: ignore[return-value]

    loop = asyncio.get_running_loop()
    file_id: str = await loop.run_in_executor(None, _upload)

    _CORPUS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    cache: dict[str, Any] = {}
    if _CORPUS_CACHE_PATH.exists():
        cache = json.loads(_CORPUS_CACHE_PATH.read_text())
    cache["global_corpus_file_id"] = file_id
    _CORPUS_CACHE_PATH.write_text(json.dumps(cache, indent=2))

    logger.info("Global corpus uploaded — file_id=%s", file_id)
    return file_id


def get_global_corpus_file_id() -> str | None:
    """Return the cached global corpus file ID, or None if not uploaded yet."""
    if not _CORPUS_CACHE_PATH.exists():
        return None
    cache = json.loads(_CORPUS_CACHE_PATH.read_text())
    return cache.get("global_corpus_file_id")


async def upsert_user_corpus(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> str | None:
    """
    Rebuild and re-upload the user's personal corpus from their bookmarked recipes.
    Returns the new Gemini file ID (stored on each UserRecipe.corpus_file_id),
    or None if the user has no recipes.

    Called as a BackgroundTask after POST /recipes/save-from-plan.
    """
    result = await db.execute(
        select(UserRecipe)
        .where(UserRecipe.user_id == user_id)
        .order_by(UserRecipe.created_at.desc())
        .limit(500)  # cap corpus size
    )
    recipes: list[UserRecipe] = list(result.scalars().all())

    if not recipes:
        return None

    lines = [_recipe_to_jsonl_line(r) for r in recipes]
    jsonl_content = "\n".join(lines)

    if len(jsonl_content.encode()) > _MAX_JSONL_SIZE_BYTES:
        logger.warning(
            "User %s corpus exceeds size limit — truncating to first 200 recipes",
            user_id,
        )
        lines = lines[:200]
        jsonl_content = "\n".join(lines)

    _configure_genai()

    def _upload() -> str:
        # Write to a temp-style in-memory bytes path via a temp file approach
        import tempfile

        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".jsonl",
            delete=False,
            encoding="utf-8",
        ) as tmp:
            tmp.write(jsonl_content)
            tmp_path = tmp.name

        uploaded = genai.upload_file(
            path=tmp_path,
            mime_type="text/plain",
            display_name=f"patri_eats_user_{user_id}",
        )
        Path(tmp_path).unlink(missing_ok=True)
        return uploaded.name  # type: ignore[return-value]

    loop = asyncio.get_running_loop()
    file_id: str = await loop.run_in_executor(None, _upload)

    # Also embed each recipe for pgvector semantic search (fire-and-forget per recipe)
    for recipe in recipes:
        if recipe.embedding is None:
            try:
                embed_source = f"{recipe.name}. {recipe.description or ''}"
                recipe.embedding = await embed_text(embed_source)
            except Exception:
                logger.warning("Failed to embed recipe %s", recipe.id)

    await db.commit()

    logger.info(
        "User corpus uploaded — user=%s file_id=%s recipes=%d",
        user_id,
        file_id,
        len(recipes),
    )
    return file_id
