from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_db_user
from db.session import get_db
from models import GeneratedMeal, MealPlan, User
from schemas import (
    ApprovePlanRequest,
    GeneratePlanRequest,
    GeneratedMealRead,
    MealPlanRead,
    PatchGeneratedMealRequest,
    PatchMealPlanRequest,
    SchedulePlanRequest,
)
from services.meal_plan_service import (
    generate_and_persist,
    regenerate_day,
    swap_meal,
    sync_generated_meals_from_plan,
)
from db.background import run_with_session
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
    status: Annotated[str | None, Query(description="Filter by plan status")] = None,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[MealPlan]:
    stmt = select(MealPlan).where(MealPlan.user_id == user.id)
    if status:
        stmt = stmt.where(MealPlan.status == status)
    stmt = stmt.order_by(MealPlan.created_at.desc())
    result = await db.execute(stmt)
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
    Idempotent — creates only missing rows (e.g. after bookmark-before-save).
    """
    plan = await _get_plan_or_404(db, plan_id, user.id)

    created = await sync_generated_meals_from_plan(db, plan, user.id)
    await db.commit()

    if created > 0:
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


# ── Phase 7 endpoints ─────────────────────────────────────────────────────────


@router.patch("/{plan_id}", response_model=MealPlanRead)
async def patch_meal_plan(
    plan_id: uuid.UUID,
    body: PatchMealPlanRequest,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> MealPlan:
    """Update name, status, or scheduled_week on an existing plan."""
    plan = await _get_plan_or_404(db, plan_id, user.id)
    if body.name is not None:
        plan.name = body.name
    if body.status is not None:
        plan.status = body.status
        if body.status == "reviewing":
            await sync_generated_meals_from_plan(db, plan, user.id)
    if body.scheduled_week is not None:
        plan.scheduled_week = body.scheduled_week
    await db.commit()
    await db.refresh(plan)
    return plan


@router.post("/{plan_id}/approve", response_model=MealPlanRead)
async def approve_meal_plan(
    plan_id: uuid.UUID,
    body: ApprovePlanRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> MealPlan:
    """
    Approve a plan: validates that every generated_meal is 'accepted',
    then sets status='approved', approved_at, and the user-supplied name.

    When accept_all=True, pending meals are marked accepted before approval.
    """
    plan = await _get_plan_or_404(db, plan_id, user.id)

    meals_result = await db.execute(
        select(GeneratedMeal).where(GeneratedMeal.meal_plan_id == plan_id)
    )
    meals = meals_result.scalars().all()

    if not meals:
        raise HTTPException(
            status_code=422,
            detail="Plan has no meals yet. Save the plan first.",
        )

    if body.accept_all:
        for meal in meals:
            if meal.approval_status == "pending":
                meal.approval_status = "accepted"
                background_tasks.add_task(
                    run_with_session,
                    log_signal,
                    user.id,
                    "meal_accepted",
                    {
                        "meal_name": meal.name,
                        "tags": meal.tags,
                        "type": meal.type,
                        "prep_minutes": meal.prep_minutes,
                        "meal_plan_id": str(meal.meal_plan_id),
                    },
                )

    pending = [m for m in meals if m.approval_status == "pending"]
    if pending:
        raise HTTPException(
            status_code=422,
            detail=f"{len(pending)} meal(s) still pending review. Accept or swap all meals before approving.",
        )

    plan.status = "approved"
    plan.approved_at = datetime.now(timezone.utc)
    plan.name = body.name
    await db.commit()
    await db.refresh(plan)
    return plan


@router.post("/{plan_id}/clone", response_model=MealPlanRead, status_code=201)
async def clone_meal_plan(
    plan_id: uuid.UUID,
    body: SchedulePlanRequest,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> MealPlan:
    """
    Clone an approved plan to a new scheduled week.
    The clone starts as 'draft' with all meals reset to 'pending'.
    """
    source = await _get_plan_or_404(db, plan_id, user.id)
    if source.status != "approved":
        raise HTTPException(
            status_code=422,
            detail="Only approved plans can be cloned.",
        )

    clone = MealPlan(
        user_id=user.id,
        week_start=body.scheduled_week,
        diet_type=source.diet_type,
        plan_data=source.plan_data,
        nutrition_avg=source.nutrition_avg,
        plan_days=source.plan_days,
        status="draft",
        name=source.name,
        scheduled_week=body.scheduled_week,
    )
    db.add(clone)
    await db.flush()

    # Re-flatten generated_meals for the clone, all pending
    for day, day_meals in source.plan_data.get("days", {}).items():
        for meal_type, meal in day_meals.items():
            if meal_type in ("snacks", "extras", "juices") or not isinstance(meal, dict):
                continue
            db.add(
                GeneratedMeal(
                    user_id=user.id,
                    meal_plan_id=clone.id,
                    day=day,
                    meal_type=meal_type,
                    name=meal["name"],
                    type=meal.get("type", ""),
                    description=meal.get("description"),
                    tags=meal.get("tags", []),
                    prep_minutes=meal.get("prep_minutes"),
                    saved=False,
                    approval_status="pending",
                )
            )
        # Juice slots
        for j_idx, juice in enumerate(day_meals.get("juices", [])):
            if not isinstance(juice, dict):
                continue
            db.add(
                GeneratedMeal(
                    user_id=user.id,
                    meal_plan_id=clone.id,
                    day=day,
                    meal_type=f"juice_{j_idx}",
                    name=juice.get("name", "Juice"),
                    type="juice",
                    description=juice.get("description"),
                    tags=juice.get("tags", []),
                    prep_minutes=juice.get("prep_minutes"),
                    saved=False,
                    approval_status="pending",
                )
            )

    await db.commit()
    await db.refresh(clone)
    return clone


@router.patch("/{plan_id}/schedule", response_model=MealPlanRead)
async def schedule_meal_plan(
    plan_id: uuid.UUID,
    body: SchedulePlanRequest,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> MealPlan:
    """Assign a saved plan to a specific calendar week (Monday date)."""
    plan = await _get_plan_or_404(db, plan_id, user.id)
    plan.scheduled_week = body.scheduled_week
    await db.commit()
    await db.refresh(plan)
    return plan


@router.patch("/{plan_id}/meals/{meal_id}", response_model=GeneratedMealRead)
async def patch_generated_meal(
    plan_id: uuid.UUID,
    meal_id: uuid.UUID,
    body: PatchGeneratedMealRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> GeneratedMeal:
    """
    Accept a meal (action='accept') or accept with inline edit (action='edit').
    Both transitions set approval_status='accepted'.
    """
    await _get_plan_or_404(db, plan_id, user.id)
    meal = await _get_meal_or_404(db, meal_id, plan_id)

    if body.action == "edit":
        if body.name:
            meal.name = body.name
        if body.description:
            meal.description = body.description
        meal.edited_manually = True

    meal.approval_status = "accepted"
    await db.commit()
    await db.refresh(meal)

    background_tasks.add_task(
        run_with_session,
        log_signal,
        user.id,
        "meal_accepted",
        {
            "meal_name": meal.name,
            "tags": meal.tags,
            "type": meal.type,
            "prep_minutes": meal.prep_minutes,
            "meal_plan_id": str(meal.meal_plan_id),
        },
    )
    return meal


@router.post("/{plan_id}/meals/{meal_id}/swap", response_model=GeneratedMealRead, status_code=201)
async def swap_generated_meal(
    plan_id: uuid.UUID,
    meal_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> GeneratedMeal:
    """
    AI regenerate a single meal slot. Marks the old meal 'swapped',
    creates a new meal row with status 'pending'. User must accept the new suggestion.
    Logs a meal_swapped signal.
    """
    await _get_plan_or_404(db, plan_id, user.id)
    old_meal = await _get_meal_or_404(db, meal_id, plan_id)

    new_meal = await swap_meal(db=db, old_meal=old_meal, user_id=user.id)

    background_tasks.add_task(
        run_with_session,
        log_signal,
        user.id,
        "meal_swapped",
        {
            "meal_name": old_meal.name,
            "tags": old_meal.tags,
            "meal_type": old_meal.meal_type,
            "day": old_meal.day,
        },
    )
    return new_meal


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


async def _get_meal_or_404(
    db: AsyncSession, meal_id: uuid.UUID, plan_id: uuid.UUID
) -> GeneratedMeal:
    result = await db.execute(
        select(GeneratedMeal).where(
            GeneratedMeal.id == meal_id,
            GeneratedMeal.meal_plan_id == plan_id,
        )
    )
    meal = result.scalar_one_or_none()
    if meal is None:
        raise HTTPException(status_code=404, detail="Generated meal not found.")
    return meal
