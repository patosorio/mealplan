from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class RecipeIngredient(BaseModel):
    name: str
    amount: str
    notes: str = ""

    @field_validator("notes", mode="before")
    @classmethod
    def coerce_notes(cls, v: object) -> str:
        return "" if v is None else str(v)


class RecipeStep(BaseModel):
    step: int
    instruction: str


class RecipeExpandedRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: Optional[str] = None
    tags: list[str]
    diet_type: Optional[str] = None
    prep_minutes: Optional[int] = None
    ingredients: list[RecipeIngredient]
    steps: list[RecipeStep]
    source: str
    created_at: datetime


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


class RecipeDraft(BaseModel):
    """Returned by /import/extract — not yet saved to DB."""

    name: str
    description: str
    ingredients: list[RecipeIngredient]
    steps: list[RecipeStep]
    tags: list[str]
    diet_type: str | None
    prep_minutes: int | None
    extraction_confidence: Literal["high", "medium", "low"]
    input_interpretation: str


class RecipeImportConfirmRequest(BaseModel):
    """User-edited draft sent back for saving."""

    name: str
    description: str
    ingredients: list[RecipeIngredient]
    steps: list[RecipeStep]
    tags: list[str]
    diet_type: str | None = None
    prep_minutes: int | None = None


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
