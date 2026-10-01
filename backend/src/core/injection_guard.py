"""Input guardrail: a cheap, deterministic prompt-injection check (learn/llmops,
Module 6) for text that reaches an agent's prompt from an external source -
today, Keepa's product title/category.

Deliberately plain regex, not NeMo Guardrails' Colang self-check flows: those
typically cost an extra LLM call per check, which conflicts with this project's
cost-conscious model policy. English and German patterns, since Keepa titles are
sometimes German.
"""

import re

_PATTERNS = [
    r"ignore (all|any|the)? ?previous instructions",
    r"ignore (all|any|the)? ?prior instructions",
    r"disregard (all|any|the)? ?previous instructions",
    r"you are now",
    r"new instructions?:",
    r"system prompt",
    r"^\s*system\s*:",
    r"ignoriere (die|alle) vorherigen anweisungen",
    r"missachte (die|alle) vorherigen anweisungen",
    r"du bist jetzt",
    r"neue anweisung(en)?:",
]

_COMPILED = [re.compile(p, re.IGNORECASE) for p in _PATTERNS]


def looks_like_prompt_injection(text: str | None) -> bool:
    """True if `text` contains a common instruction-override pattern."""
    if not text:
        return False
    return any(pattern.search(text) for pattern in _COMPILED)
