from __future__ import annotations

"""
Shopping list service — diff meal plan ingredients against pantry.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import MealPlan, PantryItem, ShoppingList, UserRecipe

logger = logging.getLogger(__name__)


async def generate_shopping_list(
    db: AsyncSession,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID,
) -> ShoppingList:
    """
    Build a shopping list by diffing meal plan ingredients against pantry.
    Pulls ingredients from plan_data meals, juices, and extras; falls back to
    bookmarked user_recipes linked to this plan when plan_data has no ingredients.
    """
    plan_result = await db.execute(
        select(MealPlan).where(
            MealPlan.id == meal_plan_id,
            MealPlan.user_id == user_id,
        )
    )
    plan = plan_result.scalar_one_or_none()
    if plan is None:
        raise ValueError("Meal plan not found.")

    pantry_result = await db.execute(
        select(PantryItem).where(PantryItem.user_id == user_id)
    )
    pantry_names: set[str] = {
        p.name.lower() for p in pantry_result.scalars().all()
    }

    recipes_result = await db.execute(
        select(UserRecipe).where(
            UserRecipe.user_id == user_id,
            UserRecipe.origin_plan_id == meal_plan_id,
            UserRecipe.deleted_at.is_(None),
        )
    )
    saved_by_slot: dict[tuple[str, str], UserRecipe] = {
        (r.origin_day, r.origin_meal): r
        for r in recipes_result.scalars().all()
        if r.origin_day and r.origin_meal
    }

    raw_ingredients: list[str] = _extract_ingredients(plan.plan_data, saved_by_slot)

    shopping_items: list[dict[str, Any]] = [
        {"name": name, "qty": None, "category": None, "checked": False}
        for name in dict.fromkeys(raw_ingredients)
        if name.lower() not in pantry_names
    ]

    shopping_list = ShoppingList(
        user_id=user_id,
        meal_plan_id=plan.id,
        items=shopping_items,
    )
    db.add(shopping_list)
    await db.commit()
    await db.refresh(shopping_list)

    logger.info(
        "Generated shopping list for user %s — %d items",
        user_id,
        len(shopping_items),
    )
    return shopping_list


def _extract_ingredients(
    plan_data: dict[str, Any],
    saved_by_slot: dict[tuple[str, str], UserRecipe],
) -> list[str]:
    """Collect ingredient names from plan_data and linked saved recipes."""
    ingredients: list[str] = []

    for day, day_meals in plan_data.get("days", {}).items():
        for meal_type in ("breakfast", "lunch", "dinner"):
            meal = day_meals.get(meal_type)
            if isinstance(meal, dict):
                ingredients.extend(
                    _ingredients_for_slot(day, meal_type, meal, saved_by_slot)
                )

        for j_idx, juice in enumerate(day_meals.get("juices", [])):
            if isinstance(juice, dict):
                ingredients.extend(
                    _ingredients_for_slot(day, f"juice_{j_idx}", juice, saved_by_slot)
                )

        for extra in day_meals.get("extras", []):
            if isinstance(extra, dict):
                ingredients.extend(_ingredients_from_item(extra))

    return ingredients


def _ingredients_for_slot(
    day: str,
    slot_key: str,
    item: dict[str, Any],
    saved_by_slot: dict[tuple[str, str], UserRecipe],
) -> list[str]:
    from_plan = _ingredients_from_item(item)
    if from_plan:
        return from_plan

    saved = saved_by_slot.get((day, slot_key))
    if saved and saved.ingredients:
        return _ingredients_from_recipe(saved.ingredients)

    return []


def _ingredients_from_item(item: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for ingredient in item.get("ingredients", []):
        if isinstance(ingredient, str):
            name = ingredient.strip()
        elif isinstance(ingredient, dict):
            name = str(ingredient.get("name", "")).strip()
        else:
            continue
        if name:
            names.append(name)
    return names


def _ingredients_from_recipe(ingredients: list[Any]) -> list[str]:
    names: list[str] = []
    for ingredient in ingredients:
        if isinstance(ingredient, str):
            name = ingredient.strip()
        elif isinstance(ingredient, dict):
            name = str(ingredient.get("name", "")).strip()
        else:
            continue
        if name:
            names.append(name)
    return names
