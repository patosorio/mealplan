from __future__ import annotations

"""
Shopping list service — diff meal plan ingredients against pantry.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import MealPlan, PantryItem, ShoppingList

logger = logging.getLogger(__name__)


async def generate_shopping_list(
    db: AsyncSession,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID,
) -> ShoppingList:
    """
    Build a shopping list by diffing meal plan ingredients against pantry.
    Returns the persisted ShoppingList row.
    Raises ValueError if the meal plan is not found or doesn't belong to the user.
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

    raw_ingredients: list[str] = _extract_ingredients(plan.plan_data)

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


def _extract_ingredients(plan_data: dict[str, Any]) -> list[str]:
    """
    Extract ingredient names from plan_data JSONB.
    Handles both plain string lists and {name: ...} dict lists.
    """
    ingredients: list[str] = []
    for day_meals in plan_data.get("days", {}).values():
        for meal_type, meal in day_meals.items():
            if meal_type == "snacks" or not isinstance(meal, dict):
                continue
            for ingredient in meal.get("ingredients", []):
                if isinstance(ingredient, str):
                    name = ingredient.strip()
                elif isinstance(ingredient, dict):
                    name = str(ingredient.get("name", "")).strip()
                else:
                    continue
                if name:
                    ingredients.append(name)
    return ingredients
