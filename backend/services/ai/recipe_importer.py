from __future__ import annotations

"""
AI-powered recipe importer.

Accepts a photo, screenshot, handwritten note, URL text, ingredient list,
or just a dish name, and returns a fully structured RecipeDraft using
Claude Haiku. Single attempt — no retries; callers handle errors.
"""

import json
import logging

import anthropic

from core.config import settings
from schemas.recipe import RecipeDraft

logger = logging.getLogger(__name__)
_MAX_TOKENS = 3000

_VALID_TAGS = (
    "raw, cooked, high-protein, high-fiber, quick, weeknight, "
    "meal-prep, gluten-free, nut-free, soy-free, oil-free, budget-friendly, "
    "breakfast, lunch, dinner, snack, dessert, smoothie, salad, soup, bowl"
)

_SYSTEM_PROMPT = (
    "You are PatriEats, an expert plant-based chef. Your job is to extract "
    "structured recipe data from any input — photos of dishes, recipe screenshots, "
    "handwritten notes, URLs, ingredient lists, or just a dish name. "
    "You ALWAYS respond with ONLY valid JSON. No prose, no markdown fences. "
    "All recipes must be plant-based (no meat, no dairy, no eggs). "
    "If the input contains non-plant-based ingredients, adapt them to "
    "plant-based alternatives silently."
)

_INSTRUCTION = f"""VALID_TAGS = {_VALID_TAGS}

Extract a complete plant-based recipe from the provided input and return \
ONLY this JSON structure:
{{
  "name": "Recipe name",
  "description": "2-3 sentence appetising description",
  "ingredients": [
    {{"name": "ingredient", "amount": "quantity + unit", "notes": "prep note"}}
  ],
  "steps": [
    {{"step": 1, "instruction": "Clear single action"}}
  ],
  "tags": ["only from VALID_TAGS list above"],
  "diet_type": "raw_vegan | vegan | plant-based",
  "prep_minutes": 20,
  "extraction_confidence": "high | medium | low",
  "input_interpretation": "One sentence describing what you understood the input to be"
}}

Rules:
- ingredients: 2-15 items, realistic quantities for 2 servings
- steps: 2-10 steps
- tags: 2-6 tags, ONLY from the VALID_TAGS list
- If input is just a dish name with no details, set extraction_confidence="low"
  and generate a reasonable plant-based version of that dish
- If input is a full recipe, set extraction_confidence="high"
- diet_type: use "raw_vegan" if all steps are raw, "vegan" otherwise,
  "plant-based" if uncertain"""


def _get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


async def extract_recipe_from_input(
    text: str | None,
    image_base64: str | None,
    image_media_type: str | None,
) -> RecipeDraft:
    """
    Extract a structured recipe from text, an image, or both.

    At least one of text or image_base64 must be provided.
    Raises ValueError on bad input or unparseable Claude response.
    """
    if not text and not image_base64:
        raise ValueError("Provide text, an image, or both.")

    content: list[anthropic.types.MessageParam] = []

    # Build content blocks: image first (if provided), then text, then instruction
    blocks: list[dict] = []

    if image_base64 and image_media_type:
        blocks.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": image_media_type,
                "data": image_base64,
            },
        })

    if text:
        blocks.append({"type": "text", "text": text})

    blocks.append({"type": "text", "text": _INSTRUCTION})

    client = _get_client()
    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=_MAX_TOKENS,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": blocks}],
    )

    raw = response.content[0].text if response.content else ""

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("recipe_importer: Claude returned invalid JSON: %r", raw[:200])
        raise ValueError(f"Claude returned invalid JSON: {exc}") from exc

    try:
        return RecipeDraft.model_validate(data)
    except Exception as exc:
        logger.warning("recipe_importer: RecipeDraft validation failed: %s", exc)
        raise ValueError(f"Extracted recipe failed validation: {exc}") from exc
