from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from db.session import get_db
from models import User


async def get_current_db_user(
    token: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Resolves the Firebase-verified token to a full ORM User object.
    Raises 404 if the user hasn't called /auth/me yet (i.e. not in DB).
    """
    result = await db.execute(select(User).where(User.firebase_uid == token["uid"]))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found. Call GET /auth/me first.",
        )
    return user
