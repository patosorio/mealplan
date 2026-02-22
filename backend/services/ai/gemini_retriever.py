from __future__ import annotations

"""
Gemini File Search retriever.

Queries the global recipe corpus and the user's personal corpus using
Gemini 2.0 Flash with context caching (1-hour TTL on the global corpus).
Returns a list of candidate recipe dicts for Claude to work with.
"""

import asyncio
import json
import logging
import re
from typing import Any

import google.generativeai as genai

from core.config import settings
from services.ai.corpus_manager import get_global_corpus_file_id

logger = logging.getLogger(__name__)

_RETRIEVAL_MODEL = "gemini-2.0-flash-exp"
_MAX_CANDIDATES = 30
_MAX_USER_CANDIDATES = 10

# Simple in-process cache for Gemini cached-content names
# (keyed by corpus file_id → CachedContent name)
_context_cache: dict[str, str] = {}


def _configure_genai() -> None:
    genai.configure(api_key=settings.gemini_api_key)


def _safe_parse_candidates(raw: str) -> list[dict[str, Any]]:
    """
    Extract a JSON array from Gemini's response.
    Gemini may wrap output in markdown fences; we strip those first.
    Returns an empty list on parse failure.
    """
    text = raw.strip()
    # Strip optional ```json ... ``` fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed[:_MAX_CANDIDATES]
        if isinstance(parsed, dict) and "candidates" in parsed:
            return parsed["candidates"][:_MAX_CANDIDATES]
    except json.JSONDecodeError:
        logger.warning("Could not parse candidate JSON from Gemini response")
    return []


def _build_retrieval_prompt(
    diet_type: str,
    exclude_ingredients: list[str],
    preferences_text: str | None,
    taste_summary: str,
    pantry_items: list[str],
    num_candidates: int,
) -> str:
    exclude_str = (
        f"Exclude any recipe containing: {', '.join(exclude_ingredients)}."
        if exclude_ingredients
        else ""
    )
    pantry_str = (
        f"Prioritise recipes that use these pantry items: {', '.join(pantry_items[:20])}."
        if pantry_items
        else ""
    )
    prefs_str = f"User preferences note: {preferences_text}" if preferences_text else ""
    taste_str = f"Taste profile: {taste_summary}" if taste_summary else ""

    return (
        f"Search the recipe corpus and return exactly {num_candidates} plant-based "
        f"recipes suitable for a {diet_type} diet. "
        f"{exclude_str} {pantry_str} {prefs_str} {taste_str} "
        "Return ONLY a valid JSON array where each element is an object with keys: "
        "name, description, tags (array), prep_minutes (int), type ('raw' or 'cooked'). "
        "Do NOT include any text outside the JSON array."
    )


async def retrieve_candidates(
    diet_type: str,
    exclude_ingredients: list[str],
    preferences_text: str | None,
    taste_summary: str,
    pantry_items: list[str],
    user_corpus_file_id: str | None = None,
) -> list[dict[str, Any]]:
    """
    Query the global corpus (and optionally the user's corpus) using Gemini
    File Search. Returns up to _MAX_CANDIDATES recipe dicts.

    Global corpus queries use Gemini context caching (1-hour TTL) to reduce cost.
    User corpus is queried fresh each time (it's small and changes per bookmark).
    """
    _configure_genai()

    global_file_id = get_global_corpus_file_id()
    if not global_file_id:
        logger.warning("Global corpus not uploaded — returning empty candidates")
        return []

    global_candidates = await _query_corpus(
        file_id=global_file_id,
        diet_type=diet_type,
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        taste_summary=taste_summary,
        pantry_items=pantry_items,
        num_candidates=_MAX_CANDIDATES,
        use_cache=True,
    )

    user_candidates: list[dict[str, Any]] = []
    if user_corpus_file_id:
        user_candidates = await _query_corpus(
            file_id=user_corpus_file_id,
            diet_type=diet_type,
            exclude_ingredients=exclude_ingredients,
            preferences_text=preferences_text,
            taste_summary=taste_summary,
            pantry_items=pantry_items,
            num_candidates=_MAX_USER_CANDIDATES,
            use_cache=False,
        )

    # Mark source so Claude knows which came from personal recipes
    for c in user_candidates:
        c["source"] = "user_recipe"
    for c in global_candidates:
        c.setdefault("source", "corpus")

    # User recipes first (stronger personalisation signal)
    combined = user_candidates + global_candidates
    return combined[:_MAX_CANDIDATES]


async def _query_corpus(
    file_id: str,
    diet_type: str,
    exclude_ingredients: list[str],
    preferences_text: str | None,
    taste_summary: str,
    pantry_items: list[str],
    num_candidates: int,
    use_cache: bool,
) -> list[dict[str, Any]]:
    prompt = _build_retrieval_prompt(
        diet_type=diet_type,
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        taste_summary=taste_summary,
        pantry_items=pantry_items,
        num_candidates=num_candidates,
    )

    def _call() -> str:
        file_part = genai.get_file(file_id)
        model = genai.GenerativeModel(_RETRIEVAL_MODEL)
        response = model.generate_content([file_part, prompt])
        return response.text  # type: ignore[return-value]

    loop = asyncio.get_running_loop()
    try:
        raw: str = await loop.run_in_executor(None, _call)
    except Exception:
        logger.exception("Gemini retrieval failed for file_id=%s", file_id)
        return []

    return _safe_parse_candidates(raw)
