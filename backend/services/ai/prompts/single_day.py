from __future__ import annotations

import json
from typing import Any

from schemas.meal_plan import ExtraSlot, JuicingConfig


def build_single_day_system_prompt() -> str:
    return """You are Nouri's food writer and recipe developer.
You generate a single day of meals for a plant-based meal plan.
You ALWAYS respond with ONLY valid JSON — no prose, no markdown fences.
Every description must be 2-3 sentences, enticing and specific.
Never repeat a meal the user recently ate."""


def _day_schema_example(diet_type: str, juicing_config: JuicingConfig | None) -> dict[str, Any]:
    meal_type_hint = "raw" if "raw_vegan" in diet_type else "raw|cooked"
    day_example: dict[str, Any] = {
        "breakfast": {
            "name": "...",
            "type": meal_type_hint,
            "description": "...",
            "tags": ["..."],
            "prep_minutes": 15,
            "source": "generated",
            "ingredients": ["ingredient 1", "ingredient 2"],
        },
        "lunch": {"...": "same structure"},
        "dinner": {"...": "same structure"},
        "juices": [],
        "extras": [],
        "snacks": [],
        "nutrition": {
            "calories": 1800,
            "protein_g": 60,
            "carbs_g": 200,
            "fat_g": 70,
            "fiber_g": 35,
        },
    }
    if juicing_config:
        day_example["juices"] = [
            {
                "name": f"{j.label} Juice — [creative name here]",
                "type": "juice",
                "description": "...",
                "tags": ["juice", "raw", j.label.lower().replace("-", "_").replace(" ", "_")],
                "prep_minutes": 10,
                "source": "generated",
                "size_oz": j.size_oz,
            }
            for j in juicing_config.juices
        ]
        for slot in ("breakfast", "lunch", "dinner"):
            if slot not in juicing_config.solid_meals:
                day_example[slot] = None
    return day_example


def build_single_day_user_prompt(
    *,
    day: str,
    diet_type: str,
    calories_target: int,
    meals_per_day: list[str],
    exclude_ingredients: list[str],
    preferences_text: str | None,
    taste_profile: dict[str, Any],
    pantry_items: list[str],
    recent_meal_names: list[str],
    user_recipes: list[dict[str, Any]],
    extras: list[ExtraSlot] | None = None,
    juicing_config: JuicingConfig | None = None,
) -> str:
    day_schema = _day_schema_example(diet_type, juicing_config)

    parts: list[str] = [
        (
            f"Generate meals for {day} only. Diet: {diet_type}. "
            f"Daily calorie target: {calories_target} kcal.\n"
            f"Include these meal types: {', '.join(meals_per_day)}."
        ),
    ]
    if exclude_ingredients:
        parts.append(f"NEVER use these ingredients: {', '.join(exclude_ingredients)}.")
    if preferences_text:
        parts.append(f"User notes: {preferences_text}")
    if pantry_items:
        parts.append(f"Prioritise pantry items: {', '.join(pantry_items)}.")
    if recent_meal_names:
        parts.append(f"Do NOT repeat: {', '.join(recent_meal_names)}.")
    if taste_profile.get("favourite_tags"):
        parts.append(
            f"User loves: {', '.join(taste_profile['favourite_tags'][:10])}."
        )
    if user_recipes:
        parts.append(
            f"Saved recipes:\n{json.dumps(user_recipes[:10], indent=2)}"
        )

    parts.append(
        "Return ONLY a JSON object matching this DayPlan schema:\n"
        + json.dumps(day_schema, indent=2)
        + "\nInclude ingredients arrays on every meal/juice/extra. "
        "Include a nutrition object with estimated daily totals for the day."
    )

    return "\n\n".join(parts)
