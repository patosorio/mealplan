from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_db_user
from db.session import get_db
from models import User, UserPreferences
from schemas import UserPreferencesRead, UserPreferencesUpdate

router = APIRouter(prefix="/users", tags=["preferences"])


@router.get("/preferences", response_model=UserPreferencesRead)
async def get_preferences(
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> UserPreferences:
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="Preferences not found.")
    return prefs


@router.put("/preferences", response_model=UserPreferencesRead)
async def update_preferences(
    body: UserPreferencesUpdate,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> UserPreferences:
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="Preferences not found.")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(prefs, field, value)

    await db.commit()
    await db.refresh(prefs)
    return prefs
