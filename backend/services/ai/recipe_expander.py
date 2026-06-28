from __future__ import annotations

"""
On-demand recipe expander — generates full ingredients and steps for a
bookmarked meal using Claude Haiku. Retries once on parse/validation failure.
"""

import json
import logging
import re

import anthropic

from core.config import settings
from services.ai.prompts.recipe_expand import (
    build_expand_system_prompt,
    build_expand_user_prompt,
)

logger = logging.getLogger(__name__)

_MAX_TOKENS = 2048
_MAX_RETRIES = 1

_REQUIRED_INGREDIENT_KEYS = {"name", "amount", "notes"}
_REQUIRED_STEP_KEYS = {"step", "instruction"}

_STRIP_FENCES_RE = re.compile(r"^```(?:json)?\s*|\s*```$")


def _get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


def _validate_and_extract(raw: str) -> tuple[list[dict], list[dict]]:
    """
    Strip markdown fences, parse JSON, validate structure.
    Raises ValueError if the response is malformed.
    """
    cleaned = _STRIP_FENCES_RE.sub("", raw.strip()).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Claude returned non-JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object, got {type(data).__name__}")

    ingredients: list[dict] = data.get("ingredients", [])
    steps: list[dict] = data.get("steps", [])

    if not isinstance(ingredients, list) or not isinstance(steps, list):
        raise ValueError("'ingredients' and 'steps' must be JSON arrays")

    for i, item in enumerate(ingredients):
        missing = _REQUIRED_INGREDIENT_KEYS - item.keys()
        if missing:
            raise ValueError(f"Ingredient[{i}] missing keys: {missing}")
        if item.get("notes") is None:
            item["notes"] = ""

    for i, item in enumerate(steps):
        missing = _REQUIRED_STEP_KEYS - item.keys()
        if missing:
            raise ValueError(f"Step[{i}] missing keys: {missing}")

    return ingredients, steps


async def expand_recipe(
    name: str,
    description: str | None,
    tags: list[str],
    diet_type: str | None,
    prep_minutes: int | None,
) -> tuple[list[dict], list[dict]]:
    """
    Call Claude Haiku to generate full ingredients and steps for a recipe.

    Returns (ingredients, steps) as plain dicts ready for JSONB storage:
      ingredients: [{"name": str, "amount": str, "notes": str}]
      steps:       [{"step": int, "instruction": str}]

    Raises ValueError on malformed response, anthropic errors on API failure.
    """
    client = _get_client()
    user_msg = build_expand_user_prompt(
        name,
        description or "none",
        diet_type or "plant-based",
        tags,
        prep_minutes or 0,
    )
    messages: list[dict[str, str]] = [{"role": "user", "content": user_msg}]

    for attempt in range(_MAX_RETRIES + 1):
        response = await client.messages.create(
            model=settings.claude_haiku_model,
            max_tokens=_MAX_TOKENS,
            system=[
                {
                    "type": "text",
                    "text": build_expand_system_prompt(),
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=messages,  # type: ignore[arg-type]
        )

        raw: str = response.content[0].text  # type: ignore[index]

        try:
            return _validate_and_extract(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            if attempt == 0:
                logger.warning(
                    "recipe_expander: parse/validation failed on attempt 1: %s",
                    str(exc)[:200],
                )
                error_hint = (
                    f"\n\nPrevious response failed JSON validation: {str(exc)[:300]}. "
                    "Return ONLY valid JSON matching the schema exactly. "
                    "Do not change content, only fix structure."
                )
                messages[-1]["content"] += error_hint
                continue
            raise
