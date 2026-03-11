from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class UserSignal(Base):
    """
    Append-only event log — never update rows, only insert.

    signal_type values:
      'saved_meal'         → user bookmarked a generated meal (strong positive)
      'added_recipe'       → user manually added a recipe (strong positive)
      'regenerated_day'    → user rejected a meal day (mild negative)
      'recipe_search'      → user searched their recipe collection
      'opened_recipe'      → user opened a recipe detail view (mild interest)
      'shopping_purchased' → user ticked off a shopping item
      'plan_generated'     → a plan was generated (baseline event)
      'plan_saved'         → user explicitly saved a plan to history
    """

    __tablename__ = "user_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    signal_type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UserTasteProfile(Base):
    """
    Materialised taste profile rebuilt from user_signals.
    Rebuilt nightly and immediately after any 'saved_meal' signal.
    Injected into every Claude generation prompt.
    """

    __tablename__ = "user_taste_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Positive signals
    favourite_tags: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(Text()), nullable=True
    )

    # Negative signals — inferred from regenerations
    disliked_signals: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(Text()), nullable=True
    )

    # Behavioural patterns
    preferred_prep_time: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    actual_raw_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # TODO v2: add favourite_cuisines inferred from meal tags/names
    # TODO v2: add favourite_ingredients inferred from recipe content
    # TODO v2: add avg_weekly_plans from plan_generated signal count

    # Recent history — used to avoid repetition in next generation
    recent_meal_names: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(Text()), nullable=True
    )
    top_search_terms: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(Text()), nullable=True
    )

    signal_count: Mapped[int] = mapped_column(Integer, server_default="0")
    last_computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
