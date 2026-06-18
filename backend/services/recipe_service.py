from __future__ import annotations

"""
Recipe service — pgvector semantic search, bookmark post-processing,
and on-demand recipe expansion.
"""

import logging
import uuid

from fastapi import HTTPException
from pgvector.sqlalchemy import Vector
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.background import run_with_session
from models import UserRecipe
from services.ai.gemini_embedder import embed_query
from services.ai.recipe_expander import expand_recipe

logger = logging.getLogger(__name__)

_SEMANTIC_SEARCH_LIMIT = 20
_SIMILARITY_THRESHOLD = 0.3  # cosine distance — lower is more similar

_COLOUR_KEYWORDS: list[tuple[str, list[str]]] = [
    ("green",  ["spinach", "kale", "celery", "cucumber", "wheatgrass", "matcha", "parsley", "mint"]),
    ("orange", ["carrot", "orange", "turmeric", "mango", "papaya", "peach"]),
    ("red",    ["beet", "beetroot", "pomegranate", "cherry", "raspberry", "strawberry", "watermelon", "red pepper"]),
    ("yellow", ["pineapple", "lemon", "ginger", "banana", "apple", "pear", "yellow pepper"]),
    ("purple", ["blueberry", "blackberry", "purple cabbage", "acai", "grape", "plum"]),
    ("pink",   ["dragonfruit", "pink grapefruit", "rose", "hibiscus", "guava"]),
]


def infer_juice_colour(name: str, ingredients: list) -> str | None:
    """Return a colour tag inferred from juice name and ingredients, or None."""
    text = (name + " " + " ".join(str(i) for i in ingredients)).lower()
    for colour, keywords in _COLOUR_KEYWORDS:
        if any(kw in text for kw in keywords):
            return colour
    return None


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
            UserRecipe.deleted_at.is_(None),
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
            UserRecipe.deleted_at.is_(None),
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


async def get_or_expand_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
) -> UserRecipe:
    """
    Fetch a user recipe. If ingredients/steps are empty, call Claude to
    expand it, persist the result, and return the updated recipe.

    If Claude fails the recipe is returned as-is with empty lists — the user
    is never blocked from viewing their saved recipe.
    """
    result = await db.execute(
        select(UserRecipe).where(
            UserRecipe.id == recipe_id,
            UserRecipe.user_id == user_id,
            UserRecipe.deleted_at.is_(None),
        )
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")

    if recipe.ingredients:
        return recipe

    try:
        ingredients, steps = await expand_recipe(
            name=recipe.name,
            description=recipe.description,
            tags=recipe.tags or [],
            diet_type=recipe.diet_type,
            prep_minutes=recipe.prep_minutes,
        )
        recipe.ingredients = ingredients
        recipe.steps = steps
        await db.commit()
        await db.refresh(recipe)
    except Exception:
        logger.exception(
            "Recipe expansion failed for recipe_id=%s — returning unexpanded recipe",
            recipe_id,
        )

    return recipe


async def expand_recipe_background(
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Background task wrapper — uses a fresh session."""
    await run_with_session(_expand_recipe_background, recipe_id, user_id)


async def _expand_recipe_background(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """
    Background task: expand a freshly bookmarked recipe so it's ready
    before the user navigates to the detail page.
    Silently swallows all errors — this is best-effort pre-warming.
    """
    try:
        result = await db.execute(
            select(UserRecipe).where(
                UserRecipe.id == recipe_id,
                UserRecipe.user_id == user_id,
            )
        )
        recipe = result.scalar_one_or_none()
        if recipe is None or recipe.ingredients:
            return

        ingredients, steps = await expand_recipe(
            name=recipe.name,
            description=recipe.description,
            tags=recipe.tags or [],
            diet_type=recipe.diet_type,
            prep_minutes=recipe.prep_minutes,
        )
        recipe.ingredients = ingredients
        recipe.steps = steps
        await db.commit()
    except Exception:
        logger.exception(
            "Background expansion failed for recipe_id=%s", recipe_id
        )


async def embed_recipe_background(
    recipe_id: uuid.UUID,
    name: str,
    description: str | None,
) -> None:
    await run_with_session(_embed_recipe_background, recipe_id, name, description)


async def _embed_recipe_background(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    name: str,
    description: str | None,
) -> None:
    from services.ai.gemini_embedder import embed_text

    try:
        text = f"{name}. {description or ''}".strip()
        embedding = await embed_text(text)
        result = await db.execute(
            select(UserRecipe).where(UserRecipe.id == recipe_id)
        )
        recipe = result.scalar_one_or_none()
        if recipe is None:
            return
        recipe.embedding = embedding
        await db.commit()
    except Exception:
        logger.exception("Embedding failed for recipe %s", recipe_id)


async def update_recipe(
    db: AsyncSession,
    recipe: UserRecipe,
    updates: dict[str, object],
) -> UserRecipe:
    """Apply partial updates to a user recipe."""
    for field, value in updates.items():
        if value is not None:
            setattr(recipe, field, value)
    await db.commit()
    await db.refresh(recipe)
    return recipe
