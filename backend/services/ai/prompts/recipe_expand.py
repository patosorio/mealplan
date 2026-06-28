from __future__ import annotations


def build_expand_system_prompt() -> str:
    return (
        "You are Nouri, an expert plant-based chef and nutritionist. "
        "You write clear, practical recipes for home cooks. "
        "You ALWAYS respond with ONLY valid JSON — no prose, no markdown fences."
    )


def build_expand_user_prompt(
    name: str,
    description: str,
    diet_type: str,
    tags: list[str],
    prep_minutes: int,
) -> str:
    tags_str = ", ".join(tags) if tags else "none"
    prep_str = f"{prep_minutes} minutes" if prep_minutes else "not specified"

    return (
        f"Generate a complete plant-based recipe for: {name}\n\n"
        f"Description: {description}\n"
        f"Diet type: {diet_type}\n"
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
