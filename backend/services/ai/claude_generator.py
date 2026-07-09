from __future__ import annotations

"""
Claude meal plan generator — two-phase planner-executor pipeline.

Phase 1 (Sonnet): nutritional blueprint (PlanSkeleton)
Phase 2 (Haiku): parallel per-day enrichment into DayPlan objects
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
from schemas.enums import DAY_ORDER, days_for_plan
from schemas.meal_plan import (
    DayPlan,
    ExtraSlot,
    JuicingConfig,
    MealPlanResponse,
    PlanSkeleton,
    RecipeUsagePolicy,
)
from services.ai.prompts.meal_plan import (
    build_enrich_system_prompt,
    build_enrich_user_prompt,
    build_skeleton_system_prompt,
    build_skeleton_user_prompt,
)
from services.ai.prompts.single_day import (
    build_single_day_system_prompt,
    build_single_day_user_prompt,
)

logger = logging.getLogger(__name__)

_CLAUDE_TIMEOUT = 175.0
_MAX_ATTEMPTS = 3
_MAX_TOKENS = 10000
_MAX_RETRIES = 1
_TRUNCATION_HINT = (
    "\n\nYour previous response was cut off before the JSON was complete. "
    "Return ONLY valid, complete JSON. Keep descriptions to 2 sentences and names under 60 chars."
)

_JUICE_SIZE_LABELS: dict[int, str] = {
    8: "8oz / 250ml",
    16: "16oz / 500ml",
    24: "24oz / 750ml",
    32: "32oz / 1L",
}

def _system_block(text: str) -> list[dict[str, Any]]:
    return [{
        "type": "text",
        "text": text,
        "cache_control": {"type": "ephemeral"},
    }]

# Input sanitization constants
_MAX_PREF_TEXT_LEN = 500
_MAX_TAG_LEN = 60
_MAX_INGREDIENT_LEN = 100
_MAX_EXCLUDE_ITEMS = 30
_MAX_USER_RECIPES = 30
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

client = anthropic.AsyncAnthropic(
    api_key=settings.anthropic_api_key,
    timeout=_CLAUDE_TIMEOUT + 5,
)


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
                "description": _sanitize(str(r.get("description", "")), 150),
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


def _extract_json(text: str) -> str:
    """Strip markdown fences if Claude wraps in them."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _skeleton_max_tokens(plan_days: int) -> int:
    """Scale skeleton budget with day count — 7-day plans need ~3k tokens."""
    return min(max(3000, plan_days * 450), 8192)


def _enrich_max_tokens() -> int:
    return 4096


async def _call_claude_json(
    *,
    model: str,
    system_prompt: str,
    messages: list[dict[str, str]],
    max_tokens: int,
    trace_id: str,
    phase: str,
) -> Any:
    """Call Claude and parse JSON, retrying on truncation or parse errors."""
    tokens = max_tokens

    for attempt in range(_MAX_ATTEMPTS):
        response = await client.messages.create(
            model=model,
            max_tokens=tokens,
            system=_system_block(system_prompt),
            messages=messages,  # type: ignore[arg-type]
        )
        raw = _extract_json(response.content[0].text)  # type: ignore[index]

        if response.stop_reason == "max_tokens":
            logger.warning(
                "claude_response_truncated",
                extra={
                    "trace_id": trace_id,
                    "phase": phase,
                    "attempt": attempt + 1,
                    "max_tokens": tokens,
                },
            )
            tokens = min(tokens + 2000, 8192)
            messages[-1]["content"] += _TRUNCATION_HINT
            continue

        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            logger.warning(
                "claude_json_parse_failed",
                extra={
                    "trace_id": trace_id,
                    "phase": phase,
                    "attempt": attempt + 1,
                    "error": str(e)[:200],
                    "raw_tail": raw[-120:] if raw else "",
                },
            )
            if attempt < _MAX_ATTEMPTS - 1:
                messages[-1]["content"] += (
                    f"\n\nPrevious response failed JSON validation: {str(e)[:300]}. "
                    "Return ONLY valid JSON matching the schema exactly."
                )
                continue
            raise

    raise ValueError(
        f"Claude failed to return complete JSON for {phase} after {_MAX_ATTEMPTS} attempts"
    )


async def generate_plan_skeleton(
    plan_days: list[str],
    context: dict[str, Any],
    trace_id: str,
) -> PlanSkeleton:
    """
    Phase 1: Sonnet generates a lightweight nutritional blueprint.
    Fast (~2s), small output (~800 tokens), all cross-week reasoning happens here.
    """
    system_prompt = build_skeleton_system_prompt()
    user_prompt = build_skeleton_user_prompt(
        plan_days=plan_days,
        diet_type=context["diet_type"],
        calories_target=context["calories_target"],
        raw_cooked_ratio=context["raw_cooked_ratio"],
        meals_per_day=context["meals_per_day"],
        juicing_config=context.get("juicing_config"),
        extras=context.get("extras", []),
        exclude_ingredients=context.get("exclude_ingredients", []),
        preferences_text=context.get("preferences_text"),
        pantry_items=context.get("pantry_items", []),
        recent_meal_names=context.get("recent_meal_names", []),
        taste_profile_summary=context.get("taste_profile_summary", ""),
        recipe_usage_policy=context.get("recipe_usage_policy", "balanced"),
        saved_recipes=context.get("saved_recipes", []),
    )

    messages: list[dict[str, str]] = [{"role": "user", "content": user_prompt}]

    for attempt in range(_MAX_ATTEMPTS):
        try:
            parsed = await _call_claude_json(
                model=settings.claude_model,
                system_prompt=system_prompt,
                messages=messages,
                max_tokens=_skeleton_max_tokens(len(plan_days)),
                trace_id=trace_id,
                phase="skeleton",
            )
            skeleton = PlanSkeleton.model_validate(parsed)
            logger.info("skeleton_generated", extra={
                "trace_id": trace_id,
                "days": len(skeleton.days),
            })
            return skeleton
        except ValidationError as e:
            logger.warning(
                "skeleton_validation_failed",
                extra={"trace_id": trace_id, "attempt": attempt + 1, "error": str(e)[:200]},
            )
            if attempt < _MAX_ATTEMPTS - 1:
                messages[-1]["content"] += (
                    f"\n\nPrevious response failed schema validation: {str(e)[:300]}. "
                    "Return ONLY valid JSON matching the schema exactly."
                )
                continue
            raise


async def enrich_day(
    day: str,
    blueprint: dict[str, Any],
    skeleton: PlanSkeleton,
    context: dict[str, Any],
    cached_user_context: str,
    trace_id: str,
) -> tuple[str, DayPlan]:
    """
    Phase 2: Haiku enriches a single day blueprint into a full DayPlan.
    All day calls fire in parallel via asyncio.gather().
    Receives cached user context for prompt caching discount on calls 2-7.
    """
    system_prompt = build_enrich_system_prompt()
    daily_target = skeleton.daily_targets.get(day, {})

    user_prompt = build_enrich_user_prompt(
        day=day,
        blueprint=blueprint,
        shared_ingredients=skeleton.shared_base_ingredients,
        daily_target=daily_target.model_dump() if hasattr(daily_target, "model_dump") else daily_target,
        diet_type=context["diet_type"],
        saved_recipes=context.get("saved_recipes", []),
        source_instructions=context.get("source_instructions", ""),
        preferences_text=context.get("preferences_text"),
    )

    messages = [{"role": "user", "content": cached_user_context + "\n\n" + user_prompt}]
    tokens = _enrich_max_tokens()

    for attempt in range(_MAX_ATTEMPTS):
        raw = ""
        try:
            response = await client.messages.create(
                model=settings.claude_haiku_model,
                max_tokens=tokens,
                system=_system_block(system_prompt),
                messages=messages,  # type: ignore[arg-type]
            )
            raw = _extract_json(response.content[0].text)  # type: ignore[index]

            if response.stop_reason == "max_tokens":
                logger.warning(
                    "claude_response_truncated",
                    extra={
                        "trace_id": trace_id,
                        "phase": f"enrich_{day}",
                        "attempt": attempt + 1,
                        "max_tokens": tokens,
                    },
                )
                tokens = min(tokens + 2000, 8192)
                messages[-1]["content"] += _TRUNCATION_HINT
                continue

            parsed = json.loads(raw)
            day_plan = DayPlan.model_validate(parsed)
            logger.info("day_enriched", extra={
                "trace_id": trace_id,
                "day": day,
            })
            return day, day_plan
        except (ValidationError, json.JSONDecodeError) as e:
            logger.error("enrich_validation_failed", extra={
                "trace_id": trace_id,
                "day": day,
                "attempt": attempt,
                "error_type": type(e).__name__,
                "error": str(e)[:1000],
                "raw_response": raw[:1000] if raw else "not_captured",
            })
            if attempt == 0:
                error_hint = (
                    f"\n\nPrevious response failed JSON validation: {str(e)[:300]}. "
                    "Return ONLY valid JSON matching the DayPlan schema exactly."
                )
                messages[-1]["content"] += error_hint
                continue
            raise


async def generate_single_day(
    user_recipes: list[dict[str, Any]],
    diet_type: str,
    calories_target: int,
    meals_per_day: list[str],
    exclude_ingredients: list[str],
    preferences_text: str | None,
    taste_profile: dict[str, Any],
    pantry_items: list[str],
    recent_meal_names: list[str],
    day: str,
    extras: list[ExtraSlot] | None = None,
    juicing_config: JuicingConfig | None = None,
) -> DayPlan:
    """
    Generate meals for a single day using Claude Haiku.
    Returns a validated DayPlan — no full MealPlanResponse wrapper.
    """
    if day not in DAY_ORDER:
        raise ValueError(f"Invalid day '{day}'.")

    safe_recipes = _sanitize_user_recipes(user_recipes)
    safe_prefs = (
        _sanitize(preferences_text, _MAX_PREF_TEXT_LEN) if preferences_text else None
    )
    safe_exclude = [
        _sanitize(i, _MAX_INGREDIENT_LEN) for i in exclude_ingredients[:_MAX_EXCLUDE_ITEMS]
    ]
    safe_pantry = [_sanitize(i, _MAX_INGREDIENT_LEN) for i in pantry_items[:30]]
    safe_recent = [_sanitize(n, 200) for n in recent_meal_names[:20]]

    system_prompt = build_single_day_system_prompt()
    user_prompt = build_single_day_user_prompt(
        day=day,
        diet_type=diet_type,
        calories_target=calories_target,
        meals_per_day=meals_per_day,
        exclude_ingredients=safe_exclude,
        preferences_text=safe_prefs,
        taste_profile=taste_profile,
        pantry_items=safe_pantry,
        recent_meal_names=safe_recent,
        user_recipes=safe_recipes,
        extras=extras,
        juicing_config=juicing_config,
    )

    messages: list[dict[str, str]] = [{"role": "user", "content": user_prompt}]

    for attempt in range(_MAX_ATTEMPTS):
        try:
            parsed = await _call_claude_json(
                model=settings.claude_haiku_model,
                system_prompt=system_prompt,
                messages=messages,
                max_tokens=_enrich_max_tokens(),
                trace_id=f"single_day_{day}",
                phase=f"single_day_{day}",
            )
            return DayPlan.model_validate(parsed)
        except ValidationError as e:
            if attempt < _MAX_ATTEMPTS - 1:
                messages[-1]["content"] += (
                    f"\n\nPrevious response failed schema validation: {str(e)[:300]}. "
                    "Return ONLY valid JSON matching the DayPlan schema exactly."
                )
                continue
            raise


# ── Single-phase Sonnet generation (active path via orchestrator.run_pipeline) ──


def _build_system_prompt() -> str:
    return (
        "You are Nouri, an expert plant-based nutritionist and food writer. "
        "You generate vivid, editorial meal plans. "
        "You ALWAYS respond with ONLY valid JSON — no prose, no markdown fences. "
        "Every meal description should be enticing and specific (2–3 sentences). "
        "Balance raw and cooked meals. Avoid repeating the same meal twice in a week."
    )


def _system_message() -> list[dict[str, Any]]:
    return [
        {
            "type": "text",
            "text": _build_system_prompt(),
            "cache_control": {"type": "ephemeral"},
        }
    ]


def _build_json_schema(
    plan_id: uuid.UUID,
    week_start: date,
    extras: list[ExtraSlot],
    juicing_config: JuicingConfig | None,
    diet_type: str = "",
    plan_days: int = 7,
    day_names: list[str] | None = None,
) -> dict[str, Any]:
    """Build the example JSON schema shown to Claude."""
    active_days = day_names or days_for_plan(plan_days)
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
        "nutrition": {
            "calories": 1800,
            "protein_g": 60,
            "carbs_g": 200,
            "fat_g": 70,
            "fiber_g": 35,
        },
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

    # Only include a single-day example — Claude will replicate for all active_days.
    # Showing all N days here multiplies prompt size N× and risks truncation.
    first_day = active_days[0]
    nutrition_example = {
        "calories": 1800,
        "protein_g": 60,
        "carbs_g": 200,
        "fat_g": 70,
        "fiber_g": 35,
    }
    schema: dict[str, Any] = {
        "plan_id": str(plan_id),
        "week_start": str(week_start),
        "plan_days": plan_days,
        "nutrition_avg": nutrition_example,
        "nutrition_by_day": {first_day: nutrition_example},
        "days": {first_day: day_example},
    }
    return schema


_RATIO_LABELS: dict[str, str] = {
    "100_raw":   "100% raw (every meal must be raw — no cooked ingredients at all)",
    "80_20":     "80% raw / 20% cooked (roughly 1–2 cooked meals across the week)",
    "70_30":     "70% raw / 30% cooked (roughly 2 cooked meals across the week)",
    "50_50":     "50% raw / 50% cooked (alternate raw and cooked meals)",
    "30_70":     "30% raw / 70% cooked (majority cooked, a few raw)",
    "100_cooked":"100% cooked (all meals cooked — no raw meals)",
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
    plan_days: int = 7,
    raw_cooked_ratio: str = "80_20",
    recipe_usage_policy: RecipeUsagePolicy | None = None,
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

    active_days = days_for_plan(plan_days)
    last_day = active_days[-1]
    json_schema = _build_json_schema(
        plan_id, week_start, extras, juicing_config, diet_type, plan_days
    )

    parts: list[str] = []

    # ── Juicing mode preamble (overrides standard meals block) ─────────────────
    if juicing_config:
        solid = juicing_config.solid_meals
        juice_lines = "\n".join(
            f"  - {j.label}: {_JUICE_SIZE_LABELS.get(j.size_oz, f'{j.size_oz}oz')}"
            for j in juicing_config.juices
        )
        ratio_label = _RATIO_LABELS.get(raw_cooked_ratio, raw_cooked_ratio)
        diet_constraint = (
            f"Diet for solid meals: {diet_type}. Daily calorie target: {calories_target} kcal.\n"
            f"RAW/COOKED RATIO for solid meals: {ratio_label}.\n"
        )
        parts.append(
            "JUICING MODE ACTIVE.\n"
            + diet_constraint
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
        ratio_label = _RATIO_LABELS.get(raw_cooked_ratio, raw_cooked_ratio)
        parts.append(
            f"Generate exactly {plan_days} plant-based days starting {week_start} "
            f"(monday through {last_day} only).\n"
            f"Diet: {diet_type}. Daily calorie target: {calories_target} kcal.\n"
            f"Include these meal types each day: {', '.join(meals_per_day)}.\n"
            f"RAW/COOKED RATIO (hard constraint): {ratio_label}. "
            "This overrides any preparation style implied by the diet type. "
            "Set each meal's type field to \"raw\" or \"cooked\" accordingly."
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

    policy = recipe_usage_policy or RecipeUsagePolicy()

    if safe_recipes:
        parts.append(
            f"\nUSER'S SAVED RECIPES ({len(safe_recipes)} recipes):\n"
            + json.dumps(safe_recipes, indent=2)
        )

        # ── Recipe usage policy ────────────────────────────────────────────────
        repeat_slots = policy.flexible_repeat_slots
        repeat_clause = (
            f" Avoid repeating the same recipe across the week. For slots listed in "
            f"flexible_repeat_slots ({', '.join(repeat_slots)}), you may reuse a saved recipe "
            f"if it fits naturally — but do not force repetition. Vary when possible."
            if repeat_slots
            else " Avoid repeating the same recipe across the week."
        )

        if policy.mode == "prefer_saved":
            parts.append(
                "RECIPE USAGE POLICY (prefer_saved): Prioritise the user's saved recipes "
                "across all meal slots. Fill as many slots as possible with saved recipes "
                "before falling back to generated ones." + repeat_clause
            )
        elif policy.mode == "prefer_new":
            parts.append(
                "RECIPE USAGE POLICY (prefer_new): Generate new recipes for most slots. "
                "Use at most 1–2 saved recipes only if they fit the day perfectly." + repeat_clause
            )
        else:  # balanced
            parts.append(
                "RECIPE USAGE POLICY (balanced): Use saved recipes for roughly 40–50% of "
                "slots, preferring breakfast and juice slots. Generate new recipes for the "
                "rest." + repeat_clause
            )
    else:
        parts.append(
            "\nThis is a new user with no saved recipes. "
            "Generate all meals from your own knowledge. "
            "Set source=\"generated\" for every meal."
        )

    # ── Always-on sourcing + ingredient coherence rules ───────────────────────
    parts.append(
        "SOURCE RULES (always apply):\n"
        "- For any meal taken from the user's saved recipes, set source to \"user_recipe\" "
        "and use the recipe name exactly as saved.\n"
        "- For any newly generated meal, set source to \"generated\".\n"
        "INGREDIENT COHERENCE: Select a core set of 8–10 base ingredients and reuse them "
        "across multiple days in different preparations. Vary cooking method and flavour, "
        "not the entire ingredient list. This supports meal prep and reduces grocery waste."
    )

    parts.append(
        "\nReturn ONLY a JSON object. The schema below shows the structure for ONE day — "
        f"replicate it for ALL {plan_days} days: {', '.join(active_days)}.\n"
        + json.dumps(json_schema, indent=2)
        + f"\n\nRules:\n"
        f"- Include exactly these days in `days` and `nutrition_by_day`: {', '.join(active_days)}.\n"
        f"- Do NOT include any day beyond {last_day}.\n"
        "- nutrition_avg = actual estimated weekly averages across all days.\n"
        "- Every meal, juice, and extra needs an ingredients array (3–8 key ingredient names).\n"
        "- Every day object needs a nutrition object (calories, protein_g, carbs_g, fat_g, fiber_g).\n"
        "- juices and extras arrays must be present on every day (use [] if empty)."
    )

    return "\n\n".join(parts)


def _get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key,
        timeout=_CLAUDE_TIMEOUT + 5,  # httpx-level: slightly above our asyncio guard
    )


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
    plan_days: int = 7,
    raw_cooked_ratio: str = "80_20",
    recipe_usage_policy: RecipeUsagePolicy | None = None,
) -> MealPlanResponse:
    """
    Call Claude to generate a multi-day meal plan (4–7 days).
    Supports Phase 8 extras (structured add-ons) and juicing mode.
    Validates the response with MealPlanResponse. Retries up to _MAX_RETRIES
    times with a corrective message on ValidationError or JSON parse failure.
    """
    client = _get_client()
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
        plan_days=plan_days,
        raw_cooked_ratio=raw_cooked_ratio,
        recipe_usage_policy=recipe_usage_policy,
    )

    messages: list[dict[str, str]] = [{"role": "user", "content": user_msg}]
    last_error: str = ""

    for attempt in range(_MAX_RETRIES + 1):
        try:
            response = await asyncio.wait_for(
                client.messages.create(
                    model=settings.claude_model,
                    max_tokens=_MAX_TOKENS,
                    system=_system_message(),
                    messages=messages,  # type: ignore[arg-type]
                ),
                timeout=_CLAUDE_TIMEOUT,
            )
            raw: str = response.content[0].text  # type: ignore[index]
        except asyncio.TimeoutError:
            logger.warning(
                "Claude timed out on attempt %d/%d (%.0fs)",
                attempt + 1,
                _MAX_RETRIES + 1,
                _CLAUDE_TIMEOUT,
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
                error_hint = (
                    f"\n\nPrevious response failed JSON validation: {str(exc)[:300]}. "
                    "Return ONLY valid JSON matching the schema exactly. "
                    "Do not change content, only fix structure."
                )
                messages[-1]["content"] += error_hint
                await asyncio.sleep(1)
                continue

    raise ValueError(
        f"Claude failed to produce valid JSON after {_MAX_RETRIES + 1} attempts. "
        f"Last error: {last_error[:500]}"
    )
