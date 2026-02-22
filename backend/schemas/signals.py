from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class UserTasteProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    favourite_cuisines: Optional[list[str]] = None
    favourite_ingredients: Optional[list[str]] = None
    favourite_tags: Optional[list[str]] = None
    disliked_signals: Optional[list[str]] = None
    preferred_prep_time: Optional[int] = None
    actual_raw_ratio: Optional[float] = None
    avg_weekly_plans: Optional[float] = None
    recent_meal_names: Optional[list[str]] = None
    top_search_terms: Optional[list[str]] = None
    signal_count: int
    last_computed_at: datetime
    updated_at: datetime


class UserSignalCreate(BaseModel):
    """Internal use — log a signal from a router or service."""

    signal_type: str
    payload: dict[str, Any]
