from __future__ import annotations

"""
Rate limiting via Upstash Redis.

Uses a sliding-window counter (INCR + EXPIRE) over a Redis key scoped to
(firebase_uid, endpoint). Pure async — does not block the event loop.

Configuration via env vars:
  UPSTASH_REDIS_URL — redis+tls://... or redis://...
"""

import base64
import json
import logging

import redis.asyncio as aioredis
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from core.config import settings

logger = logging.getLogger(__name__)

# (path_suffix, per-hour limit)
_RATE_LIMITS: list[tuple[str, int]] = [
    ("/meal-plans/generate", 5),
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


def _extract_firebase_uid(authorization: str) -> str:
    """
    Decode the Firebase UID from a Bearer JWT without re-verifying the signature.
    Firebase JWTs carry the UID in the `sub` (subject) claim of the payload.

    Falls back to an anonymous key if the header is absent or malformed —
    rate limiting degrades gracefully rather than blocking legitimate requests.
    The actual signature verification still happens in get_current_user().
    """
    try:
        parts = authorization.split(" ", 1)
        if len(parts) != 2 or parts[0] != "Bearer":
            return "anonymous"
        token = parts[1].strip()
        # JWT structure: header.payload.signature (all base64url-encoded)
        payload_segment = token.split(".")[1]
        # base64url may omit padding — add it back before decoding
        padding = 4 - len(payload_segment) % 4
        if padding != 4:
            payload_segment += "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(payload_segment))
        uid: str = payload.get("sub") or payload.get("uid") or "anonymous"
        return uid
    except Exception:
        return "anonymous"


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
        for suffix, limit in _RATE_LIMITS:
            if path.endswith(suffix) or path == suffix:
                matching_limit = limit
                break

        if matching_limit is None:
            return await call_next(request)

        redis = _get_redis()
        if redis is None:
            return await call_next(request)

        uid = _extract_firebase_uid(request.headers.get("authorization") or "")

        await _check_rate_limit(
            redis=redis,
            user_id=uid,
            endpoint=path,
            limit=matching_limit,
        )

        return await call_next(request)
