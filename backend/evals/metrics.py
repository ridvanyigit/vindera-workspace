"""Deterministic DeepEval metrics for ListingGeneratorAgent (learn/llmops Module 2;
NoPIIMetric added in Module 6). Deliberately zero-cost: none of these make an
extra LLM call (no "LLM-judge" metric like G-Eval) - the only paid call is the
one real generation each scenario already makes.
"""

from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

REQUIRED_HEADERS = ["Zustand:", "Lieferumfang:", "Garantie/Rechnung:", "Übergabe:"]
FORBIDDEN_WORDS = ["bezahlung", "zahlung", "preis", "€", "eur "]


class ListingStructureMetric(BaseMetric):
    """The generated body must contain all four required German section headers."""

    def __init__(self, threshold: float = 1.0):
        self.threshold = threshold

    def measure(self, test_case: LLMTestCase) -> float:
        missing = [h for h in REQUIRED_HEADERS if h not in test_case.actual_output]
        self.score = 0.0 if missing else 1.0
        self.reason = "missing: " + ", ".join(missing) if missing else "all required headers present"
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return self.success

    @property
    def __name__(self) -> str:
        return "Listing Structure"


class ForbiddenTopicsMetric(BaseMetric):
    """The model's own text must never mention payment or price - those are appended separately."""

    def __init__(self, threshold: float = 1.0):
        self.threshold = threshold

    def measure(self, test_case: LLMTestCase) -> float:
        lowered = test_case.actual_output.lower()
        hits = [w for w in FORBIDDEN_WORDS if w in lowered]
        self.score = 0.0 if hits else 1.0
        self.reason = "forbidden words found: " + ", ".join(hits) if hits else "clean"
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return self.success

    @property
    def __name__(self) -> str:
        return "Forbidden Topics"


class VerbatimAppendMetric(BaseMetric):
    """The owner's payment line and legal footer must appear unchanged, not paraphrased."""

    def __init__(self, expected_output: str, threshold: float = 1.0):
        self.expected_output = expected_output
        self.threshold = threshold

    def measure(self, test_case: LLMTestCase) -> float:
        self.score = 1.0 if self.expected_output in test_case.actual_output else 0.0
        self.reason = "verbatim text found" if self.score else "verbatim text missing or altered"
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return self.success

    @property
    def __name__(self) -> str:
        return "Verbatim Append"


class NoPIIMetric(BaseMetric):
    """learn/llmops Module 6: the generated text must contain no detectable PII."""

    def __init__(self, threshold: float = 1.0):
        self.threshold = threshold

    def measure(self, test_case: LLMTestCase) -> float:
        from src.core.pii_guard import find_pii

        found = find_pii(test_case.actual_output)
        self.score = 0.0 if found else 1.0
        self.reason = "PII found: " + ", ".join(found) if found else "no PII detected"
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return self.success

    @property
    def __name__(self) -> str:
        return "No PII"
