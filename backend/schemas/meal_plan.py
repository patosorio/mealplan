from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class MealItem(BaseModel):
    """A single meal within a generated day plan."""

    name: str
    type: str  # 'raw' | 'cooked'
    description: str
    tags: list[str]
    prep_minutes: int
    source: str  # 'generated' | 'user_recipe'


class DayMeals(BaseModel):
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None
    snacks: list[str] = []


class NutritionAvg(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float


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
