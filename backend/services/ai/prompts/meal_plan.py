from __future__ import annotations

import json


def build_skeleton_system_prompt() -> str:
    return """You are Nouri's nutritional planning engine.
Your only job is to create a structured weekly meal plan blueprint.
Do NOT write full descriptions — write only meal names and 2-3 key ingredients per slot.
You ALWAYS respond with ONLY valid JSON — no prose, no markdown fences.

Plan rules:
- Rotate proteins across days — never use the same primary protein on consecutive days
- Select 6-10 shared base ingredients that recur across the week in different preparations
- Set realistic per-day calorie and macro targets that average to the user's weekly goal
- Balance raw and cooked meals according to the user's stated ratio preference
- Never repeat the same meal name twice in the week"""


def build_skeleton_user_prompt(
    plan_days: list[str],
    diet_type: str,
    calories_target: int,
    raw_cooked_ratio: str,
    meals_per_day: list[str],
    juicing_config: dict | None,
    extras: list[str],
    exclude_ingredients: list[str],
    preferences_text: str | None,
    pantry_items: list[str],
    recent_meal_names: list[str],
    taste_profile_summary: str,
    recipe_usage_policy: str,
    saved_recipes: list[dict] | None = None,
) -> str:
    days_str = ", ".join(plan_days)
    exclude_str = ", ".join(exclude_ingredients) or "none"
    pantry_str = ", ".join(pantry_items[:20]) or "none"
    recent_str = ", ".join(recent_meal_names[:15]) or "none"

    juice_instruction = ""
    if not juicing_config and not extras:
        juice_instruction = (
            "\nJUICE SLOTS: Leave juices as empty arrays [] for all days unless juicing mode is active."
        )
    elif juicing_config:
        juice_instruction = (
            f"\nJUICING MODE: {juicing_config}. Generate juice entries for every day."
        )

    extras_block = ""
    if extras:
        extras_block = f"\nEXTRAS REQUESTED: {', '.join(extras)}"

    if juicing_config:
        juices_example = '"juices": ["Morning green — celery, apple, lemon"],'
    else:
        juices_example = '"juices": [],'

    nutrition_example = (
        '"daily_targets": {\n'
        '  "monday": {"calories": 1820, "protein_g": 78, "carbs_g": 210, "fat_g": 60, "fiber_g": 38},\n'
        '  // repeat for every day in the plan — all five fields required on every day\n'
        '}'
    )

    saved_recipes_block = ""
    if saved_recipes:
        saved_recipes_block = (
            f"\nUSER'S SAVED RECIPES:\n{json.dumps(saved_recipes[:15], indent=2)}\n"
            "SAVED RECIPE IDs: When you use a saved recipe in any slot, you MUST include its exact "
            "recipe_id from the context. The recipe_id is a UUID string provided alongside each "
            "recipe name. Never invent or modify recipe_ids."
        )

    return f"""Generate a nutritional blueprint for a {len(plan_days)}-day meal plan.

DAYS TO PLAN: {days_str}
DIET: {diet_type}
CALORIE TARGET: {calories_target} kcal/day
RAW/COOKED RATIO: {raw_cooked_ratio}
MEALS PER DAY: {', '.join(meals_per_day)}{juice_instruction}{extras_block}
EXCLUDE: {exclude_str}
USER NOTES: {preferences_text or 'none'}
PANTRY (prioritise these): {pantry_str}
DO NOT REPEAT THESE RECENT MEALS: {recent_str}

USER TASTE PROFILE:
{taste_profile_summary}

RECIPE USAGE POLICY: {recipe_usage_policy}{saved_recipes_block}

NUTRITION RULE: Every day in daily_targets must include all five fields: calories, protein_g, carbs_g, fat_g, fiber_g. No day may be omitted or have null values.

Return a JSON object with this exact structure:
{{
  "shared_base_ingredients": ["spinach", "chickpeas", "tahini", "lemon", "cucumber"],
  "protein_rotation": {{
    "monday": "chickpeas",
    "tuesday": "lentils"
  }},
  {nutrition_example},
  "days": {{
    "monday": {{
      "breakfast": "Green smoothie bowl — spinach, mango, banana (recipe_id: uuid-here if from saved recipes, omit if generated)",
      "lunch": "Chickpea tabbouleh — lemon, parsley, cucumber",
      "dinner": "Spiced chickpea stew — tomato, cumin, spinach",
      {juices_example}
      "extras": ["Morning snack — raw almonds, apple"]
    }}
  }}
}}

Include only the days listed in DAYS TO PLAN. No other keys."""


def build_enrich_system_prompt() -> str:
    return """You are Nouri's food writer and recipe developer.
You receive a meal blueprint for a single day and expand it into vivid, editorial content.
You ALWAYS respond with ONLY valid JSON — no prose, no markdown fences.
Every description must be 2-3 sentences, enticing and specific — like a premium food magazine.
Every meal must include a full ingredient list with quantities."""


def build_enrich_user_prompt(
    day: str,
    blueprint: dict,
    shared_ingredients: list[str],
    daily_target: dict,
    diet_type: str,
    saved_recipes: list[dict],
    source_instructions: str,
    preferences_text: str | None = None,
) -> str:
    shared_str = ", ".join(shared_ingredients)
    recipes_str = ""
    if saved_recipes:
        recipes_str = (
            f"\nUSER'S SAVED RECIPES (use when policy allows):\n"
            f"{json.dumps(saved_recipes[:10], indent=2)}"
        )

    blueprint_json = json.dumps(blueprint, indent=2)
    target_json = json.dumps(daily_target, indent=2)

    recipe_lookup_str = ""
    if saved_recipes:
        recipe_lookup_str = "\nSAVED RECIPE ID LOOKUP:\n" + "\n".join(
            f"  - {r['name']}: {r['id']}"
            for r in saved_recipes[:15]
        )

    notes_block = ""
    if preferences_text:
        notes_block = f"\nUSER NOTES (follow these exactly): {preferences_text}"

    return f"""Expand the meal blueprint for {day.upper()} into a full DayPlan.

BLUEPRINT:
{blueprint_json}

SHARED WEEK INGREDIENTS (use these where they fit naturally): {shared_str}
NUTRITION TARGET: {target_json}
DIET: {diet_type}{recipes_str}

SOURCE POLICY: {source_instructions}{recipe_lookup_str}{notes_block}

Return a JSON object for this day only, matching this exact structure:
{{
  "breakfast": {{
    "name": "Green Power Smoothie Bowl",
    "type": "raw",
    "description": "Silky blended spinach and frozen mango over sliced banana, scattered with chia and a drizzle of tahini — bright, cooling, five minutes from freezer to bowl.",
    "tags": ["raw", "quick", "high-fibre", "green"],
    "prep_minutes": 5,
    "ingredients": ["2 cups fresh spinach", "1 cup frozen mango", "1 banana", "1 tbsp chia seeds"],
    "source": "generated",
    "nutrition": {{"calories": 420, "protein_g": 12, "carbs_g": 68, "fat_g": 14, "fiber_g": 9}}
  }},
  "lunch": {{ ... }},
  "dinner": {{ ... }},
  "juices": [],
  "extras": [],
  "snacks": [],
  "nutrition": {{"calories": 1820, "protein_g": 78, "carbs_g": 210, "fat_g": 60, "fiber_g": 38}}
}}

NUTRITION RULES:
- Every meal (breakfast, lunch, dinner, each juice, each extra) must include a "nutrition" object with: calories, protein_g, carbs_g, fat_g, fiber_g.
- The day-level "nutrition" object must sum all meal nutrition for the day.
- Never omit or null any nutrition field. Estimate if exact values are unknown.
- Match the day's calorie and protein targets from the blueprint as closely as possible.

SLOT RULES:
- Include juice entries only if the blueprint's "juices" list is non-empty. If juices is [] in the blueprint, return juices as [] in your response.
- Include extra entries only if the blueprint's "extras" list is non-empty. If extras is [] in the blueprint, return extras as [] in your response.
- Never invent slots that are not in the blueprint.

JUICE NAMING RULE:
- Every juice name must start with a time prefix: "Morning — ", "Pre-lunch — ", "Afternoon — ", or "Evening — ".
- Every juice entry must include the matching time tag in its tags array: "morning", "pre_lunch", "afternoon", or "evening".
- Example: name "Morning — Ultra-Green Elixir", tags ["morning", "green", "raw"]
- Never generate a juice without a time prefix and time tag. This is required for grid ordering.

RECIPE ID RULES:
- If a meal uses a saved recipe, set source to "user_recipe" and set recipe_id to the exact UUID from the lookup above.
- If a meal is newly generated, set source to "generated" and omit recipe_id (null).
- Never set recipe_id on a generated meal.
- Never modify or approximate a recipe_id — copy it exactly."""
