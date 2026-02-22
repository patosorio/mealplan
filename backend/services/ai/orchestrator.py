from __future__ import annotations

"""
AI pipeline orchestrator.

Single-call architecture:
  1. Load user context in parallel (saved recipes, taste profile, pantry, preferences)
  2. Claude generates the full 7-day plan from scratch
"""

import asyncio
import logging
import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PantryItem, UserPreferences, UserRecipe, UserTasteProfile
from schemas.meal_plan import MealPlanResponse
from services.ai import claude_generator

logger = logging.getLogger(__name__)

_MAX_USER_RECIPES = 30


async def run_pipeline(
    db: AsyncSession,
    user_id: uuid.UUID,
    diet_type: str,
    calories_target: int,
    meals_per_day: list[str],
    exclude_ingredients: list[str],
    preferences_text: str | None,
    week_start: date,
    plan_id: uuid.UUID,
) -> MealPlanResponse:
    """
    Full meal plan generation pipeline.

    Loads personalisation context from DB in parallel, then calls Claude once
    to generate the complete 7-day plan.
    Returns a validated MealPlanResponse ready for persistence.
    """
    # ── Load all context in parallel ──────────────────────────────────────────
    (
        user_recipes,
        taste_profile,
        pantry_items,
        prefs,
    ) = await asyncio.gather(
        _load_user_recipes(db, user_id),
        _load_taste_profile(db, user_id),
        _load_pantry_items(db, user_id),
        _load_preferences(db, user_id),
    )

    # Merge DB preferences with request overrides
    if prefs is not None:
        if not exclude_ingredients and prefs.excluded_ingredients:
            exclude_ingredients = list(prefs.excluded_ingredients)
        if not preferences_text and prefs.preferences_text:
            preferences_text = prefs.preferences_text

    recent_meals: list[str] = taste_profile.get("recent_meal_names") or []
    profile_dict: dict[str, Any] = {
        k: v for k, v in taste_profile.items() if k != "recent_meal_names"
    }

    # ── Claude generation ─────────────────────────────────────────────────────
    logger.info(
        "Running Claude generation for user %s plan_id %s (%d saved recipes)",
        user_id,
        plan_id,
        len(user_recipes),
    )
    plan = await claude_generator.generate_plan(
        user_recipes=user_recipes,
        diet_type=diet_type,
        calories_target=calories_target,
        meals_per_day=meals_per_day,
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        taste_profile=profile_dict,
        pantry_items=pantry_items,
        week_start=week_start,
        plan_id=plan_id,
        recent_meal_names=recent_meals,
    )
    return plan


async def run_day_pipeline(
    db: AsyncSession,
    user_id: uuid.UUID,
    diet_type: str,
    calories_target: int,
    exclude_ingredients: list[str],
    preferences_text: str | None,
    week_start: date,
    plan_id: uuid.UUID,
    day: str,
) -> MealPlanResponse:
    """
    Re-run the pipeline for a single day (regenerate-day flow).
    Returns a full MealPlanResponse; the caller extracts just the target day.
    """
    return await run_pipeline(
        db=db,
        user_id=user_id,
        diet_type=diet_type,
        calories_target=calories_target,
        meals_per_day=["breakfast", "lunch", "dinner"],
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        week_start=week_start,
        plan_id=plan_id,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _load_user_recipes(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Return up to 30 most recent saved recipes as minimal dicts."""
    result = await db.execute(
        select(UserRecipe)
        .where(UserRecipe.user_id == user_id)
        .order_by(UserRecipe.created_at.desc())
        .limit(_MAX_USER_RECIPES)
    )
    rows = list(result.scalars().all())
    return [_serialise_recipe(r) for r in rows]


def _serialise_recipe(recipe: UserRecipe) -> dict[str, Any]:
    tags: list[str] = recipe.tags or []
    # Infer type from tags; default to "cooked"
    meal_type = "raw" if "raw" in tags else "cooked"
    return {
        "name": recipe.name,
        "description": recipe.description or "",
        "tags": tags,
        "prep_minutes": recipe.prep_minutes,
        "type": meal_type,
    }


async def _load_taste_profile(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict[str, Any]:
    result = await db.execute(
        select(UserTasteProfile).where(UserTasteProfile.user_id == user_id)
    )
    tp = result.scalar_one_or_none()
    if tp is None:
        return {}
    return {
        "favourite_tags": tp.favourite_tags or [],
        "disliked_signals": tp.disliked_signals or [],
        "preferred_prep_time": tp.preferred_prep_time,
        "actual_raw_ratio": tp.actual_raw_ratio,
        "recent_meal_names": tp.recent_meal_names or [],
    }


async def _load_pantry_items(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[str]:
    result = await db.execute(
        select(PantryItem.name).where(PantryItem.user_id == user_id)
    )
    return list(result.scalars().all())


async def _load_preferences(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> UserPreferences | None:
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    return result.scalar_one_or_none()
