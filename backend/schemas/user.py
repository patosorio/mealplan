from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    firebase_uid: str
    email: str
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    created_at: datetime


class UserPreferencesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    diet_type: str
    calories_target: int
    excluded_ingredients: list[str]
    preferences_text: Optional[str] = None
    updated_at: datetime


class UserPreferencesUpdate(BaseModel):
    diet_type: Optional[str] = None
    calories_target: Optional[int] = None
    excluded_ingredients: Optional[list[str]] = None
    preferences_text: Optional[str] = None
