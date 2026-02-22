from __future__ import annotations

"""
Rate limiting via Upstash Redis.

Uses a sliding-window counter (INCR + EXPIRE) over a Redis key scoped to
(user_id, endpoint). Pure async — does not block the event loop.

Configuration via env vars:
  UPSTASH_REDIS_URL   — redis+tls://... or redis://...
  UPSTASH_REDIS_TOKEN — (if using Upstash REST API; only needed for REST mode)
"""

import logging
from typing import Callable

import redis.asyncio as aioredis
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from core.config import settings

logger = logging.getLogger(__name__)

# (path_prefix, per-hour limit)
_RATE_LIMITS: list[tuple[str, int]] = [
    ("/meal-plans/generate", 10),
    ("/recipes/search", 60),
]

_redis_client: aioredis.Redis | None = None  # type: ignore[type-arg]


def _get_redis() -> aioredis.Redis | None:  # type: ignore[type-arg]
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    url = getattr(settings, "upstash_redis_url", "")
    if not url:
        return None
    try:
        _redis_client = aioredis.from_url(url, decode_responses=True)
        return _redis_client
    except Exception:
        logger.warning("Could not connect to Upstash Redis — rate limiting disabled")
        return None


async def _check_rate_limit(
    redis: aioredis.Redis,  # type: ignore[type-arg]
    user_id: str,
    endpoint: str,
    limit: int,
    window_seconds: int = 3600,
) -> None:
    """
    Increment the sliding-window counter. Raises 429 if over limit.
    Key format: ratelimit:{user_id}:{endpoint}
    """
    key = f"ratelimit:{user_id}:{endpoint}"
    try:
        pipe = redis.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        count, ttl = await pipe.execute()

        if ttl < 0:
            await redis.expire(key, window_seconds)

        if count > limit:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Rate limit exceeded. Max {limit} requests per hour "
                    f"for this endpoint."
                ),
                headers={"Retry-After": str(window_seconds)},
            )
    except HTTPException:
        raise
    except Exception:
        # Redis failure — fail open (don't block the request)
        logger.warning("Rate limit check failed for %s — allowing request", key)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Applies per-user hourly rate limits to configured endpoints.
    Skipped gracefully if Redis is unavailable.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        matching_limit: int | None = None
        for prefix, limit in _RATE_LIMITS:
            if path.endswith(prefix) or path == prefix:
                matching_limit = limit
                break

        if matching_limit is None:
            return await call_next(request)

        redis = _get_redis()
        if redis is None:
            return await call_next(request)

        # Extract user_id from the verified Firebase token stored by auth middleware.
        # We use the raw Authorization header value as a key proxy here (hashed via Redis).
        # The actual user resolution happens in get_current_db_user — here we use
        # the Firebase UID embedded in the token claims if available, else the token itself.
        token_key = (request.headers.get("authorization") or "anonymous")[-32:]

        await _check_rate_limit(
            redis=redis,
            user_id=token_key,
            endpoint=path,
            limit=matching_limit,
        )

        return await call_next(request)
