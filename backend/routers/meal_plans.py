from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_db_user
from db.session import get_db
from models import GeneratedMeal, MealPlan, User
from schemas import GeneratePlanRequest, GeneratedMealRead, MealPlanRead
from services.meal_plan_service import generate_and_persist, regenerate_day
from services.signal_service import log_signal

router = APIRouter(prefix="/meal-plans", tags=["meal plans"])


@router.post("/generate", response_model=MealPlanRead, status_code=201)
async def generate_meal_plan(
    body: GeneratePlanRequest,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> MealPlan:
    """
    Generate a personalised 7-day plant-based meal plan via the AI pipeline.
    Returns the persisted MealPlan with plan_data ready for immediate display.
    Call POST /{id}/save to flatten meals into individual queryable rows.
    """
    return await generate_and_persist(request=body, user_id=user.id, db=db)


@router.get("", response_model=list[MealPlanRead])
async def list_meal_plans(
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[MealPlan]:
    result = await db.execute(
        select(MealPlan)
        .where(MealPlan.user_id == user.id)
        .order_by(MealPlan.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{plan_id}", response_model=MealPlanRead)
async def get_meal_plan(
    plan_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> MealPlan:
    plan = await _get_plan_or_404(db, plan_id, user.id)
    return plan


@router.post("/{plan_id}/save", response_model=MealPlanRead)
async def save_meal_plan(
    plan_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> MealPlan:
    """
    Persist a generated plan: flatten each day/meal into individual
    generated_meals rows so they're individually queryable.
    Idempotent — re-saving an already-saved plan is a no-op.
    """
    plan = await _get_plan_or_404(db, plan_id, user.id)

    existing = await db.execute(
        select(GeneratedMeal).where(GeneratedMeal.meal_plan_id == plan.id).limit(1)
    )
    if existing.scalar_one_or_none() is None:
        for day, day_meals in plan.plan_data.get("days", {}).items():
            for meal_type, meal in day_meals.items():
                if meal_type == "snacks" or not isinstance(meal, dict):
                    continue
                db.add(
                    GeneratedMeal(
                        user_id=user.id,
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
        await db.commit()

    await log_signal(db, user.id, "plan_saved", {
        "meal_plan_id": str(plan.id),
        "week_start": str(plan.week_start),
        "diet_type": plan.diet_type,
    })

    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
async def delete_meal_plan(
    plan_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    plan = await _get_plan_or_404(db, plan_id, user.id)
    await db.delete(plan)
    await db.commit()


_VALID_DAYS = frozenset(
    {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
)


@router.post("/{plan_id}/regenerate-day", response_model=MealPlanRead)
async def regenerate_plan_day(
    plan_id: uuid.UUID,
    day: str = Query(..., description="Day to regenerate, e.g. 'monday'"),
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> MealPlan:
    """
    Regenerate a single day in an existing meal plan.
    Replaces that day's meals in plan_data with freshly generated ones.
    Logs a regenerated_day signal.
    """
    if day.lower() not in _VALID_DAYS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid day '{day}'. Must be one of: {sorted(_VALID_DAYS)}.",
        )
    return await regenerate_day(
        db=db,
        plan_id=plan_id,
        day=day.lower(),
        user_id=user.id,
    )


@router.get("/{plan_id}/meals", response_model=list[GeneratedMealRead])
async def list_generated_meals(
    plan_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[GeneratedMeal]:
    await _get_plan_or_404(db, plan_id, user.id)
    result = await db.execute(
        select(GeneratedMeal)
        .where(GeneratedMeal.meal_plan_id == plan_id)
        .order_by(GeneratedMeal.day, GeneratedMeal.meal_type)
    )
    return list(result.scalars().all())


# ── /generated-meals — cross-plan queries ────────────────────────────────────

generated_router = APIRouter(prefix="/generated-meals", tags=["meal plans"])


@generated_router.get("", response_model=list[GeneratedMealRead])
async def list_all_generated_meals(
    saved: Annotated[bool | None, Query()] = None,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[GeneratedMeal]:
    """
    List generated meals across all plans.
    Pass `?saved=true` to return only bookmarked meals.
    """
    query = select(GeneratedMeal).where(GeneratedMeal.user_id == user.id)
    if saved is not None:
        query = query.where(GeneratedMeal.saved == saved)
    result = await db.execute(query.order_by(GeneratedMeal.created_at.desc()))
    return list(result.scalars().all())


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_plan_or_404(
    db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID
) -> MealPlan:
    result = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Meal plan not found.")
    return plan
