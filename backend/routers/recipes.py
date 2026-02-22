from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_db_user
from db.session import get_db
from models import GeneratedMeal, User, UserRecipe
from schemas import RecipeRead, SaveFromPlanRequest, SaveFromPlanResponse
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
    q: str = Query(..., min_length=1, description="Search query"),
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserRecipe]:
    """
    Keyword search across recipe names and descriptions.
    Phase 3 upgrades this to pgvector semantic search via Gemini embeddings.
    """
    await log_signal(db, user.id, "recipe_search", {"query": q})

    like = f"%{q}%"
    result = await db.execute(
        select(UserRecipe)
        .where(
            UserRecipe.user_id == user.id,
            UserRecipe.name.ilike(like) | UserRecipe.description.ilike(like),
        )
        .order_by(UserRecipe.created_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())


@router.post("/save-from-plan", response_model=SaveFromPlanResponse)
async def save_from_plan(
    body: SaveFromPlanRequest,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> UserRecipe:
    """
    Bookmark a generated meal into the user's recipe collection.
    Marks generated_meals.saved = True and writes a user_recipes row.
    Phase 3 will also trigger corpus ingestion + pgvector embedding.
    """
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
        raise HTTPException(status_code=404, detail="Generated meal not found.")

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
