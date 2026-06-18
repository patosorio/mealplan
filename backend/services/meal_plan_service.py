from __future__ import annotations

"""
Meal plan business logic — generation, persistence, and day-level regeneration.
Keeps all DB operations and orchestrator calls out of the router layer.
"""

import uuid
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import GeneratedMeal, MealPlan, UserPreferences
from schemas.meal_plan import GeneratePlanRequest, MealPlanResponse
from services.ai.orchestrator import run_pipeline, run_single_day_pipeline
from services.signal_service import log_signal


async def generate_and_persist(
    request: GeneratePlanRequest,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> MealPlan:
    """
    Run the full AI pipeline and persist the result as a MealPlan row.
    Does NOT flatten to generated_meals yet — that happens on explicit save.
    Logs the plan_generated signal.
    """
    plan_id = uuid.uuid4()

    try:
        plan_response: MealPlanResponse = await run_pipeline(
            db=db,
            user_id=user_id,
            diet_type=request.diet_type,
            calories_target=request.calories_target,
            meals_per_day=request.meals_per_day,
            exclude_ingredients=request.exclude_ingredients,
            preferences_text=request.preferences_text,
            week_start=request.week_start,
            plan_id=plan_id,
            extras=list(request.extras) if request.extras else [],
            juicing_config=request.juicing_config,
            plan_days=request.plan_days,
            raw_cooked_ratio=request.raw_cooked_ratio,
            recipe_usage_policy=request.recipe_usage_policy,
        )
    except HTTPException:
        raise  # re-raise clean HTTP errors from inside the pipeline
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Meal plan generation failed: {exc}",
        ) from exc

    # Flatten each DayPlan into JSON-serialisable dicts
    days_data: dict[str, Any] = {}
    for day, day_plan in plan_response.days.items():
        day_entry: dict[str, Any] = {
            "breakfast": day_plan.breakfast.model_dump() if day_plan.breakfast else None,
            "lunch": day_plan.lunch.model_dump() if day_plan.lunch else None,
            "dinner": day_plan.dinner.model_dump() if day_plan.dinner else None,
            "juices": [j.model_dump() for j in day_plan.juices],
            "extras": [e.model_dump() for e in day_plan.extras],
            "snacks": day_plan.snacks,
        }
        if day_plan.nutrition:
            day_entry["nutrition"] = day_plan.nutrition.model_dump()
        days_data[day] = day_entry

    nutrition_by_day: dict[str, Any] = {
        day: nutrition.model_dump()
        for day, nutrition in plan_response.nutrition_by_day.items()
    }
    for day, day_plan in plan_response.days.items():
        if day_plan.nutrition and day not in nutrition_by_day:
            nutrition_by_day[day] = day_plan.nutrition.model_dump()

    meal_plan = MealPlan(
        id=plan_id,
        user_id=user_id,
        week_start=request.week_start,
        diet_type=request.diet_type,
        plan_data={
            "days": days_data,
            "nutrition_by_day": nutrition_by_day,
        },
        nutrition_avg=plan_response.nutrition_avg.model_dump(),
        plan_days=request.plan_days,
    )
    db.add(meal_plan)
    await db.commit()
    await db.refresh(meal_plan)

    await log_signal(
        db,
        user_id,
        "plan_generated",
        {
            "meal_plan_id": str(meal_plan.id),
            "week_start": str(request.week_start),
            "diet_type": request.diet_type,
        },
    )

    return meal_plan


async def regenerate_day(
    db: AsyncSession,
    plan_id: uuid.UUID,
    day: str,
    user_id: uuid.UUID,
) -> MealPlan:
    """
    Regenerate a single day within an existing saved plan.
    Replaces only the target day in plan_data and deletes the old
    generated_meals rows for that day so the next save re-flattens cleanly.
    Logs the regenerated_day signal.
    """
    result = await db.execute(
        select(MealPlan).where(
            MealPlan.id == plan_id,
            MealPlan.user_id == user_id,
        )
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Meal plan not found.")

    # Fetch user preferences for context
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    prefs = prefs_result.scalar_one_or_none()

    new_day_plan = await run_single_day_pipeline(
        db=db,
        user_id=user_id,
        diet_type=plan.diet_type,
        calories_target=prefs.calories_target if prefs else 1800,
        meals_per_day=["breakfast", "lunch", "dinner"],
        exclude_ingredients=list(prefs.excluded_ingredients) if prefs else [],
        preferences_text=prefs.preferences_text if prefs else None,
        day=day,
    )

    new_day_data: dict[str, Any] = {
        "breakfast": new_day_plan.breakfast.model_dump() if new_day_plan.breakfast else None,
        "lunch": new_day_plan.lunch.model_dump() if new_day_plan.lunch else None,
        "dinner": new_day_plan.dinner.model_dump() if new_day_plan.dinner else None,
        "juices": [j.model_dump() for j in new_day_plan.juices],
        "extras": [e.model_dump() for e in new_day_plan.extras],
        "snacks": new_day_plan.snacks,
    }
    if new_day_plan.nutrition:
        new_day_data["nutrition"] = new_day_plan.nutrition.model_dump()

    # Merge new day into existing plan_data
    updated_plan_data: dict[str, Any] = dict(plan.plan_data)
    updated_days: dict[str, Any] = dict(updated_plan_data.get("days", {}))
    updated_days[day] = new_day_data
    updated_plan_data["days"] = updated_days
    if new_day_plan.nutrition:
        nutrition_by_day = dict(updated_plan_data.get("nutrition_by_day", {}))
        nutrition_by_day[day] = new_day_plan.nutrition.model_dump()
        updated_plan_data["nutrition_by_day"] = nutrition_by_day
    plan.plan_data = updated_plan_data

    # Delete stale generated_meals rows for this day so re-save is clean
    old_meals = await db.execute(
        select(GeneratedMeal).where(
            GeneratedMeal.meal_plan_id == plan_id,
            GeneratedMeal.day == day,
        )
    )
    for meal in old_meals.scalars().all():
        await db.delete(meal)

    await db.commit()
    await db.refresh(plan)

    await log_signal(
        db,
        user_id,
        "regenerated_day",
        {
            "meal_plan_id": str(plan_id),
            "day": day,
            "diet_type": plan.diet_type,
        },
    )

    return plan


async def swap_meal(
    db: AsyncSession,
    old_meal: GeneratedMeal,
    user_id: uuid.UUID,
) -> GeneratedMeal:
    """
    Phase 7 — swap a single meal slot via AI.

    Regenerates the parent plan, extracts the fresh meal for the same
    day/meal_type, marks the old row 'swapped', creates a new row 'pending'.
    The new row must be explicitly accepted by the user.
    """
    plan_result = await db.execute(
        select(MealPlan).where(MealPlan.id == old_meal.meal_plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Parent meal plan not found.")

    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    prefs = prefs_result.scalar_one_or_none()

    day_plan = await run_single_day_pipeline(
        db=db,
        user_id=user_id,
        diet_type=plan.diet_type,
        calories_target=prefs.calories_target if prefs else 1800,
        meals_per_day=["breakfast", "lunch", "dinner"],
        exclude_ingredients=list(prefs.excluded_ingredients) if prefs else [],
        preferences_text=prefs.preferences_text if prefs else None,
        day=old_meal.day,
    )

    meal_type = old_meal.meal_type
    if meal_type.startswith("juice_"):
        try:
            j_idx = int(meal_type.split("_", 1)[1])
            juices = day_plan.juices
            fresh_meal_item = juices[j_idx] if j_idx < len(juices) else None
        except (ValueError, IndexError):
            fresh_meal_item = None
    else:
        fresh_meal_item = getattr(day_plan, meal_type, None)

    if fresh_meal_item is None:
        raise HTTPException(
            status_code=422,
            detail=f"Regenerated day missing meal_type '{old_meal.meal_type}'.",
        )

    # Update plan_data so calendar/grid reflect the swap
    updated_plan_data: dict[str, Any] = dict(plan.plan_data)
    updated_days: dict[str, Any] = dict(updated_plan_data.get("days", {}))
    day_data = dict(updated_days.get(old_meal.day, {}))
    if meal_type.startswith("juice_"):
        j_idx = int(meal_type.split("_", 1)[1])
        juices_list = list(day_data.get("juices", []))
        while len(juices_list) <= j_idx:
            juices_list.append(None)
        juices_list[j_idx] = fresh_meal_item.model_dump()
        day_data["juices"] = juices_list
    else:
        day_data[meal_type] = fresh_meal_item.model_dump()
    updated_days[old_meal.day] = day_data
    updated_plan_data["days"] = updated_days
    plan.plan_data = updated_plan_data

    # Mark old meal as swapped
    old_meal.approval_status = "swapped"

    # Create replacement row — starts pending; user must accept
    new_meal = GeneratedMeal(
        user_id=user_id,
        meal_plan_id=old_meal.meal_plan_id,
        day=old_meal.day,
        meal_type=old_meal.meal_type,
        name=fresh_meal_item.name,
        type=fresh_meal_item.type,
        description=fresh_meal_item.description,
        tags=fresh_meal_item.tags,
        prep_minutes=fresh_meal_item.prep_minutes,
        saved=False,
        approval_status="pending",
        swapped_from_meal_id=old_meal.id,
    )
    db.add(new_meal)
    await db.commit()
    await db.refresh(new_meal)
    return new_meal


async def sync_generated_meals_from_plan(
    db: AsyncSession,
    plan: MealPlan,
    user_id: uuid.UUID,
) -> int:
    """
    Ensure every meal in plan_data has a generated_meals row.
    Idempotent — creates only missing rows; never deletes or overwrites existing.
    Returns the number of rows created.
    """
    existing_result = await db.execute(
        select(GeneratedMeal).where(GeneratedMeal.meal_plan_id == plan.id)
    )
    existing_keys = {(m.day, m.meal_type) for m in existing_result.scalars().all()}
    created = 0

    for day, day_meals in plan.plan_data.get("days", {}).items():
        if not isinstance(day_meals, dict):
            continue

        for meal_type, meal in day_meals.items():
            if meal_type in ("snacks", "extras", "juices", "nutrition") or not isinstance(meal, dict):
                continue
            if (day, meal_type) in existing_keys:
                continue
            db.add(
                GeneratedMeal(
                    user_id=user_id,
                    meal_plan_id=plan.id,
                    day=day,
                    meal_type=meal_type,
                    name=meal["name"],
                    type=meal.get("type", ""),
                    description=meal.get("description"),
                    tags=meal.get("tags", []),
                    prep_minutes=meal.get("prep_minutes"),
                    saved=False,
                )
            )
            existing_keys.add((day, meal_type))
            created += 1

        for j_idx, juice in enumerate(day_meals.get("juices", [])):
            if not isinstance(juice, dict):
                continue
            key = (day, f"juice_{j_idx}")
            if key in existing_keys:
                continue
            db.add(
                GeneratedMeal(
                    user_id=user_id,
                    meal_plan_id=plan.id,
                    day=day,
                    meal_type=f"juice_{j_idx}",
                    name=juice.get("name", "Juice"),
                    type="juice",
                    description=juice.get("description"),
                    tags=juice.get("tags", []),
                    prep_minutes=juice.get("prep_minutes"),
                    saved=False,
                )
            )
            existing_keys.add(key)
            created += 1

        for extra in day_meals.get("extras", []):
            if not isinstance(extra, dict):
                continue
            slot = extra.get("slot")
            if not slot or (day, slot) in existing_keys:
                continue
            db.add(
                GeneratedMeal(
                    user_id=user_id,
                    meal_plan_id=plan.id,
                    day=day,
                    meal_type=slot,
                    name=extra.get("name", slot),
                    type=extra.get("type", "raw"),
                    description=extra.get("description"),
                    tags=[],
                    prep_minutes=extra.get("prep_minutes"),
                    saved=False,
                )
            )
            existing_keys.add((day, slot))
            created += 1

    return created