from __future__ import annotations

"""
On-demand recipe expander — generates full ingredients and steps for a
bookmarked meal using Claude Haiku. Single attempt, no retries.
"""

import json
import logging
import re

import anthropic

from core.config import settings

logger = logging.getLogger(__name__)

_MAX_TOKENS = 2048

_REQUIRED_INGREDIENT_KEYS = {"name", "amount", "notes"}
_REQUIRED_STEP_KEYS = {"step", "instruction"}

_STRIP_FENCES_RE = re.compile(r"^```(?:json)?\s*|\s*```$")


def _get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


def _build_system_prompt() -> str:
    return (
        "You are PatriEats, an expert plant-based chef and nutritionist. "
        "You write clear, practical recipes for home cooks. "
        "You ALWAYS respond with ONLY valid JSON — no prose, no markdown fences."
    )


def _build_user_prompt(
    name: str,
    description: str | None,
    tags: list[str],
    diet_type: str | None,
    prep_minutes: int | None,
) -> str:
    tags_str = ", ".join(tags) if tags else "none"
    prep_str = f"{prep_minutes} minutes" if prep_minutes is not None else "not specified"
    desc_str = description or "none"
    diet_str = diet_type or "plant-based"

    return (
        f"Generate a complete plant-based recipe for: {name}\n\n"
        f"Description: {desc_str}\n"
        f"Diet type: {diet_str}\n"
        f"Tags: {tags_str}\n"
        f"Target prep time: {prep_str}\n\n"
        'Return ONLY a JSON object with exactly these two keys:\n'
        "{\n"
        '  "ingredients": [\n'
        '    {"name": "...", "amount": "...", "notes": "..."}\n'
        "  ],\n"
        '  "steps": [\n'
        '    {"step": 1, "instruction": "..."}\n'
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- All ingredients must be plant-based, no meat, no dairy, no eggs\n"
        "- If diet_type contains \"raw\", all steps must be raw preparation only "
        "(no cooking, no heat above 42\u00b0C)\n"
        "- Ingredients list: 4\u201312 items, realistic quantities for 2 servings\n"
        "- Steps: 3\u20138 clear steps, each a single action\n"
        "- Do not include any text outside the JSON object"
    )


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
    system = _build_system_prompt()
    user_msg = _build_user_prompt(name, description, tags, diet_type, prep_minutes)

    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=_MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user_msg}],  # type: ignore[arg-type]
    )

    raw: str = response.content[0].text  # type: ignore[index]
    return _validate_and_extract(raw)
