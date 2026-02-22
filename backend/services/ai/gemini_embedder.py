from __future__ import annotations

import asyncio
import logging
from functools import lru_cache

import google.generativeai as genai

from core.config import settings

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL = "models/text-embedding-004"
_EMBEDDING_DIM = 768


@lru_cache(maxsize=1)
def _get_client() -> None:
    """Configure the Gemini SDK once at first use."""
    genai.configure(api_key=settings.gemini_api_key)


async def embed_text(text: str) -> list[float]:
    """
    Embed a single text string using Gemini text-embedding-004.
    Returns a 768-dimensional float vector for pgvector storage.

    The Gemini SDK call is synchronous; we run it in a thread pool to
    avoid blocking the async event loop.
    """
    if not text or not text.strip():
        raise ValueError("Cannot embed empty text.")

    _get_client()

    def _call() -> list[float]:
        result = genai.embed_content(
            model=_EMBEDDING_MODEL,
            content=text.strip(),
            task_type="RETRIEVAL_DOCUMENT",
        )
        embedding: list[float] = result["embedding"]
        if len(embedding) != _EMBEDDING_DIM:
            raise RuntimeError(
                f"Expected {_EMBEDDING_DIM}-dim embedding, got {len(embedding)}"
            )
        return embedding

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _call)


async def embed_query(text: str) -> list[float]:
    """
    Embed a search query using the RETRIEVAL_QUERY task type.
    Use this for search queries; use embed_text() for documents.
    """
    if not text or not text.strip():
        raise ValueError("Cannot embed empty query.")

    _get_client()

    def _call() -> list[float]:
        result = genai.embed_content(
            model=_EMBEDDING_MODEL,
            content=text.strip(),
            task_type="RETRIEVAL_QUERY",
        )
        return result["embedding"]  # type: ignore[return-value]

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _call)
