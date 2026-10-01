"""Compares two ListingGeneratorAgent system-prompt variants and logs the result
to MLflow (learn/llmops Module 5).

`file:./mlruns` (MLflow's plain file store) is deprecated / maintenance-mode in
current MLflow - use a SQLite tracking store instead.

Usage:
    cd backend && PYTHONPATH=. .venv/bin/python evals/compare_prompts_mlflow.py
    cd backend && .venv/bin/mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001
    # then open http://127.0.0.1:5001
"""

import asyncio

import mlflow
from deepeval.test_case import LLMTestCase

from evals.fixtures import SCENARIOS
from evals.metrics import ForbiddenTopicsMetric, ListingStructureMetric
from src.agents.listing_generator_agent import DEFAULT_SYSTEM_PROMPT, listing_generator

# A shorter variant, to see whether trimming the prompt still holds the required structure.
CONCISE_SYSTEM_PROMPT = (
    "German Willhaben listing copywriter. Structure exactly: short intro, then "
    "bullet points '• Zustand:', '• Lieferumfang:', '• Garantie/Rechnung:', '• Übergabe:'. "
    "Never mention payment, price or legal terms - those are added separately."
)

VARIANTS = {"default": DEFAULT_SYSTEM_PROMPT, "concise": CONCISE_SYSTEM_PROMPT}


async def _score_variant(prompt_text: str) -> float:
    scores = []
    for facts in SCENARIOS:
        listing = await listing_generator.generate_willhaben_listing(
            product_title=facts.title, product_category=facts.category,
            payment_text="", legal_footer="", system_prompt_override=prompt_text,
        )
        case = LLMTestCase(input=facts.title, actual_output=listing.generated_description)
        results = []
        for metric in (ListingStructureMetric(), ForbiddenTopicsMetric()):
            results.append(metric.measure(case))
        scores.append(sum(results) / len(results))
    return sum(scores) / len(scores)


def main() -> None:
    mlflow.set_tracking_uri("sqlite:///mlflow.db")
    mlflow.set_experiment("vindera-listing-generator-prompts")

    for name, prompt_text in VARIANTS.items():
        with mlflow.start_run(run_name=name):
            mlflow.log_param("variant", name)
            mlflow.log_param("prompt_text", prompt_text)
            mlflow.log_param("prompt_length_chars", len(prompt_text))
            score = asyncio.run(_score_variant(prompt_text))
            mlflow.log_metric("mean_metric_score", score)
            print(f"{name}: mean_metric_score={score:.2f}")


if __name__ == "__main__":
    main()
