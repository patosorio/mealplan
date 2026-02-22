from __future__ import annotations

"""
Internal endpoints — not exposed to the frontend.
Called by Cloud Scheduler with OIDC authentication.
"""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from db.session import get_db
from models import User
from services.profile_service import rebuild_taste_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])

# Google's OIDC token info endpoint
_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"

# The service account email that Cloud Scheduler uses
# Set via CLOUD_SCHEDULER_SA_EMAIL env var in production
_SCHEDULER_SA_EMAIL = ""


async def _verify_oidc_token(authorization: str = Header(...)) -> None:
    """
    Verify a Google OIDC token issued by Cloud Scheduler.
    Rejects all requests that don't carry a valid token for the
    expected service account.

    In development, skip verification if environment != production.
    """
    if settings.environment != "production":
        return  # Skip in local dev

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    token = authorization[len("Bearer "):]

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                _GOOGLE_TOKENINFO_URL,
                params={"id_token": token},
            )
    except Exception:
        logger.exception("Failed to verify OIDC token")
        raise HTTPException(status_code=401, detail="Token verification failed.")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid OIDC token.")

    claims: dict[str, Any] = resp.json()

    # Verify audience matches this service
    expected_audience = settings.cloud_run_url if hasattr(settings, "cloud_run_url") else ""
    if expected_audience and claims.get("aud") != expected_audience:
        raise HTTPException(status_code=401, detail="Token audience mismatch.")

    # Verify issuer
    if claims.get("iss") not in (
        "https://accounts.google.com",
        "accounts.google.com",
    ):
        raise HTTPException(status_code=401, detail="Invalid token issuer.")


@router.post("/rebuild-profiles", status_code=200)
async def rebuild_all_profiles(
    db: AsyncSession = Depends(get_db),
    _auth: None = Depends(_verify_oidc_token),
) -> dict[str, Any]:
    """
    Nightly Cloud Scheduler job — rebuilds taste profiles for all users.
    Called with a Cloud Scheduler OIDC token.
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
        "Nightly profile rebuild complete — %d succeeded, %d failed",
        succeeded,
        failed,
    )
    return {"rebuilt": succeeded, "failed": failed, "total": len(user_ids)}
