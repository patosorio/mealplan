from __future__ import annotations

import json
import logging
import secrets
from typing import Any

import firebase_admin
from fastapi import Header, HTTPException
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from core.config import settings

logger = logging.getLogger(__name__)


def _init_firebase() -> None:
    """
    Initialise Firebase Admin SDK from the service account JSON string.
    Called once at import time.
    In development, missing credentials log a warning instead of crashing so
    the server can still start for non-auth routes.
    In production, missing or malformed credentials raise immediately.
    """
    if firebase_admin._apps:
        return
    if not settings.firebase_service_account_json:
        if settings.environment == "development":
            logger.warning(
                "FIREBASE_SERVICE_ACCOUNT_JSON is not set. "
                "Auth-protected endpoints will return 503 until it is configured."
            )
            return
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT_JSON is not set. "
            "Provide the full service account JSON as a single-line string."
        )
    try:
        sa_dict = json.loads(settings.firebase_service_account_json)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: {exc}"
        ) from exc
    cred = credentials.Certificate(sa_dict)
    firebase_admin.initialize_app(cred)


_init_firebase()


async def get_current_user(
    authorization: str = Header(...),
) -> dict[str, Any]:
    """
    Verifies a Firebase ID token from the Authorization header.
    Raises 401 on any invalid, expired, or revoked token.
    Scheme must be exactly "Bearer" (case-sensitive); token must be non-empty.
    """
    if not firebase_admin._apps:
        raise HTTPException(
            status_code=503,
            detail="Firebase is not configured on this server.",
        )
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0] != "Bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid authorization header.")
    token = parts[1].strip()
    try:
        return firebase_auth.verify_id_token(token)  # type: ignore[return-value]
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token has expired.")
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Token has been revoked.")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")


async def verify_internal_token(
    x_internal_token: str = Header(..., alias="X-Internal-Token"),
) -> None:
    """
    Dependency for POST /internal/* endpoints.
    Compares the X-Internal-Token header against settings.internal_secret
    using a constant-time comparison to prevent timing attacks.
    Raises 403 on mismatch or missing header.
    In development with no secret configured, the check is skipped.
    """
    if settings.environment != "production" and not settings.internal_secret:
        return  # Skip in local dev when secret is not set

    if not settings.internal_secret:
        raise HTTPException(
            status_code=500,
            detail="INTERNAL_SECRET is not configured on this server.",
        )

    if not secrets.compare_digest(x_internal_token, settings.internal_secret):
        raise HTTPException(status_code=403, detail="Forbidden.")
