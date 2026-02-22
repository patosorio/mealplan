from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from models import UserSignal

logger = logging.getLogger(__name__)


async def log_signal(
    db: AsyncSession,
    user_id: uuid.UUID,
    signal_type: str,
    payload: dict[str, Any],
) -> None:
    """
    Append-only signal logger. Fire-and-forget — never raises.
    Call from any router or service; never call from the frontend.
    """
    try:
        db.add(UserSignal(user_id=user_id, signal_type=signal_type, payload=payload))
        await db.commit()
    except Exception:
        logger.exception("Failed to log signal %s for user %s", signal_type, user_id)
