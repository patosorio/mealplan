from __future__ import annotations

from typing import Any

import firebase_admin
from fastapi import HTTPException, Header
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from core.config import settings

if not firebase_admin._apps:
    cred = credentials.Certificate(settings.firebase_service_account_path)
    firebase_admin.initialize_app(cred)


async def get_current_user(
    authorization: str = Header(...),
) -> dict[str, Any]:
    """
    Verifies a Firebase ID token from the Authorization header.
    Raises 401 on any invalid, expired, or revoked token.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header.")
    token = authorization[len("Bearer "):]
    try:
        return firebase_auth.verify_id_token(token)  # type: ignore[return-value]
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token has expired.")
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Token has been revoked.")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")