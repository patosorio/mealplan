from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from schemas.enums import DietType


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
    servings: Optional[int] = None
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
    servings: Optional[int] = None
    source: str
    type: Optional[str] = None
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
    servings: int | None = None
    extraction_confidence: Literal["high", "medium", "low"]
    input_interpretation: str


class RecipeImportConfirmRequest(BaseModel):
    """User-edited draft sent back for saving."""

    name: str
    description: str
    ingredients: list[RecipeIngredient]
    steps: list[RecipeStep]
    tags: list[str]
    diet_type: DietType | None = None
    prep_minutes: int | None = None
    servings: int | None = None
    type: Literal["raw", "cooked", "juice"] | None = None


class RecipeCreateRequest(BaseModel):
    """Manual recipe creation — no AI extraction."""

    name: str
    description: str = ""
    ingredients: list[RecipeIngredient]
    steps: list[RecipeStep]
    tags: list[str] = []
    diet_type: DietType | None = None
    prep_minutes: int | None = None
    servings: int | None = None


class RecipeUpdate(BaseModel):
    """Partial update for an existing recipe."""

    name: str | None = None
    description: str | None = None
    ingredients: list[RecipeIngredient] | None = None
    steps: list[RecipeStep] | None = None
    tags: list[str] | None = None
    diet_type: DietType | None = None
    prep_minutes: int | None = None
    servings: int | None = None


class GenerateFromIngredientsRequest(BaseModel):
    """Generate a recipe draft from on-hand ingredients."""

    ingredients: list[str]
    target_type: Literal["juice", "smoothie", "raw_meal", "cooked_meal"]
    servings: int = 2
    save: bool = False

    @field_validator("ingredients")
    @classmethod
    def _non_empty_ingredients(cls, v: list[str]) -> list[str]:
        cleaned = [i.strip() for i in v if i.strip()]
        if not cleaned:
            raise ValueError("At least one ingredient is required.")
        return cleaned


class SaveFromPlanRequest(BaseModel):
    meal_plan_id: uuid.UUID
    day: str
    meal_type: str
    juice_index: int | None = None  # Phase 8 — set when saving a juice slot


class SaveFromPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    source: str
    origin_plan_id: Optional[uuid.UUID] = None
    origin_day: Optional[str] = None
    origin_meal: Optional[str] = None
    created_at: datetime
