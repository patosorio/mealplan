from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

T = TypeVar("T")


async def run_with_session(
    fn: Callable[..., Awaitable[T]],
    *args: Any,
    **kwargs: Any,
) -> T | None:
    """Run an async task with a fresh DB session (safe for BackgroundTasks)."""
    async with AsyncSessionLocal() as session:
        try:
            return await fn(session, *args, **kwargs)
        except Exception:
            logger.exception("Background task failed: %s", fn.__name__)
            return None
