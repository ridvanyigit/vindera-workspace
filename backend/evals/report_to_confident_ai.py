"""Reports the same checks as check_listing_generator.py to Confident AI
(DeepEval's free cloud dashboard) (learn/llmops Module 2).

`deepeval test run` + `assert_test()` (the "official" async path) collides with
this project's async OpenAI client on Python 3.14 (`NoEventLoopError`). The fix:
make every real OpenAI call first with plain `asyncio.run()` - the exact same,
already-proven method as check_listing_generator.py - then hand the finished
LLMTestCase objects to DeepEval's synchronous `evaluate()`. DeepEval's own async
test orchestration never touches a real OpenAI call this way.

First run `cd backend && uv run deepeval login` once (stores its own local
session; see `backend/.deepeval/` and `.deepeval-cache.json` in .gitignore).

Usage:
    cd backend && PYTHONPATH=. .venv/bin/python evals/report_to_confident_ai.py
"""

import asyncio

from deepeval import evaluate
from deepeval.test_case import LLMTestCase

from evals.fixtures import LEGAL_FOOTER, PAYMENT_TEXT, SCENARIOS
from evals.metrics import ForbiddenTopicsMetric, ListingStructureMetric, NoPIIMetric, VerbatimAppendMetric
from src.agents.listing_generator_agent import listing_generator
from src.core.observability import init_langfuse


async def _generate_all() -> tuple[list[LLMTestCase], list[LLMTestCase]]:
    bare_cases, verbatim_cases = [], []
    for facts in SCENARIOS:
        bare = await listing_generator.generate_willhaben_listing(
            product_title=facts.title, product_category=facts.category,
            payment_text="", legal_footer="",
        )
        bare_cases.append(LLMTestCase(input=facts.title, actual_output=bare.generated_description))

        full = await listing_generator.generate_willhaben_listing(
            product_title=facts.title, product_category=facts.category,
            payment_text=PAYMENT_TEXT, legal_footer=LEGAL_FOOTER,
        )
        verbatim_cases.append(LLMTestCase(input=facts.title, actual_output=full.generated_description))
    return bare_cases, verbatim_cases


def main() -> None:
    init_langfuse()
    bare_cases, verbatim_cases = asyncio.run(_generate_all())

    evaluate(
        test_cases=bare_cases,
        metrics=[ListingStructureMetric(), ForbiddenTopicsMetric(), NoPIIMetric()],
    )
    evaluate(
        test_cases=verbatim_cases,
        metrics=[VerbatimAppendMetric(expected_output=LEGAL_FOOTER)],
    )


if __name__ == "__main__":
    main()
