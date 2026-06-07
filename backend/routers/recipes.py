from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_db_user
from db.session import get_db
from models import GeneratedMeal, MealPlan, User, UserRecipe
from schemas import RecipeExpandedRead, RecipeRead, SaveFromPlanRequest, SaveFromPlanResponse
from services.profile_service import rebuild_taste_profile
from services.recipe_service import (
    expand_recipe_background,
    get_or_expand_recipe,
    search_recipes as svc_search,
)
from services.signal_service import log_signal

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("", response_model=list[RecipeRead])
async def list_recipes(
    origin_plan_id: uuid.UUID | None = Query(None, description="Filter by originating meal plan"),
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserRecipe]:
    stmt = (
        select(UserRecipe)
        .where(UserRecipe.user_id == user.id, UserRecipe.deleted_at.is_(None))
        .order_by(UserRecipe.created_at.desc())
    )
    if origin_plan_id is not None:
        stmt = stmt.where(UserRecipe.origin_plan_id == origin_plan_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/search", response_model=list[RecipeRead])
async def search_recipes(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserRecipe]:
    """
    Semantic search (pgvector + Gemini text-embedding-004) across saved recipes.
    Falls back to ILIKE keyword search when no embeddings exist yet.
    """
    await log_signal(db, user.id, "recipe_search", {"query": q})
    return await svc_search(db, user.id, q)


@router.post("/save-from-plan", response_model=SaveFromPlanResponse, status_code=201)
async def save_from_plan(
    body: SaveFromPlanRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> UserRecipe:
    """
    Bookmark a generated meal into the user's recipe collection.
    Marks generated_meals.saved = True and writes a user_recipes row.
    Supports Phase 8 juice slots via juice_index (stored as origin_meal="juice_N").
    Triggers taste profile rebuild as a background task.
    """
    # Canonical meal type key (e.g. "breakfast" or "juice_0")
    origin_meal_key = (
        f"juice_{body.juice_index}"
        if body.juice_index is not None
        else body.meal_type
    )

    # Reject duplicate saves — skip soft-deleted rows (user can re-save after delete)
    existing = await db.execute(
        select(UserRecipe).where(
            UserRecipe.user_id == user.id,
            UserRecipe.origin_plan_id == body.meal_plan_id,
            UserRecipe.origin_day == body.day,
            UserRecipe.origin_meal == origin_meal_key,
            UserRecipe.deleted_at.is_(None),
        )
    )
    existing_recipe = existing.scalar_one_or_none()
    if existing_recipe is not None:
        return existing_recipe

    # ── Juice path (Phase 8) ───────────────────────────────────────────────────
    if body.juice_index is not None:
        plan_result = await db.execute(
            select(MealPlan).where(
                MealPlan.id == body.meal_plan_id,
                MealPlan.user_id == user.id,
            )
        )
        plan = plan_result.scalar_one_or_none()
        if plan is None:
            raise HTTPException(status_code=404, detail="Meal plan not found.")

        juices = plan.plan_data.get("days", {}).get(body.day, {}).get("juices", [])
        if body.juice_index >= len(juices):
            raise HTTPException(status_code=404, detail="Juice not found.")

        juice_data = juices[body.juice_index]
        juice_tags = list(juice_data.get("tags", []))
        if "juice" not in juice_tags:
            juice_tags.append("juice")
        recipe = UserRecipe(
            user_id=user.id,
            name=juice_data.get("name", "Juice"),
            description=juice_data.get("description"),
            ingredients=[],
            steps=[],
            tags=juice_tags,
            source="ai_generated",
            origin_plan_id=body.meal_plan_id,
            origin_day=body.day,
            origin_meal=origin_meal_key,
        )
        db.add(recipe)
        await db.commit()
        await db.refresh(recipe)

        await log_signal(
            db,
            user.id,
            "recipe_bookmarked",
            {
                "recipe_id": str(recipe.id),
                "meal_plan_id": str(body.meal_plan_id),
                "day": body.day,
                "meal_type": origin_meal_key,
                "tags": recipe.tags,
            },
        )
        background_tasks.add_task(rebuild_taste_profile, user.id)
        return recipe

    # ── Standard meal path ─────────────────────────────────────────────────────
    # Look up GeneratedMeal row (exists only after "Save Plan" has been called)
    result = await db.execute(
        select(GeneratedMeal).where(
            GeneratedMeal.meal_plan_id == body.meal_plan_id,
            GeneratedMeal.day == body.day,
            GeneratedMeal.meal_type == body.meal_type,
            GeneratedMeal.user_id == user.id,
        )
    )
    meal = result.scalar_one_or_none()

    if meal is None:
        # Plan not yet explicitly saved — read meal data from plan_data JSON
        # and create the GeneratedMeal row on-the-fly so bookmarking works
        # immediately after generation without requiring "Save Plan" first.
        plan_result = await db.execute(
            select(MealPlan).where(
                MealPlan.id == body.meal_plan_id,
                MealPlan.user_id == user.id,
            )
        )
        plan = plan_result.scalar_one_or_none()
        if plan is None:
            raise HTTPException(status_code=404, detail="Meal plan not found.")

        meal_data: dict | None = (
            plan.plan_data.get("days", {}).get(body.day, {}).get(body.meal_type)
        )
        if not meal_data or not isinstance(meal_data, dict):
            raise HTTPException(
                status_code=404,
                detail=f"Meal '{body.meal_type}' not found for day '{body.day}'.",
            )

        meal = GeneratedMeal(
            user_id=user.id,
            meal_plan_id=body.meal_plan_id,
            day=body.day,
            meal_type=body.meal_type,
            name=meal_data["name"],
            type=meal_data.get("type", ""),
            description=meal_data.get("description"),
            tags=meal_data.get("tags", []),
            prep_minutes=meal_data.get("prep_minutes"),
            saved=True,
        )
        db.add(meal)
    else:
        meal.saved = True

    meal_tags = list(meal.tags or [])
    if meal.type and meal.type not in meal_tags:
        meal_tags.append(meal.type)

    recipe = UserRecipe(
        user_id=user.id,
        name=meal.name,
        description=meal.description,
        ingredients=[],
        steps=[],
        tags=meal_tags,
        source="ai_generated",
        origin_plan_id=body.meal_plan_id,
        origin_day=body.day,
        origin_meal=origin_meal_key,
    )
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)

    await log_signal(db, user.id, "saved_meal", {
        "meal_name": meal.name,
        "tags": meal.tags or [],
        "type": meal.type,
        "prep_minutes": meal.prep_minutes,
    })

    # Fire-and-forget: rebuild taste profile + pre-expand new recipe
    background_tasks.add_task(rebuild_taste_profile, db, user.id)
    background_tasks.add_task(expand_recipe_background, db, recipe.id, user.id)

    return recipe


@router.get("/{recipe_id}/expand", response_model=RecipeExpandedRead)
async def get_expanded_recipe(
    recipe_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> UserRecipe:
    """
    Get a saved recipe with full ingredients and steps.
    Generates and caches them on first call if not yet expanded.
    """
    return await get_or_expand_recipe(db, recipe_id, user.id)


@router.get("/{recipe_id}", response_model=RecipeRead)
async def get_recipe(
    recipe_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> UserRecipe:
    return await _get_recipe_or_404(db, recipe_id, user.id)


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(
    recipe_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    from datetime import datetime, timezone

    result = await db.execute(
        select(UserRecipe).where(
            UserRecipe.id == recipe_id,
            UserRecipe.user_id == user.id,
        )
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")

    # Idempotent — already soft-deleted
    if recipe.deleted_at is not None:
        return

    recipe.deleted_at = datetime.now(timezone.utc)
    await db.commit()


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_recipe_or_404(
    db: AsyncSession, recipe_id: uuid.UUID, user_id: uuid.UUID
) -> UserRecipe:
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
    return recipe
