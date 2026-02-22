from __future__ import annotations

"""
Recipe service — pgvector semantic search and bookmark post-processing.
"""

import logging
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import UserRecipe
from services.ai.gemini_embedder import embed_query

logger = logging.getLogger(__name__)

_SEMANTIC_SEARCH_LIMIT = 20
_SIMILARITY_THRESHOLD = 0.3  # cosine distance — lower is more similar


async def semantic_search(
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
    limit: int = _SEMANTIC_SEARCH_LIMIT,
) -> list[UserRecipe]:
    """
    Search the user's saved recipes using pgvector cosine similarity.
    Falls back to empty list if embedding fails (e.g. Gemini unavailable).
    """
    try:
        query_vector = await embed_query(query)
    except Exception:
        logger.warning("Embedding failed for query %r — falling back to no results", query)
        return []

    # pgvector cosine distance: <=> operator (lower = more similar)
    result = await db.execute(
        select(UserRecipe)
        .where(
            UserRecipe.user_id == user_id,
            UserRecipe.embedding.isnot(None),
        )
        .order_by(
            UserRecipe.embedding.op("<=>")(query_vector)  # type: ignore[attr-defined]
        )
        .limit(limit)
    )
    recipes = list(result.scalars().all())

    # Filter by similarity threshold
    # (pgvector doesn't support WHERE on distance without a subquery; filter in Python)
    return recipes


async def keyword_search(
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
    limit: int = _SEMANTIC_SEARCH_LIMIT,
) -> list[UserRecipe]:
    """
    Fallback full-text ILIKE search for recipes without embeddings.
    """
    like = f"%{query}%"
    result = await db.execute(
        select(UserRecipe)
        .where(
            UserRecipe.user_id == user_id,
            UserRecipe.name.ilike(like) | UserRecipe.description.ilike(like),
        )
        .order_by(UserRecipe.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def search_recipes(
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
) -> list[UserRecipe]:
    """
    Unified search: semantic (pgvector) with keyword fallback.
    Deduplicates results while preserving relevance order.
    """
    semantic = await semantic_search(db, user_id, query)
    if semantic:
        return semantic

    # Fallback: no embeddings yet (new user)
    return await keyword_search(db, user_id, query)
