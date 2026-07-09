from __future__ import annotations

"""
AI pipeline orchestrator.

Two-phase architecture:
  1. Load user context in parallel (saved recipes, taste profile, pantry, preferences)
  2. Phase 1 — Sonnet nutritional blueprint (PlanSkeleton)
  3. Phase 2 — parallel Haiku day enrichment → MealPlanResponse
"""

import asyncio
import logging
import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PantryItem, UserPreferences, UserRecipe, UserTasteProfile
from schemas.enums import DAY_ORDER
from schemas.meal_plan import (
    DayPlan,
    GeneratePlanRequest,
    JuicingConfig,
    MealPlanResponse,
    NutritionAvg,
    RecipeUsagePolicy,
)
from services.ai.claude_generator import (
    enrich_day,
    generate_plan,
    generate_plan_skeleton,
    generate_single_day,
)

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
    extras: list[str] | None = None,
    juicing_config: JuicingConfig | None = None,
    plan_days: int = 7,
    raw_cooked_ratio: str = "80_20",
    recipe_usage_policy: RecipeUsagePolicy | None = None,
) -> MealPlanResponse:
    """
    Full meal plan generation pipeline.

    Loads personalisation context from DB in parallel, then calls Claude once
    to generate the complete 7-day plan.
    Returns a validated MealPlanResponse ready for persistence.
    """
    trace_id = str(uuid.uuid4())
    logger.info(
        "generation_started",
        extra={
            "trace_id": trace_id,
            "user_id": str(user_id),
            "plan_days": plan_days,
        },
    )

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
    try:
        plan = await asyncio.wait_for(
            generate_plan(
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
                extras=extras or [],
                juicing_config=juicing_config,
                plan_days=plan_days,
                raw_cooked_ratio=raw_cooked_ratio,
                recipe_usage_policy=recipe_usage_policy,
            ),
            timeout=370.0,  # 2 × 175s attempts + 20s slack
        )
    except asyncio.TimeoutError:
        logger.error(
            "Pipeline timeout for user %s plan_id %s — exceeded 370s", user_id, plan_id
        )
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Meal plan generation timed out. Please try again.",
        )
    return plan


async def run_two_phase_pipeline(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: GeneratePlanRequest,
    plan_id: uuid.UUID,
) -> MealPlanResponse:
    trace_id = str(uuid.uuid4())
    logger.info("generation_started", extra={
        "trace_id": trace_id,
        "user_id": str(user_id),
        "plan_days": request.plan_days,
    })

    recipes, taste_profile, pantry, preferences = await asyncio.gather(
        _load_user_recipes(db, user_id),
        _load_taste_profile(db, user_id),
        _load_pantry_items(db, user_id),
        _load_preferences(db, user_id),
    )

    context = _build_context(request, recipes, taste_profile, pantry, preferences)

    plan_days = list(DAY_ORDER[: request.plan_days])

    logger.info("phase1_started", extra={"trace_id": trace_id})
    skeleton = await generate_plan_skeleton(
        plan_days=plan_days,
        context=context,
        trace_id=trace_id,
    )
    logger.info("phase1_complete", extra={"trace_id": trace_id})

    cached_user_context = _build_cached_user_context(context)

    logger.info("phase2_started", extra={
        "trace_id": trace_id,
        "day_count": len(plan_days),
    })
    results = await asyncio.gather(*[
        enrich_day(
            day=day,
            blueprint=skeleton.days[day].model_dump(),
            skeleton=skeleton,
            context=context,
            cached_user_context=cached_user_context,
            trace_id=trace_id,
        )
        for day in plan_days
        if day in skeleton.days
    ], return_exceptions=True)

    days_dict: dict[str, DayPlan] = {}
    failures: list[Exception] = []
    for result in results:
        if isinstance(result, Exception):
            logger.error("day_enrich_failed", extra={
                "trace_id": trace_id,
                "error": str(result)[:500],
            })
            failures.append(result)
            continue
        day, day_plan = result
        days_dict[day] = day_plan

    if len(failures) > 2:
        raise ValueError(
            f"Generation failed: {len(failures)} of {len(plan_days)} days could not be enriched. "
            "Please try again."
        )

    nutrition_by_day: dict[str, NutritionAvg] = dict(skeleton.daily_targets)
    for day, day_plan in days_dict.items():
        if day_plan.nutrition:
            nutrition_by_day[day] = day_plan.nutrition

    nutrition_avg = _sum_weekly_nutrition(days_dict)

    logger.info("generation_complete", extra={
        "trace_id": trace_id,
        "days_generated": len(days_dict),
    })

    return MealPlanResponse(
        plan_id=plan_id,
        week_start=request.week_start,
        plan_days=request.plan_days,
        nutrition_avg=nutrition_avg,
        nutrition_by_day=nutrition_by_day,
        days=days_dict,
    )


async def load_generation_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: GeneratePlanRequest,
) -> tuple[list[str], dict[str, Any]]:
    """Load user data and build the generation context dict for Phase 1/2."""
    recipes, taste_profile, pantry, preferences = await asyncio.gather(
        _load_user_recipes(db, user_id),
        _load_taste_profile(db, user_id),
        _load_pantry_items(db, user_id),
        _load_preferences(db, user_id),
    )
    context = _build_context(request, recipes, taste_profile, pantry, preferences)
    plan_days = list(DAY_ORDER[: request.plan_days])
    context["plan_days"] = plan_days
    return plan_days, context


def build_cached_user_context(context: dict[str, Any]) -> str:
    return _build_cached_user_context(context)


def sum_weekly_nutrition(days: dict[str, DayPlan]) -> NutritionAvg:
    return _sum_weekly_nutrition(days)


async def run_single_day_pipeline(
    db: AsyncSession,
    user_id: uuid.UUID,
    diet_type: str,
    calories_target: int,
    meals_per_day: list[str],
    exclude_ingredients: list[str],
    preferences_text: str | None,
    day: str,
) -> DayPlan:
    """Generate a single day using Claude Haiku and loaded user context."""
    recipes, taste_profile, pantry, preferences = await asyncio.gather(
        _load_user_recipes(db, user_id),
        _load_taste_profile(db, user_id),
        _load_pantry_items(db, user_id),
        _load_preferences(db, user_id),
    )

    if preferences is not None:
        if not exclude_ingredients and preferences.excluded_ingredients:
            exclude_ingredients = list(preferences.excluded_ingredients)
        if not preferences_text and preferences.preferences_text:
            preferences_text = preferences.preferences_text

    recent_meals: list[str] = taste_profile.get("recent_meal_names") or []
    profile_dict: dict[str, Any] = {
        k: v for k, v in taste_profile.items() if k != "recent_meal_names"
    }

    return await generate_single_day(
        user_recipes=recipes,
        diet_type=diet_type,
        calories_target=calories_target,
        meals_per_day=meals_per_day,
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        taste_profile=profile_dict,
        pantry_items=pantry,
        recent_meal_names=recent_meals,
        day=day,
    )


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
    """Deprecated — use run_single_day_pipeline for single-day regeneration."""
    del week_start, plan_id
    day_plan = await run_single_day_pipeline(
        db=db,
        user_id=user_id,
        diet_type=diet_type,
        calories_target=calories_target,
        meals_per_day=["breakfast", "lunch", "dinner"],
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        day=day,
    )
    return MealPlanResponse(
        plan_id=uuid.uuid4(),
        week_start=date.today(),
        plan_days=1,
        nutrition_avg={
            "calories": calories_target,
            "protein_g": 60,
            "carbs_g": 200,
            "fat_g": 70,
            "fiber_g": 35,
        },
        days={day: day_plan},
    )


def _build_context(
    request: GeneratePlanRequest,
    recipes: list[dict[str, Any]],
    taste_profile: dict[str, Any],
    pantry: list[str],
    preferences: UserPreferences | None,
) -> dict[str, Any]:
    exclude_ingredients = list(request.exclude_ingredients)
    preferences_text = request.preferences_text

    if preferences is not None:
        if not exclude_ingredients and preferences.excluded_ingredients:
            exclude_ingredients = list(preferences.excluded_ingredients)
        if not preferences_text and preferences.preferences_text:
            preferences_text = preferences.preferences_text

    profile_dict = {
        k: v for k, v in taste_profile.items() if k != "recent_meal_names"
    }
    recent_meal_names = taste_profile.get("recent_meal_names") or []

    policy = request.recipe_usage_policy
    saved_recipes = recipes if request.use_own_recipes else []
    pantry_items = pantry if request.use_pantry else []

    juicing_config: dict[str, Any] | None = None
    if request.juicing_config is not None:
        juicing_config = request.juicing_config.model_dump()

    return {
        "diet_type": request.diet_type,
        "calories_target": request.calories_target,
        "raw_cooked_ratio": request.raw_cooked_ratio,
        "meals_per_day": request.meals_per_day,
        "juicing_config": juicing_config,
        "extras": list(request.extras) if request.extras else [],
        "exclude_ingredients": exclude_ingredients,
        "preferences_text": preferences_text,
        "pantry_items": pantry_items,
        "recent_meal_names": recent_meal_names,
        "taste_profile_summary": _format_taste_profile(profile_dict),
        "recipe_usage_policy": _format_recipe_policy(policy),
        "saved_recipes": saved_recipes,
        "recipe_id_lookup": {
            r["name"].lower().strip(): r["id"]
            for r in recipes
        },
        "source_instructions": _format_source_instructions(policy),
    }


def _build_cached_user_context(context: dict[str, Any]) -> str:
    """
    Builds the user context string passed identically to all Phase 2 Haiku calls.
    Must be identical across calls to trigger Anthropic prompt caching.
    """
    parts = [
        f"User diet: {context['diet_type']}",
        f"Raw/cooked ratio: {context['raw_cooked_ratio']}",
        f"Calories: {context['calories_target']} kcal/day",
    ]
    if context.get("preferences_text"):
        parts.append(f"User notes: {context['preferences_text']}")
    if context.get("taste_profile_summary"):
        parts.append(f"Taste profile: {context['taste_profile_summary']}")
    return " | ".join(parts)


def _sum_weekly_nutrition(days: dict[str, DayPlan]) -> NutritionAvg:
    """Average per-day nutrition into weekly totals."""
    totals = {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0}
    count = 0
    for day_plan in days.values():
        if day_plan.nutrition:
            for key in totals:
                totals[key] += getattr(day_plan.nutrition, key, 0)
            count += 1
    if count > 0:
        totals = {k: round(v / count) for k, v in totals.items()}
    return NutritionAvg(**totals)


def _format_taste_profile(profile: dict[str, Any]) -> str:
    parts: list[str] = []
    if profile.get("favourite_tags"):
        parts.append(f"Loves: {', '.join(profile['favourite_tags'][:10])}")
    if profile.get("disliked_signals"):
        parts.append(f"Dislikes: {', '.join(profile['disliked_signals'][:5])}")
    if profile.get("preferred_prep_time"):
        parts.append(f"Max prep time: {profile['preferred_prep_time']} min")
    if profile.get("actual_raw_ratio") is not None:
        parts.append(f"Historical raw ratio: {profile['actual_raw_ratio']:.0%}")
    return "\n".join(parts) if parts else "No taste profile data yet."


def _format_recipe_policy(policy: RecipeUsagePolicy) -> str:
    if policy.mode == "prefer_saved":
        return (
            "prefer_saved — prioritise saved recipes across all slots; "
            "generate only when no saved recipe fits"
        )
    if policy.mode == "prefer_new":
        return (
            "prefer_new — generate new recipes for most slots; "
            "use at most 1–2 saved recipes when they fit perfectly"
        )
    return (
        "balanced — use saved recipes for roughly 40–50% of slots, "
        "preferring breakfast and juice slots"
    )


def _format_source_instructions(policy: RecipeUsagePolicy) -> str:
    repeat_slots = policy.flexible_repeat_slots
    repeat_clause = (
        f" You may reuse saved recipes in flexible slots ({', '.join(repeat_slots)})."
        if repeat_slots
        else " Avoid repeating the same saved recipe across the week."
    )
    base = (
        'Set source="user_recipe" when using a saved recipe (use the exact saved name). '
        'Set source="generated" for all new meals.'
    )
    return base + repeat_clause


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
    if recipe.type:
        meal_type = recipe.type
    else:
        lower_tags = {t.lower() for t in tags}
        if "juice" in lower_tags or "smoothie" in lower_tags:
            meal_type = "juice"
        elif "raw" in lower_tags or "raw vegan" in lower_tags:
            meal_type = "raw"
        else:
            meal_type = "cooked"
    return {
        "id": str(recipe.id),
        "name": recipe.name,
        "description": recipe.description or "",
        "tags": tags,
        "type": meal_type,
        "diet_type": recipe.diet_type,
        "prep_minutes": recipe.prep_minutes,
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
