from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_db_user
from db.session import get_db
from models import GeneratedMeal, MealPlan, User, UserRecipe
from schemas import RecipeRead, SaveFromPlanRequest, SaveFromPlanResponse
from services.profile_service import rebuild_taste_profile
from services.recipe_service import search_recipes as svc_search
from services.signal_service import log_signal

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("", response_model=list[RecipeRead])
async def list_recipes(
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserRecipe]:
    result = await db.execute(
        select(UserRecipe)
        .where(UserRecipe.user_id == user.id)
        .order_by(UserRecipe.created_at.desc())
    )
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
    Triggers taste profile rebuild as a background task.
    """
    # Reject duplicate saves early
    existing = await db.execute(
        select(UserRecipe).where(
            UserRecipe.user_id == user.id,
            UserRecipe.origin_plan_id == body.meal_plan_id,
            UserRecipe.origin_day == body.day,
            UserRecipe.origin_meal == body.meal_type,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Meal already saved to recipes.")

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

    recipe = UserRecipe(
        user_id=user.id,
        name=meal.name,
        description=meal.description,
        ingredients=[],
        steps=[],
        tags=meal.tags or [],
        source="ai_generated",
        origin_plan_id=body.meal_plan_id,
        origin_day=body.day,
        origin_meal=body.meal_type,
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

    # Fire-and-forget: rebuild taste profile
    background_tasks.add_task(rebuild_taste_profile, db, user.id)

    return recipe


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
    recipe = await _get_recipe_or_404(db, recipe_id, user.id)
    await db.delete(recipe)
    await db.commit()


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_recipe_or_404(
    db: AsyncSession, recipe_id: uuid.UUID, user_id: uuid.UUID
) -> UserRecipe:
    result = await db.execute(
        select(UserRecipe).where(
            UserRecipe.id == recipe_id, UserRecipe.user_id == user_id
        )
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    return recipe
