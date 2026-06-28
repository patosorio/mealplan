from __future__ import annotations

_VALID_TAGS = (
    "raw, cooked, high-protein, high-fiber, quick, weeknight, "
    "meal-prep, gluten-free, nut-free, soy-free, oil-free, budget-friendly, "
    "breakfast, lunch, dinner, snack, dessert, smoothie, salad, soup, bowl"
)

SYSTEM_PROMPT = (
    "You are Nouri, an expert plant-based chef. Your job is to extract "
    "structured recipe data from any input — photos of dishes, recipe screenshots, "
    "handwritten notes, URLs, ingredient lists, or just a dish name. "
    "You ALWAYS respond with ONLY valid JSON. No prose, no markdown fences. "
    "All recipes must be plant-based (no meat, no dairy, no eggs). "
    "If the input contains non-plant-based ingredients, adapt them to "
    "plant-based alternatives silently."
)

INSTRUCTION = f"""VALID_TAGS = {_VALID_TAGS}

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
  "tags": ["raw", "vegan", "high-protein"],  // 2-6 tags: prefer VALID_TAGS, custom descriptive tags allowed
  "diet_type": "raw_vegan | vegan | plant-based",
  "prep_minutes": 20,
  "servings": 2,
  "extraction_confidence": "high | medium | low",
  "input_interpretation": "One sentence describing what you understood the input to be"
}}

Rules:
- ingredients: 2-15 items, realistic quantities for 2 servings
- steps: 2-10 steps
- tags: 2-6 tags chosen ONLY from VALID_TAGS above — do not invent custom tags
- servings: integer number of portions (default 2 if not stated)
- If input is just a dish name with no details, set extraction_confidence="low"
  and generate a reasonable plant-based version of that dish
- If input is a full recipe, set extraction_confidence="high"
- diet_type: use "raw_vegan" if all steps are raw, "vegan" otherwise,
  "plant-based" if uncertain"""


def build_import_user_prompt(user_text: str, has_image: bool) -> str:
    """Assemble the text portion of an import request (instruction + optional user text)."""
    del has_image  # image is sent as a separate content block by the caller
    parts: list[str] = []
    if user_text.strip():
        parts.append(user_text.strip())
    parts.append(INSTRUCTION)
    return "\n\n".join(parts)


def build_generate_from_ingredients_prompt(
    ingredients: list[str],
    target_type: str,
    servings: int,
) -> str:
    """Assemble the user prompt for generating a recipe from on-hand ingredients."""
    return (
        f"Create a plant-based {target_type.replace('_', ' ')} recipe using "
        f"these ingredients: {', '.join(ingredients)}.\n"
        f"Target servings: {servings}.\n\n"
        + INSTRUCTION
    )
