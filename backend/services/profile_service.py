from __future__ import annotations

import logging
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import UserSignal, UserTasteProfile

logger = logging.getLogger(__name__)

# Signals that carry positive meal preference data
_POSITIVE_SIGNALS: frozenset[str] = frozenset({"saved_meal", "opened_recipe"})

# Signals that indicate mild negative preference
_NEGATIVE_SIGNALS: frozenset[str] = frozenset({"regenerated_day"})


async def rebuild_taste_profile(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> None:
    """
    Pure aggregation — rebuilds the user_taste_profiles row from user_signals.
    No AI calls. Safe to call from a BackgroundTask or Cloud Scheduler job.
    Never raises; logs on failure.
    """
    try:
        await _rebuild(db, user_id)
    except Exception:
        logger.exception("Failed to rebuild taste profile for user %s", user_id)


async def _rebuild(db: AsyncSession, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserSignal)
        .where(UserSignal.user_id == user_id)
        .order_by(UserSignal.created_at.desc())
    )
    signals: list[UserSignal] = list(result.scalars().all())

    if not signals:
        return

    # ── Aggregate tag frequencies from positive signals ────────────────────────
    tag_counter: Counter[str] = Counter()
    meal_names: list[str] = []
    search_terms: list[str] = []
    disliked: list[str] = []
    prep_times: list[int] = []
    raw_count = 0
    cooked_count = 0

    for sig in signals:
        payload: dict[str, Any] = sig.payload or {}

        if sig.signal_type in _POSITIVE_SIGNALS:
            for tag in payload.get("tags", []):
                tag_counter[tag] += 1
            if meal_name := payload.get("meal_name"):
                meal_names.append(meal_name)
            if prep := payload.get("prep_minutes"):
                prep_times.append(int(prep))
            meal_type = payload.get("type", "")
            if meal_type == "raw":
                raw_count += 1
            elif meal_type == "cooked":
                cooked_count += 1

        elif sig.signal_type in _NEGATIVE_SIGNALS:
            for tag in payload.get("tags", []):
                disliked.append(tag)

        elif sig.signal_type == "recipe_search":
            if query := payload.get("query"):
                search_terms.append(str(query))

    # ── Derive summary fields ─────────────────────────────────────────────────
    top_tags = [tag for tag, _ in tag_counter.most_common(20)]
    avg_prep = int(sum(prep_times) / len(prep_times)) if prep_times else None
    total_typed = raw_count + cooked_count
    actual_raw_ratio = (raw_count / total_typed) if total_typed > 0 else None

    # Deduplicate while preserving recency order
    seen: set[str] = set()
    unique_meal_names: list[str] = []
    for name in meal_names:
        if name not in seen:
            seen.add(name)
            unique_meal_names.append(name)

    # Deduplicate disliked tags, most-regenerated first
    disliked_counter: Counter[str] = Counter(disliked)
    top_disliked = [tag for tag, _ in disliked_counter.most_common(10)]

    # Deduplicate search terms, most-recent first
    seen_searches: set[str] = set()
    unique_searches: list[str] = []
    for term in search_terms:
        if term not in seen_searches:
            seen_searches.add(term)
            unique_searches.append(term)

    now = datetime.now(tz=timezone.utc)

    # ── Upsert user_taste_profiles ─────────────────────────────────────────────
    existing = await db.execute(
        select(UserTasteProfile).where(UserTasteProfile.user_id == user_id)
    )
    profile = existing.scalar_one_or_none()

    if profile is None:
        db.add(
            UserTasteProfile(
                user_id=user_id,
                favourite_tags=top_tags,
                disliked_signals=top_disliked,
                preferred_prep_time=avg_prep,
                actual_raw_ratio=actual_raw_ratio,
                recent_meal_names=unique_meal_names[:30],
                top_search_terms=unique_searches[:20],
                signal_count=len(signals),
                last_computed_at=now,
            )
        )
    else:
        await db.execute(
            update(UserTasteProfile)
            .where(UserTasteProfile.user_id == user_id)
            .values(
                favourite_tags=top_tags,
                disliked_signals=top_disliked,
                preferred_prep_time=avg_prep,
                actual_raw_ratio=actual_raw_ratio,
                recent_meal_names=unique_meal_names[:30],
                top_search_terms=unique_searches[:20],
                signal_count=len(signals),
                last_computed_at=now,
            )
        )

    await db.commit()
    logger.info(
        "Rebuilt taste profile for user %s — %d signals processed",
        user_id,
        len(signals),
    )
