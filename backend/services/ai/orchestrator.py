from __future__ import annotations

"""
AI pipeline orchestrator.

Wires together:
  Step 1 — gemini_retriever: fetch candidate recipes from corpus
  Step 2 — claude_generator: generate the 7-day plan from candidates

Injected context (personalisation):
  - user_taste_profiles  (from DB)
  - user_preferences     (from DB)
  - pantry_items         (from DB)
  - user recipe corpus file_id (from user_recipes)
"""

import logging
import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PantryItem, UserPreferences, UserRecipe, UserTasteProfile
from schemas.meal_plan import MealPlanResponse
from services.ai import claude_generator, gemini_retriever

logger = logging.getLogger(__name__)


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

    1. Load personalisation context from DB
    2. Gemini retrieves candidates
    3. Claude generates the plan
    Returns a validated MealPlanResponse ready for persistence.
    """
    # ── Load personalisation context ──────────────────────────────────────────
    taste_profile, pantry_items, user_corpus_file_id, recent_meals = await _load_context(
        db, user_id
    )

    # Merge DB preferences with request overrides
    prefs_row = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    prefs = prefs_row.scalar_one_or_none()
    if prefs:
        if not exclude_ingredients and prefs.excluded_ingredients:
            exclude_ingredients = list(prefs.excluded_ingredients)
        if not preferences_text and prefs.preferences_text:
            preferences_text = prefs.preferences_text

    # ── Step 1: Gemini retrieval ───────────────────────────────────────────────
    logger.info("Running Gemini retrieval for user %s", user_id)
    candidates = await gemini_retriever.retrieve_candidates(
        diet_type=diet_type,
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        taste_summary=_format_taste_summary(taste_profile),
        pantry_items=pantry_items,
        user_corpus_file_id=user_corpus_file_id,
    )
    logger.info("Gemini returned %d candidates", len(candidates))

    # ── Step 2: Claude generation ─────────────────────────────────────────────
    logger.info("Running Claude generation for user %s plan_id %s", user_id, plan_id)
    plan = await claude_generator.generate_plan(
        candidates=candidates,
        diet_type=diet_type,
        calories_target=calories_target,
        meals_per_day=meals_per_day,
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        taste_profile=taste_profile,
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

async def _load_context(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> tuple[dict[str, Any], list[str], str | None, list[str]]:
    """
    Returns (taste_profile_dict, pantry_item_names, user_corpus_file_id, recent_meal_names).
    """
    # Taste profile
    tp_result = await db.execute(
        select(UserTasteProfile).where(UserTasteProfile.user_id == user_id)
    )
    tp = tp_result.scalar_one_or_none()
    taste_profile: dict[str, Any] = {}
    recent_meals: list[str] = []
    if tp:
        taste_profile = {
            "favourite_tags": tp.favourite_tags or [],
            "disliked_signals": tp.disliked_signals or [],
            "preferred_prep_time": tp.preferred_prep_time,
            "actual_raw_ratio": tp.actual_raw_ratio,
        }
        recent_meals = tp.recent_meal_names or []

    # Pantry
    pantry_result = await db.execute(
        select(PantryItem.name).where(PantryItem.user_id == user_id)
    )
    pantry_items: list[str] = list(pantry_result.scalars().all())

    # Most recent user corpus file ID (from their latest bookmarked recipe)
    recipe_result = await db.execute(
        select(UserRecipe.corpus_file_id)
        .where(
            UserRecipe.user_id == user_id,
            UserRecipe.corpus_file_id.isnot(None),
        )
        .order_by(UserRecipe.created_at.desc())
        .limit(1)
    )
    user_corpus_file_id: str | None = recipe_result.scalar_one_or_none()

    return taste_profile, pantry_items, user_corpus_file_id, recent_meals


def _format_taste_summary(taste_profile: dict[str, Any]) -> str:
    if not taste_profile:
        return ""
    parts: list[str] = []
    if fav := taste_profile.get("favourite_tags"):
        parts.append(f"Loves: {', '.join(fav[:8])}")
    if dis := taste_profile.get("disliked_signals"):
        parts.append(f"Dislikes: {', '.join(dis[:5])}")
    if prep := taste_profile.get("preferred_prep_time"):
        parts.append(f"Prefers under {prep}min prep")
    return ". ".join(parts)
