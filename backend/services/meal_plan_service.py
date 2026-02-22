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
from services.ai.orchestrator import run_pipeline
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
        days_data[day] = {
            "breakfast": day_plan.breakfast.model_dump(),
            "lunch": day_plan.lunch.model_dump(),
            "dinner": day_plan.dinner.model_dump(),
            "snacks": day_plan.snacks,
        }

    meal_plan = MealPlan(
        id=plan_id,
        user_id=user_id,
        week_start=request.week_start,
        diet_type=request.diet_type,
        plan_data={"days": days_data},
        nutrition_avg=plan_response.nutrition_avg.model_dump(),
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

    new_plan_response: MealPlanResponse = await run_pipeline(
        db=db,
        user_id=user_id,
        diet_type=plan.diet_type,
        calories_target=prefs.calories_target if prefs else 1800,
        meals_per_day=["breakfast", "lunch", "dinner"],
        exclude_ingredients=list(prefs.excluded_ingredients) if prefs else [],
        preferences_text=prefs.preferences_text if prefs else None,
        week_start=plan.week_start,
        plan_id=plan_id,
    )

    if day not in new_plan_response.days:
        raise HTTPException(
            status_code=422,
            detail=f"Day '{day}' not found in regenerated plan.",
        )

    new_day_plan = new_plan_response.days[day]
    new_day_data: dict[str, Any] = {
        "breakfast": new_day_plan.breakfast.model_dump(),
        "lunch": new_day_plan.lunch.model_dump(),
        "dinner": new_day_plan.dinner.model_dump(),
        "snacks": new_day_plan.snacks,
    }

    # Merge new day into existing plan_data
    updated_plan_data: dict[str, Any] = dict(plan.plan_data)
    updated_days: dict[str, Any] = dict(updated_plan_data.get("days", {}))
    updated_days[day] = new_day_data
    updated_plan_data["days"] = updated_days
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


