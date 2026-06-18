from __future__ import annotations

"""
Shopping list service — diff meal plan ingredients against pantry.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from models import MealPlan, PantryItem, ShoppingList, UserRecipe

logger = logging.getLogger(__name__)


async def get_shopping_list_for_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID,
) -> ShoppingList | None:
    """Return the most recent shopping list for a meal plan, if any."""
    result = await db.execute(
        select(ShoppingList)
        .where(
            ShoppingList.user_id == user_id,
            ShoppingList.meal_plan_id == meal_plan_id,
        )
        .order_by(ShoppingList.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def generate_shopping_list(
    db: AsyncSession,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID,
) -> ShoppingList:
    """
    Build or refresh a shopping list by diffing meal plan ingredients against pantry.
    Reuses an existing list for the same plan when present, preserving checked state.
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

    new_item_names = [
        name
        for name in dict.fromkeys(raw_ingredients)
        if name.lower() not in pantry_names
    ]

    existing = await get_shopping_list_for_plan(db, user_id, meal_plan_id)
    checked_by_name: dict[str, bool] = {}
    if existing:
        for item in existing.items:
            name = str(item.get("name", "")).strip()
            if name:
                checked_by_name[name.lower()] = bool(item.get("checked"))

    shopping_items: list[dict[str, Any]] = [
        {
            "name": name,
            "qty": None,
            "category": None,
            "checked": checked_by_name.get(name.lower(), False),
        }
        for name in new_item_names
    ]

    snapshot = {
        "plan_name": plan.name,
        "week_start": str(plan.week_start),
        "scheduled_week": str(plan.scheduled_week) if plan.scheduled_week else None,
        "diet_type": plan.diet_type,
    }

    if existing:
        existing.items = shopping_items
        existing.plan_snapshot = snapshot
        flag_modified(existing, "items")
        flag_modified(existing, "plan_snapshot")
        await db.commit()
        await db.refresh(existing)
        shopping_list = existing
    else:
        shopping_list = ShoppingList(
            user_id=user_id,
            meal_plan_id=plan.id,
            items=shopping_items,
            plan_snapshot=snapshot,
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
