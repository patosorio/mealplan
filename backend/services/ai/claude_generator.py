from __future__ import annotations

"""
Claude Haiku meal plan generator.

Receives the user's saved recipes and personalisation context, then returns a
fully validated MealPlanResponse. Retries on JSON parse failure with a
corrective prompt.
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
from schemas.meal_plan import MealPlanResponse

logger = logging.getLogger(__name__)

_MAX_TOKENS = 4096
_MAX_RETRIES = 2

# Input sanitization constants
_MAX_PREF_TEXT_LEN = 500
_MAX_TAG_LEN = 60
_MAX_INGREDIENT_LEN = 100
_MAX_EXCLUDE_ITEMS = 30
_MAX_USER_RECIPES = 30
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


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

    json_schema = {
        "plan_id": str(plan_id),
        "week_start": str(week_start),
        "nutrition_avg": {
            "calories": 1800,
            "protein_g": 60,
            "carbs_g": 200,
            "fat_g": 70,
            "fiber_g": 35,
        },
        "days": {
            "monday": {
                "breakfast": {
                    "name": "...",
                    "type": "raw|cooked",
                    "description": "...",
                    "tags": ["..."],
                    "prep_minutes": 15,
                    "source": "generated|user_recipe",
                },
                "lunch": {"...": "same structure"},
                "dinner": {"...": "same structure"},
                "snacks": ["Handful of almonds", "Apple slices"],
            },
            "tuesday": "...",
            "wednesday": "...",
            "thursday": "...",
            "friday": "...",
            "saturday": "...",
            "sunday": "...",
        },
    }

    parts = [
        f"Generate a 7-day plant-based meal plan starting {week_start}.",
        f"Diet: {diet_type}. Daily calorie target: {calories_target} kcal.",
        f"Include these meal types each day: {', '.join(meals_per_day)}.",
    ]

    if safe_exclude:
        parts.append(f"NEVER use these ingredients: {', '.join(safe_exclude)}.")
    if safe_prefs:
        parts.append(f"User notes: {safe_prefs}")
    if safe_pantry:
        parts.append(
            f"Prioritise meals using these pantry items: {', '.join(safe_pantry)}."
        )
    if safe_recent:
        parts.append(
            f"Do NOT repeat these recently eaten meals: {', '.join(safe_recent)}."
        )

    if taste_profile.get("favourite_tags"):
        parts.append(
            f"User loves meals tagged: {', '.join(taste_profile['favourite_tags'][:10])}."
        )
    if taste_profile.get("disliked_signals"):
        parts.append(
            f"User tends to dislike: {', '.join(taste_profile['disliked_signals'][:5])}."
        )
    if taste_profile.get("preferred_prep_time"):
        parts.append(
            f"Preferred max prep time: {taste_profile['preferred_prep_time']} minutes."
        )

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
        "nutrition_avg should reflect the actual estimated averages."
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
) -> MealPlanResponse:
    """
    Call Claude Haiku to generate a 7-day meal plan.
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
                timeout=45.0,
            )
            raw: str = response.content[0].text  # type: ignore[index]
        except asyncio.TimeoutError:
            logger.warning(
                "Claude timed out on attempt %d/%d (45s)",
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
