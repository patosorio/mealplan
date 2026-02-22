import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.auth import get_current_user
from db.session import get_db
from models import User, UserPreferences
from schemas import UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserProfile)
async def get_me(
    token: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    firebase_uid: str = token["uid"]
    email: str = token.get("email", "")
    display_name: str | None = token.get("name")
    photo_url: str | None = token.get("picture")

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            id=uuid.uuid4(),
            firebase_uid=firebase_uid,
            email=email,
            display_name=display_name,
            photo_url=photo_url,
        )
        db.add(user)
        db.add(UserPreferences(id=uuid.uuid4(), user_id=user.id))
        await db.commit()
        await db.refresh(user)

    return user
