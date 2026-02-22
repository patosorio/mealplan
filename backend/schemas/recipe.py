from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class RecipeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: Optional[str] = None
    ingredients: list[Any]
    steps: list[Any]
    tags: list[str]
    diet_type: Optional[str] = None
    prep_minutes: Optional[int] = None
    source: str
    origin_plan_id: Optional[uuid.UUID] = None
    origin_day: Optional[str] = None
    origin_meal: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SaveFromPlanRequest(BaseModel):
    meal_plan_id: uuid.UUID
    day: str
    meal_type: str


class SaveFromPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    source: str
    origin_plan_id: Optional[uuid.UUID] = None
    origin_day: Optional[str] = None
    origin_meal: Optional[str] = None
    created_at: datetime
