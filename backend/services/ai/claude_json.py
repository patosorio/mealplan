from __future__ import annotations

import json
import re
from typing import Any

JSON_PREFILL = "{"

_JSON_OUTPUT_PREAMBLE = (
    "Return ONLY valid JSON matching the schema below. "
    "No prose, no markdown fences."
)

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def json_output_preamble() -> str:
    """Instruction block prepended to every JSON-generating user prompt."""
    return _JSON_OUTPUT_PREAMBLE


def prefill_messages(user_prompt: str) -> list[dict[str, str]]:
    """Build messages array with assistant prefill to force JSON continuation."""
    return [
        {"role": "user", "content": user_prompt},
        {"role": "assistant", "content": JSON_PREFILL},
    ]


def parse_prefilled_response(text: str) -> str:
    """
    Reattach the opening brace stripped by assistant prefill and return
    cleaned JSON text ready for json.loads / model_validate_json.
    """
    raw = JSON_PREFILL + text.strip()
    raw = _FENCE_RE.sub("", raw).strip()
    return raw


def parse_prefilled_json(text: str) -> Any:
    """Parse assistant-prefilled response into a Python object."""
    return json.loads(parse_prefilled_response(text))
