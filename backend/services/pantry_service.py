from __future__ import annotations

"""
Pantry service — business logic for pantry item management.
Separates query/mutation logic from the router layer.
"""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PantryItem


async def get_pantry(db: AsyncSession, user_id: uuid.UUID) -> list[PantryItem]:
    result = await db.execute(
        select(PantryItem)
        .where(PantryItem.user_id == user_id)
        .order_by(PantryItem.category.nulls_last(), PantryItem.name)
    )
    return list(result.scalars().all())


async def add_item(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    quantity: str | None,
    category: str | None,
) -> PantryItem:
    item = PantryItem(
        user_id=user_id,
        name=name.strip(),
        quantity=quantity,
        category=category,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def update_item(
    db: AsyncSession,
    item: PantryItem,
    name: str | None,
    quantity: str | None,
    category: str | None,
) -> PantryItem:
    if name is not None:
        item.name = name.strip()
    if quantity is not None:
        item.quantity = quantity
    if category is not None:
        item.category = category
    await db.commit()
    await db.refresh(item)
    return item


async def delete_item(db: AsyncSession, item: PantryItem) -> None:
    await db.delete(item)
    await db.commit()


async def upsert_pantry_item(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    category: str | None = None,
) -> PantryItem:
    """Add pantry item if missing (case-insensitive name match)."""
    clean_name = name.strip()
    if not clean_name:
        raise ValueError("Pantry item name is required.")

    result = await db.execute(
        select(PantryItem).where(PantryItem.user_id == user_id)
    )
    for item in result.scalars().all():
        if item.name.lower() == clean_name.lower():
            return item

    return await add_item(db, user_id, clean_name, None, category)


async def clear_all(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        delete(PantryItem).where(PantryItem.user_id == user_id)
    )
    await db.commit()
    return result.rowcount  # type: ignore[return-value]
