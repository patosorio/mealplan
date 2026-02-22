from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from core.dependencies import get_current_db_user
from db.session import get_db
from models import ShoppingList, User
from schemas import GenerateShoppingListRequest, ShoppingItemToggle, ShoppingListRead
from services.shopping_service import generate_shopping_list as svc_generate
from services.signal_service import log_signal

router = APIRouter(prefix="/shopping", tags=["shopping"])


@router.post("/generate", response_model=ShoppingListRead, status_code=201)
async def generate_shopping_list(
    body: GenerateShoppingListRequest,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> ShoppingList:
    """
    Diff the meal plan's ingredient list against the user's pantry and
    produce a shopping list with only the missing items.
    """
    try:
        return await svc_generate(db, user.id, body.meal_plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{list_id}", response_model=ShoppingListRead)
async def get_shopping_list(
    list_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> ShoppingList:
    return await _get_list_or_404(db, list_id, user.id)


@router.patch("/{list_id}/items/{item_idx}", response_model=ShoppingListRead)
async def toggle_shopping_item(
    list_id: uuid.UUID,
    item_idx: int,
    body: ShoppingItemToggle,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> ShoppingList:
    """
    Toggle the checked state of a single item (addressed by its 0-based index).
    Logs a 'shopping_purchased' signal when an item is checked off.
    """
    shopping_list = await _get_list_or_404(db, list_id, user.id)

    items = list(shopping_list.items)
    if item_idx < 0 or item_idx >= len(items):
        raise HTTPException(status_code=404, detail="Shopping item not found.")

    items[item_idx] = {**items[item_idx], "checked": body.checked}
    shopping_list.items = items
    flag_modified(shopping_list, "items")

    await db.commit()
    await db.refresh(shopping_list)

    if body.checked:
        await log_signal(db, user.id, "shopping_purchased", {
            "item_name": items[item_idx].get("name"),
            "category": items[item_idx].get("category"),
        })

    return shopping_list


@router.delete("/{list_id}", status_code=204)
async def delete_shopping_list(
    list_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    shopping_list = await _get_list_or_404(db, list_id, user.id)
    await db.delete(shopping_list)
    await db.commit()


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_list_or_404(
    db: AsyncSession, list_id: uuid.UUID, user_id: uuid.UUID
) -> ShoppingList:
    result = await db.execute(
        select(ShoppingList).where(
            ShoppingList.id == list_id, ShoppingList.user_id == user_id
        )
    )
    shopping_list = result.scalar_one_or_none()
    if shopping_list is None:
        raise HTTPException(status_code=404, detail="Shopping list not found.")
    return shopping_list
