"""Output guardrail: PII detection for generated listing text (learn/llmops, Module 6).

Wraps Presidio's AnalyzerEngine with the German spaCy model, since every listing
this project generates is German (Willhaben). `PERSON` is deliberately excluded:
the small `de_core_news_sm` model flags ordinary capitalized German adjectives
(e.g. "Tolle") as a person's name at high confidence - a real false positive found
while building this. Only pattern/checksum-based entities are kept, which is
exactly what an AI-generated German product listing should never contain.
"""

from functools import lru_cache

from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

PII_ENTITIES = ["EMAIL_ADDRESS", "PHONE_NUMBER", "IBAN_CODE", "CREDIT_CARD"]


@lru_cache(maxsize=1)
def _analyzer() -> AnalyzerEngine:
    """Built once per process: loading the spaCy model is the expensive part."""
    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "de", "model_name": "de_core_news_sm"}],
        }
    )
    return AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=["de"])


def find_pii(text: str) -> list[str]:
    """Return the PII entity types found in `text` (empty list = clean)."""
    if not text.strip():
        return []
    results = _analyzer().analyze(text=text, language="de", entities=PII_ENTITIES)
    return sorted({r.entity_type for r in results})
