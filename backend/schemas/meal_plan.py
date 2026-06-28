from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from schemas.enums import DAY_ORDER, DietType, RawCookedRatio


class MealItem(BaseModel):
    """A single meal within a generated day plan."""

    name: str
    type: Literal["raw", "cooked", "juice"]
    description: str
    tags: list[str]
    prep_minutes: int
    source: Literal["generated", "user_recipe", "corpus"] = "generated"
    ingredients: list[str] = []
    size_oz: int | None = None
    size_ml: int | None = None


# ── Phase 8 models ─────────────────────────────────────────────────────────────

ExtraSlot = Literal["morning_juice", "morning_snack", "afternoon_snack", "evening_tea"]


class ExtraItem(BaseModel):
    """Structured snack / add-on slot. Generated only when user opts in."""

    slot: ExtraSlot
    name: str
    type: Literal["raw", "cooked", "juice"]
    description: str
    prep_minutes: int
    ingredients: list[str] = []


class JuiceEntry(BaseModel):
    """One juice in a user-built juicing schedule."""

    label: str    # "Morning", "Pre-lunch", "Afternoon", "Evening" or free text
    size_oz: int  # 8 | 16 | 24 | 32
    size_label: str  # "8oz / 250ml", "16oz / 500ml", "24oz / 750ml", "32oz / 1L"


class JuicingConfig(BaseModel):
    juices: list[JuiceEntry]
    solid_meals: list[Literal["breakfast", "lunch", "dinner"]] = []


# ── Day plan schemas ──────────────────────────────────────────────────────────

class DayMeals(BaseModel):
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None
    juices: list[MealItem] = []
    extras: list[ExtraItem] = []
    snacks: list[str] = []


# Alias used for Claude output validation
# breakfast/lunch/dinner are Optional to support juicing mode (may be None)
class DayPlan(BaseModel):
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None
    juices: list[MealItem] = []     # Phase 8 — juicing mode
    extras: list[ExtraItem] = []    # Phase 8 — structured add-ons
    snacks: list[str] = []          # kept for backward compatibility
    nutrition: NutritionAvg | None = None


class NutritionAvg(BaseModel):
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    fiber_g: int


class NutritionByDay(BaseModel):
    """Optional per-day nutrition estimates (keys: monday–sunday)."""

    monday: NutritionAvg | None = None
    tuesday: NutritionAvg | None = None
    wednesday: NutritionAvg | None = None
    thursday: NutritionAvg | None = None
    friday: NutritionAvg | None = None
    saturday: NutritionAvg | None = None
    sunday: NutritionAvg | None = None


# ── Claude output schema ───────────────────────────────────────────────────────

_VALID_DAYS = frozenset(DAY_ORDER)


class MealPlanResponse(BaseModel):
    """
    Validated output from Claude. Every call to claude_generator.generate_plan()
    must produce an instance of this before the result is persisted to DB.
    """

    plan_id: uuid.UUID
    week_start: date
    plan_days: int = 7
    nutrition_avg: NutritionAvg
    nutrition_by_day: dict[str, NutritionAvg] = {}
    days: dict[str, DayPlan]

    @field_validator("days")
    @classmethod
    def _valid_day_keys(cls, v: dict[str, DayPlan]) -> dict[str, DayPlan]:
        invalid = set(v.keys()) - _VALID_DAYS
        if invalid:
            raise ValueError(f"Invalid day names: {sorted(invalid)}")
        return v

    @model_validator(mode="after")
    def _day_count_matches_plan_days(self) -> "MealPlanResponse":
        if len(self.days) != self.plan_days:
            raise ValueError(
                f"Expected {self.plan_days} days in plan, got {len(self.days)}"
            )
        return self


class RecipeUsagePolicy(BaseModel):
    mode: Literal["balanced", "prefer_saved", "prefer_new"] = "balanced"
    flexible_repeat_slots: list[str] = []
    ingredient_coherence: bool = True


class GeneratePlanRequest(BaseModel):
    diet_type: DietType = "raw_vegan_80_20"
    calories_target: int = 1800
    meals_per_day: list[str] = ["breakfast", "lunch", "dinner"]
    use_own_recipes: bool = True
    use_pantry: bool = True
    exclude_ingredients: list[str] = []
    preferences_text: Optional[str] = None
    week_start: date
    plan_days: int = 7
    raw_cooked_ratio: RawCookedRatio = "80_20"
    recipe_usage_policy: RecipeUsagePolicy = RecipeUsagePolicy()
    # Phase 8 — optional, backward-compatible
    extras: list[ExtraSlot] = []
    juicing_config: Optional[JuicingConfig] = None

    @field_validator("plan_days")
    @classmethod
    def _plan_days_in_range(cls, v: int) -> int:
        if v < 4 or v > 7:
            raise ValueError("plan_days must be between 4 and 7")
        return v


# ── Phase 7 request schemas ────────────────────────────────────────────────────

class PatchMealPlanRequest(BaseModel):
    """Update name, status, or scheduled_week on an existing plan."""

    name: Optional[str] = None
    status: Optional[Literal["draft", "reviewing", "approved"]] = None
    scheduled_week: Optional[date] = None


class ApprovePlanRequest(BaseModel):
    """Name the plan at approval time."""

    name: str
    accept_all: bool = False


class SchedulePlanRequest(BaseModel):
    """Assign plan to a calendar week (Monday date)."""

    scheduled_week: date


class PatchGeneratedMealRequest(BaseModel):
    """Accept a meal or apply an inline manual edit."""

    action: Literal["accept", "edit"]
    # Required when action == "edit"
    name: Optional[str] = None
    description: Optional[str] = None


# ── API read schemas ──────────────────────────────────────────────────────────

class MealPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    week_start: date
    diet_type: str
    plan_data: dict[str, Any]
    nutrition_avg: dict[str, Any]
    created_at: datetime
    # Phase 7 fields
    status: str
    name: Optional[str] = None
    scheduled_week: Optional[date] = None
    approved_at: Optional[datetime] = None
    plan_days: int = 7
    quality_score: Optional[float] = None


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
    # Phase 7 fields
    approval_status: str
    edited_manually: bool
