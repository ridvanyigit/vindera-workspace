"""Console eval runner for ListingGeneratorAgent (learn/llmops Module 2).

Deliberately lives outside backend/tests/: tests/conftest.py blocks every
outgoing socket by design, and this script makes real, billed OpenAI calls.
`uv run pytest -q` never discovers or runs anything in this folder.

Usage:
    cd backend && PYTHONPATH=. .venv/bin/python evals/check_listing_generator.py
"""

import asyncio

from deepeval.test_case import LLMTestCase

from evals.fixtures import LEGAL_FOOTER, PAYMENT_TEXT, SCENARIOS
from evals.metrics import ForbiddenTopicsMetric, ListingStructureMetric, NoPIIMetric, VerbatimAppendMetric
from src.agents.listing_generator_agent import listing_generator
from src.core.observability import init_langfuse


async def main() -> None:
    init_langfuse()
    total = passed = 0

    for facts in SCENARIOS:
        # Call 1: no payment/footer text, so structure/forbidden-topics/PII only
        # ever see the model's own words.
        bare = await listing_generator.generate_willhaben_listing(
            product_title=facts.title, product_category=facts.category,
            payment_text="", legal_footer="",
        )
        bare_case = LLMTestCase(input=facts.title, actual_output=bare.generated_description)
        for metric in (ListingStructureMetric(), ForbiddenTopicsMetric(), NoPIIMetric()):
            metric.measure(bare_case)
            total += 1
            passed += int(metric.is_successful())
            print(f"[{'PASS' if metric.is_successful() else 'FAIL'}] {facts.title} - {metric.__name__}: {metric.reason}")

        # Call 2: real payment/footer text, to check it survives verbatim.
        full = await listing_generator.generate_willhaben_listing(
            product_title=facts.title, product_category=facts.category,
            payment_text=PAYMENT_TEXT, legal_footer=LEGAL_FOOTER,
        )
        full_case = LLMTestCase(input=facts.title, actual_output=full.generated_description)
        verbatim = VerbatimAppendMetric(expected_output=LEGAL_FOOTER)
        verbatim.measure(full_case)
        total += 1
        passed += int(verbatim.is_successful())
        print(f"[{'PASS' if verbatim.is_successful() else 'FAIL'}] {facts.title} - {verbatim.__name__}: {verbatim.reason}")

    print(f"\n{passed}/{total} checks passed.")


if __name__ == "__main__":
    asyncio.run(main())
