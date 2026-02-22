from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class MealItem(BaseModel):
    """A single meal within a generated day plan."""

    name: str
    type: Literal["raw", "cooked"]
    description: str
    tags: list[str]
    prep_minutes: int
    source: Literal["generated", "user_recipe", "corpus"] = "generated"


class DayMeals(BaseModel):
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None
    snacks: list[str] = []


# Alias used for Claude output validation — all meals required
class DayPlan(BaseModel):
    breakfast: MealItem
    lunch: MealItem
    dinner: MealItem
    snacks: list[str] = []


class NutritionAvg(BaseModel):
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    fiber_g: int


# ── Claude output schema ───────────────────────────────────────────────────────

_VALID_DAYS = frozenset(
    {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
)


class MealPlanResponse(BaseModel):
    """
    Validated output from Claude. Every call to claude_generator.generate_plan()
    must produce an instance of this before the result is persisted to DB.
    """

    plan_id: uuid.UUID
    week_start: date
    nutrition_avg: NutritionAvg
    days: dict[str, DayPlan]

    @field_validator("days")
    @classmethod
    def _all_days_present(cls, v: dict[str, DayPlan]) -> dict[str, DayPlan]:
        missing = _VALID_DAYS - set(v.keys())
        if missing:
            raise ValueError(f"Missing days in meal plan: {sorted(missing)}")
        return v


class GeneratePlanRequest(BaseModel):
    diet_type: str = "raw_vegan_80_20"
    calories_target: int = 1800
    meals_per_day: list[str] = ["breakfast", "lunch", "dinner"]
    use_own_recipes: bool = True
    use_pantry: bool = True
    exclude_ingredients: list[str] = []
    preferences_text: Optional[str] = None
    week_start: date


class MealPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    week_start: date
    diet_type: str
    plan_data: dict[str, Any]
    nutrition_avg: dict[str, Any]
    created_at: datetime


class GeneratedMealRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    meal_plan_id: uuid.UUID
    day: str
    meal_type: str
    name: str
    type: str
    description: Optional[str] = None
    tags: list[str]
    prep_minutes: Optional[int] = None
    saved: bool
    created_at: datetime
