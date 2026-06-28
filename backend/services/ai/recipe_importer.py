from __future__ import annotations

"""
AI-powered recipe importer.

Accepts a photo, screenshot, handwritten note, URL text, ingredient list,
or just a dish name, and returns a fully structured RecipeDraft using
Claude Haiku. Retries once on JSON parse/validation failure.
"""

import json
import logging

import anthropic
from pydantic import ValidationError

from core.config import settings
from schemas.recipe import RecipeDraft
from services.ai.prompts.recipe_import import (
    SYSTEM_PROMPT,
    build_generate_from_ingredients_prompt,
    build_import_user_prompt,
)

logger = logging.getLogger(__name__)
_MAX_TOKENS = 3000
_MAX_RETRIES = 1


def _get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


def _append_error_hint_to_user_message(
    messages: list[dict],
    error_hint: str,
) -> None:
    content = messages[-1]["content"]
    if isinstance(content, str):
        messages[-1]["content"] += error_hint
        return
    for block in reversed(content):
        if block.get("type") == "text":
            block["text"] += error_hint
            return
    content.append({"type": "text", "text": error_hint.lstrip()})


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

    has_image = bool(image_base64 and image_media_type)
    blocks: list[dict] = []

    if has_image:
        blocks.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": image_media_type,
                "data": image_base64,
            },
        })

    blocks.append({
        "type": "text",
        "text": build_import_user_prompt(text or "", has_image),
    })

    client = _get_client()
    messages: list[dict] = [{"role": "user", "content": blocks}]

    for attempt in range(_MAX_RETRIES + 1):
        response = await client.messages.create(
            model=settings.claude_haiku_model,
            max_tokens=_MAX_TOKENS,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=messages,  # type: ignore[arg-type]
        )

        raw = response.content[0].text if response.content else ""

        try:
            data = json.loads(raw)
            return RecipeDraft.model_validate(data)
        except (ValidationError, json.JSONDecodeError) as exc:
            if attempt == 0:
                logger.warning(
                    "recipe_importer: parse/validation failed on attempt 1: %s",
                    str(exc)[:200],
                )
                error_hint = (
                    f"\n\nPrevious response failed JSON validation: {str(exc)[:300]}. "
                    "Return ONLY valid JSON matching the schema exactly. "
                    "Do not change content, only fix structure."
                )
                _append_error_hint_to_user_message(messages, error_hint)
                continue
            logger.warning(
                "recipe_importer: Claude returned invalid JSON: %r", raw[:200]
            )
            raise ValueError(f"Claude returned invalid JSON: {exc}") from exc


async def generate_from_ingredients(
    ingredients: list[str],
    target_type: str,
    servings: int = 2,
) -> RecipeDraft:
    """Generate a recipe draft from a list of on-hand ingredients."""
    client = _get_client()
    prompt = build_generate_from_ingredients_prompt(ingredients, target_type, servings)
    messages: list[dict[str, str]] = [{"role": "user", "content": prompt}]

    for attempt in range(_MAX_RETRIES + 1):
        response = await client.messages.create(
            model=settings.claude_haiku_model,
            max_tokens=_MAX_TOKENS,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=messages,  # type: ignore[arg-type]
        )
        raw = response.content[0].text if response.content else ""

        try:
            data = json.loads(raw)
            return RecipeDraft.model_validate(data)
        except (ValidationError, json.JSONDecodeError) as exc:
            if attempt == 0:
                error_hint = (
                    f"\n\nPrevious response failed JSON validation: {str(exc)[:300]}. "
                    "Return ONLY valid JSON matching the schema exactly. "
                    "Do not change content, only fix structure."
                )
                messages[-1]["content"] += error_hint
                continue
            raise ValueError(f"Claude returned invalid JSON: {exc}") from exc
