from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_db_user
from db.session import get_db
from models import PantryItem, User
from schemas import PantryItemCreate, PantryItemRead, PantryItemUpdate

router = APIRouter(prefix="/pantry", tags=["pantry"])


@router.get("", response_model=list[PantryItemRead])
async def list_pantry(
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> list[PantryItem]:
    result = await db.execute(
        select(PantryItem)
        .where(PantryItem.user_id == user.id)
        .order_by(PantryItem.category.nulls_last(), PantryItem.name)
    )
    return list(result.scalars().all())


@router.post("", response_model=PantryItemRead, status_code=201)
async def add_pantry_item(
    body: PantryItemCreate,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> PantryItem:
    item = PantryItem(user_id=user.id, **body.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/{item_id}", response_model=PantryItemRead)
async def update_pantry_item(
    item_id: uuid.UUID,
    body: PantryItemUpdate,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> PantryItem:
    item = await _get_item_or_404(db, item_id, user.id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
async def delete_pantry_item(
    item_id: uuid.UUID,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    item = await _get_item_or_404(db, item_id, user.id)
    await db.delete(item)
    await db.commit()


@router.delete("", status_code=200)
async def clear_pantry(
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    result = await db.execute(
        delete(PantryItem).where(PantryItem.user_id == user.id)
    )
    await db.commit()
    return {"deleted": result.rowcount}


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_item_or_404(
    db: AsyncSession, item_id: uuid.UUID, user_id: uuid.UUID
) -> PantryItem:
    result = await db.execute(
        select(PantryItem).where(
            PantryItem.id == item_id, PantryItem.user_id == user_id
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Pantry item not found.")
    return item
