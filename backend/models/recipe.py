from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class UserRecipe(Base):
    """
    User recipe collection — populated via bookmarks (source='ai_generated')
    in MVP. source + origin fields are ready for manual entries in v2.
    """

    __tablename__ = "user_recipes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ingredients: Mapped[list[Any]] = mapped_column(JSONB, server_default="[]")
    steps: Mapped[list[Any]] = mapped_column(JSONB, server_default="[]")
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text()), server_default="{}")
    diet_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prep_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(Text, server_default="user")

    # Set when source='ai_generated' — traces back to the originating plan
    origin_plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("meal_plans.id", ondelete="SET NULL"),
        nullable=True,
    )
    origin_day: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    origin_meal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # pgvector — used only by GET /recipes/search?q= semantic search
    embedding: Mapped[Optional[list[float]]] = mapped_column(
        Vector(768), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
