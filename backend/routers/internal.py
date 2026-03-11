from __future__ import annotations

"""
Internal endpoints — not exposed to the frontend.
Protected by X-Internal-Token header (see core/auth.py:verify_internal_token).
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import verify_internal_token
from db.session import get_db
from models import User
from services.profile_service import rebuild_taste_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/rebuild-profiles", status_code=200)
async def rebuild_all_profiles(
    db: AsyncSession = Depends(get_db),
    _auth: None = Depends(verify_internal_token),
) -> dict[str, Any]:
    """
    Nightly job — rebuilds taste profiles for all users.
    Protected by X-Internal-Token shared secret.
    """
    result = await db.execute(select(User.id))
    user_ids = list(result.scalars().all())

    succeeded = 0
    failed = 0
    for uid in user_ids:
        try:
            await rebuild_taste_profile(db, uid)
            succeeded += 1
        except Exception:
            logger.exception("Profile rebuild failed for user %s", uid)
            failed += 1

    logger.info(
        "Profile rebuild complete — %d succeeded, %d failed",
        succeeded,
        failed,
    )
    return {"rebuilt": succeeded, "failed": failed, "total": len(user_ids)}
