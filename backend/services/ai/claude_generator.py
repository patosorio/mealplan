from __future__ import annotations

"""
Claude Sonnet meal plan generator.

Receives candidate recipes from Gemini, injects personalisation context,
and returns a fully validated MealPlanResponse. Retries on JSON parse
failure with a corrective prompt.
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

_MODEL = "claude-sonnet-4-5"
_MAX_TOKENS = 8192
_MAX_RETRIES = 2

# Input sanitization constants
_MAX_PREF_TEXT_LEN = 500
_MAX_TAG_LEN = 60
_MAX_INGREDIENT_LEN = 100
_MAX_EXCLUDE_ITEMS = 30
_MAX_CANDIDATES = 30
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _sanitize(value: str, max_len: int) -> str:
    """Strip control characters and truncate."""
    return _CONTROL_CHAR_RE.sub("", value)[:max_len]


def _sanitize_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sanitize all string fields from untrusted candidate data."""
    safe: list[dict[str, Any]] = []
    for c in candidates[:_MAX_CANDIDATES]:
        safe.append(
            {
                "name": _sanitize(str(c.get("name", "")), 200),
                "description": _sanitize(str(c.get("description", "")), 500),
                "tags": [
                    _sanitize(str(t), _MAX_TAG_LEN)
                    for t in (c.get("tags") or [])[:15]
                ],
                "prep_minutes": int(c["prep_minutes"])
                if str(c.get("prep_minutes", "")).isdigit()
                else None,
                "type": c.get("type", "cooked")
                if c.get("type") in ("raw", "cooked")
                else "cooked",
                "source": c.get("source", "corpus"),
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
    candidates: list[dict[str, Any]],
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
    safe_candidates = _sanitize_candidates(candidates)
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
                    "source": "generated|user_recipe|corpus",
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

    parts.append(
        f"\nDraw from these {len(safe_candidates)} candidate recipes as inspiration "
        "(you may adapt or combine them, or create new ones):\n"
        + json.dumps(safe_candidates, indent=2)
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


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


async def generate_plan(
    candidates: list[dict[str, Any]],
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
    Call Claude Sonnet to generate a 7-day meal plan.
    Validates the response with MealPlanResponse. Retries up to _MAX_RETRIES
    times with a corrective message on ValidationError or JSON parse failure.
    """
    client = _get_client()
    system = _build_system_prompt()
    user_msg = _build_user_prompt(
        candidates=candidates,
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
    loop = asyncio.get_running_loop()

    def _make_call(
        msgs: list[dict[str, str]],
    ) -> str:
        response = client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=msgs,  # type: ignore[arg-type]
        )
        return response.content[0].text  # type: ignore[return-value]

    for attempt in range(_MAX_RETRIES + 1):
        try:
            raw: str = await loop.run_in_executor(None, _make_call, list(messages))
        except (anthropic.InternalServerError, anthropic.APITimeoutError) as _exc:
            logger.warning(
                "Claude transient API error on attempt %d/%d (%s) — %s",
                attempt + 1,
                _MAX_RETRIES + 1,
                type(_exc).__name__,
                str(_exc)[:200],
            )
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(2**attempt)  # 1 s, 2 s backoff
                continue
            raise
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
                # Give Claude the error and ask it to fix the JSON
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
