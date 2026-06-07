from __future__ import annotations

"""
Claude meal plan generator.

Receives the user's saved recipes and personalisation context, then returns a
fully validated MealPlanResponse. Supports Phase 8 extras and juicing mode.
Retries on JSON parse failure with a corrective prompt.
"""

import asyncio
import json
import logging
import re
import uuid
from datetime import date
from typing import Any

import anthropic
from pydantic import ValidationError

from core.config import settings
from schemas.meal_plan import ExtraSlot, JuicingConfig, MealPlanResponse

logger = logging.getLogger(__name__)

_MAX_TOKENS = 8192
_MAX_RETRIES = 2

# Input sanitization constants
_MAX_PREF_TEXT_LEN = 500
_MAX_TAG_LEN = 60
_MAX_INGREDIENT_LEN = 100
_MAX_EXCLUDE_ITEMS = 30
_MAX_USER_RECIPES = 30
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

_JUICE_SIZE_LABELS: dict[int, str] = {
    8: "8oz / 250ml",
    16: "16oz / 500ml",
    24: "24oz / 750ml",
    32: "32oz / 1L",
}


def _sanitize(value: str, max_len: int) -> str:
    """Strip control characters and truncate."""
    return _CONTROL_CHAR_RE.sub("", value)[:max_len]


def _sanitize_user_recipes(recipes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sanitize all string fields from untrusted user recipe data."""
    safe: list[dict[str, Any]] = []
    for r in recipes[:_MAX_USER_RECIPES]:
        safe.append(
            {
                "name": _sanitize(str(r.get("name", "")), 200),
                "description": _sanitize(str(r.get("description", "")), 500),
                "tags": [
                    _sanitize(str(t), _MAX_TAG_LEN)
                    for t in (r.get("tags") or [])[:15]
                ],
                "prep_minutes": int(r["prep_minutes"])
                if str(r.get("prep_minutes", "")).isdigit()
                else None,
                "type": r.get("type", "cooked")
                if r.get("type") in ("raw", "cooked")
                else "cooked",
            }
        )
    return safe


def _build_system_prompt() -> str:
    return (
        "You are PatriEats, an expert plant-based nutritionist and food writer. "
        "You generate vivid, editorial 7-day meal plans. "
        "You ALWAYS respond with ONLY valid JSON — no prose, no markdown fences. "
        "Every meal description should be enticing and specific (2–3 sentences). "
        "Balance raw and cooked meals. Avoid repeating the same meal twice in a week."
    )


def _build_json_schema(
    plan_id: uuid.UUID,
    week_start: date,
    extras: list[ExtraSlot],
    juicing_config: JuicingConfig | None,
    diet_type: str = "",
) -> dict[str, Any]:
    """Build the example JSON schema shown to Claude."""
    meal_type_hint = "raw" if "raw_vegan" in diet_type else "raw|cooked"
    day_example: dict[str, Any] = {
        "breakfast": {
            "name": "...",
            "type": meal_type_hint,
            "description": "...",
            "tags": ["..."],
            "prep_minutes": 15,
            "source": "generated|user_recipe",
            "ingredients": ["ingredient 1", "ingredient 2"],
        },
        "lunch": {"...": "same structure"},
        "dinner": {"...": "same structure"},
        "juices": [],
        "extras": [],
        "snacks": ["Handful of almonds", "Apple slices"],
    }

    if extras:
        day_example["extras"] = [
            {
                "slot": slot,
                "name": "...",
                "type": "raw|cooked|juice",
                "description": "...",
                "prep_minutes": 5,
            }
            for slot in extras
        ]

    if juicing_config:
        day_example["juices"] = [
            {
                "name": f"{j.label} Juice — [creative name here]",
                "type": "juice",
                "description": "...",
                # Include the time label as a tag so the UI can order rows correctly
                "tags": ["juice", "raw", j.label.lower().replace("-", "_").replace(" ", "_")],
                "prep_minutes": 10,
                "source": "generated",
            }
            for j in juicing_config.juices
        ]
        # Meal slots not in solid_meals → null
        for slot in ("breakfast", "lunch", "dinner"):
            if slot not in juicing_config.solid_meals:
                day_example[slot] = None

    return {
        "plan_id": str(plan_id),
        "week_start": str(week_start),
        "nutrition_avg": {
            "calories": 1800,
            "protein_g": 60,
            "carbs_g": 200,
            "fat_g": 70,
            "fiber_g": 35,
        },
        "nutrition_by_day": {
            day: {
                "calories": 1800,
                "protein_g": 60,
                "carbs_g": 200,
                "fat_g": 70,
                "fiber_g": 35,
            }
            for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        },
        "days": {
            day: day_example
            for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        },
    }


def _build_user_prompt(
    user_recipes: list[dict[str, Any]],
    diet_type: str,
    calories_target: int,
    meals_per_day: list[str],
    exclude_ingredients: list[str],
    preferences_text: str | None,
    taste_profile: dict[str, Any],
    pantry_items: list[str],
    week_start: date,
    plan_id: uuid.UUID,
    recent_meal_names: list[str],
    extras: list[ExtraSlot],
    juicing_config: JuicingConfig | None,
) -> str:
    safe_recipes = _sanitize_user_recipes(user_recipes)
    safe_prefs = (
        _sanitize(preferences_text, _MAX_PREF_TEXT_LEN) if preferences_text else None
    )
    safe_exclude = [
        _sanitize(i, _MAX_INGREDIENT_LEN) for i in exclude_ingredients[:_MAX_EXCLUDE_ITEMS]
    ]
    safe_pantry = [_sanitize(i, _MAX_INGREDIENT_LEN) for i in pantry_items[:30]]
    safe_recent = [_sanitize(n, 200) for n in recent_meal_names[:20]]

    json_schema = _build_json_schema(plan_id, week_start, extras, juicing_config, diet_type)

    parts: list[str] = []

    # ── Juicing mode preamble (overrides standard meals block) ─────────────────
    if juicing_config:
        solid = juicing_config.solid_meals
        juice_lines = "\n".join(
            f"  - {j.label}: {_JUICE_SIZE_LABELS.get(j.size_oz, f'{j.size_oz}oz')}"
            for j in juicing_config.juices
        )
        # Diet / calorie constraint still applies to any solid meals
        diet_constraint = (
            f"Diet for solid meals: {diet_type}. Daily calorie target: {calories_target} kcal.\n"
        )
        raw_constraint = (
            "ALL solid meals MUST use type=\"raw\" — no cooked ingredients whatsoever.\n"
            if "raw_vegan" in diet_type
            else ""
        )
        parts.append(
            "JUICING MODE ACTIVE.\n"
            + diet_constraint
            + raw_constraint
            + f"Each day must include these juices:\n"
            f"{juice_lines}\n"
            + (
                f"Keep these solid meal slots: {', '.join(solid)}. "
                f"Set the other meal slots (breakfast/lunch/dinner) to null."
                if solid
                else "Set breakfast, lunch, and dinner all to null. This is a pure juice day."
            )
            + "\nFor each juice, write an enticing 2-sentence description in the same "
            "editorial style as meals. Use type=\"juice\" and tag it [\"juice\", \"raw\"]."
        )
    else:
        raw_note = (
            " All meals must use type=\"raw\" — no cooked ingredients."
            if "raw_vegan" in diet_type
            else ""
        )
        parts.append(
            f"Generate a 7-day plant-based meal plan starting {week_start}.\n"
            f"Diet: {diet_type}. Daily calorie target: {calories_target} kcal.\n"
            f"Include these meal types each day: {', '.join(meals_per_day)}.{raw_note}"
        )

    # ── Extras block ───────────────────────────────────────────────────────────
    if extras:
        slot_descriptions = {
            "morning_juice": "a fresh cold-pressed juice (type='juice')",
            "morning_snack": "a light raw snack mid-morning",
            "afternoon_snack": "a sustaining afternoon snack",
            "evening_tea": "a calming herbal tea or warm drink (type='raw')",
        }
        extras_detail = "\n".join(
            f"  - {slot}: {slot_descriptions.get(slot, slot)}" for slot in extras
        )
        parts.append(
            f"EXTRAS REQUESTED — include these add-ons in the extras array for EVERY day:\n"
            f"{extras_detail}\n"
            "Each extra needs: slot, name, type (raw/cooked/juice), a vivid 2-sentence description, prep_minutes."
        )
    else:
        parts.append("No extras requested — leave the extras array empty ([]) for each day.")

    # ── Standard context ───────────────────────────────────────────────────────
    if safe_exclude:
        parts.append(f"NEVER use these ingredients: {', '.join(safe_exclude)}.")
    if safe_prefs:
        parts.append(f"User notes: {safe_prefs}")
    if safe_pantry:
        parts.append(f"Prioritise meals using these pantry items: {', '.join(safe_pantry)}.")
    if safe_recent:
        parts.append(f"Do NOT repeat these recently eaten meals: {', '.join(safe_recent)}.")

    if taste_profile.get("favourite_tags"):
        parts.append(f"User loves meals tagged: {', '.join(taste_profile['favourite_tags'][:10])}.")
    if taste_profile.get("disliked_signals"):
        parts.append(f"User tends to dislike: {', '.join(taste_profile['disliked_signals'][:5])}.")
    if taste_profile.get("preferred_prep_time"):
        parts.append(f"Preferred max prep time: {taste_profile['preferred_prep_time']} minutes.")

    if safe_recipes:
        parts.append(
            f"\nUSER'S SAVED RECIPES ({len(safe_recipes)} recipes):\n"
            + json.dumps(safe_recipes, indent=2)
            + "\nIncorporate these recipes into the plan where they fit the diet and "
            "preferences. When you use one, set source=\"user_recipe\". "
            "For any meal you create from scratch, set source=\"generated\"."
        )
    else:
        parts.append(
            "\nThis is a new user with no saved recipes. "
            "Generate all meals from your own knowledge. "
            "Set source=\"generated\" for every meal."
        )

    parts.append(
        "\nReturn ONLY a JSON object matching this exact schema:\n"
        + json.dumps(json_schema, indent=2)
        + "\nAll 7 days (monday–sunday) must be present. "
        "nutrition_avg should reflect the actual estimated weekly averages. "
        "nutrition_by_day must include estimated nutrition for each day. "
        "Every meal, juice, and extra must include an ingredients array (3–8 key "
        "ingredient names as plain strings) for shopping list generation. "
        "The juices and extras arrays must be present on every day (use [] if empty)."
    )

    return "\n\n".join(parts)


def _extract_json(text: str) -> str:
    """Strip markdown fences if Claude wraps in them."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


async def generate_plan(
    user_recipes: list[dict[str, Any]],
    diet_type: str,
    calories_target: int,
    meals_per_day: list[str],
    exclude_ingredients: list[str],
    preferences_text: str | None,
    taste_profile: dict[str, Any],
    pantry_items: list[str],
    week_start: date,
    plan_id: uuid.UUID,
    recent_meal_names: list[str],
    extras: list[ExtraSlot] | None = None,
    juicing_config: JuicingConfig | None = None,
) -> MealPlanResponse:
    """
    Call Claude to generate a 7-day meal plan.
    Supports Phase 8 extras (structured add-ons) and juicing mode.
    Validates the response with MealPlanResponse. Retries up to _MAX_RETRIES
    times with a corrective message on ValidationError or JSON parse failure.
    """
    client = _get_client()
    system = _build_system_prompt()
    user_msg = _build_user_prompt(
        user_recipes=user_recipes,
        diet_type=diet_type,
        calories_target=calories_target,
        meals_per_day=meals_per_day,
        exclude_ingredients=exclude_ingredients,
        preferences_text=preferences_text,
        taste_profile=taste_profile,
        pantry_items=pantry_items,
        week_start=week_start,
        plan_id=plan_id,
        recent_meal_names=recent_meal_names,
        extras=extras or [],
        juicing_config=juicing_config,
    )

    messages: list[dict[str, str]] = [{"role": "user", "content": user_msg}]
    last_error: str = ""

    for attempt in range(_MAX_RETRIES + 1):
        try:
            response = await asyncio.wait_for(
                client.messages.create(
                    model=settings.claude_model,
                    max_tokens=_MAX_TOKENS,
                    system=system,
                    messages=messages,  # type: ignore[arg-type]
                ),
                timeout=120.0,
            )
            raw: str = response.content[0].text  # type: ignore[index]
        except asyncio.TimeoutError:
            logger.warning(
                "Claude timed out on attempt %d/%d (120s)",
                attempt + 1,
                _MAX_RETRIES + 1,
            )
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(2**attempt)
                continue
            from fastapi import HTTPException
            raise HTTPException(
                status_code=503,
                detail="Meal plan generation timed out. Please try again.",
            )
        except anthropic.APIError as exc:
            logger.warning(
                "Claude API error on attempt %d/%d (%s) — %s",
                attempt + 1,
                _MAX_RETRIES + 1,
                type(exc).__name__,
                str(exc)[:200],
            )
            if attempt < _MAX_RETRIES and isinstance(
                exc, (anthropic.InternalServerError, anthropic.APITimeoutError)
            ):
                await asyncio.sleep(2**attempt)
                continue
            from fastapi import HTTPException
            raise HTTPException(
                status_code=502,
                detail=f"AI service error: {type(exc).__name__}. Please try again.",
            )
        except Exception:
            logger.exception("Claude API call failed on attempt %d", attempt + 1)
            raise

        cleaned = _extract_json(raw)

        try:
            plan = MealPlanResponse.model_validate_json(cleaned)
            return plan
        except (ValidationError, json.JSONDecodeError, ValueError) as exc:
            last_error = str(exc)
            logger.warning(
                "Attempt %d/%d — could not parse Claude response: %s",
                attempt + 1,
                _MAX_RETRIES + 1,
                last_error[:200],
            )

            if attempt < _MAX_RETRIES:
                messages.append({"role": "assistant", "content": raw})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            f"Your response could not be parsed. Error: {last_error[:300]}\n"
                            "Please return ONLY the corrected JSON with no other text."
                        ),
                    }
                )

    raise ValueError(
        f"Claude failed to produce valid JSON after {_MAX_RETRIES + 1} attempts. "
        f"Last error: {last_error[:500]}"
    )
