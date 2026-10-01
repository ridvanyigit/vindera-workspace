"""Optional, local "second opinion" model (learn/llmops, Module 9).

Off by default (`ENABLE_SECOND_OPINION_MODEL=false`). When enabled, re-runs the
exact same analysis DealAnalyzerAgent does, but against a free, self-hosted model
served by Ollama (an OpenAI-compatible endpoint) instead of OpenAI. The result is
only logged by the scan pipeline for comparison - it never reaches a persisted
deal and can never change the real verdict. Never raises: any failure (Ollama not
running, an unparseable response, a network error) is swallowed and reported as
`None`, exactly like "no second opinion available".
"""

import logging

from openai import AsyncOpenAI

from src.agents.deal_analyzer_agent import SYSTEM_PROMPT, LlmAnalysis, _describe_facts
from src.core.config import settings
from src.services.keepa_service import KeepaFacts

logger = logging.getLogger(__name__)

client = AsyncOpenAI(base_url=settings.SECOND_OPINION_BASE_URL, api_key="ollama", timeout=30.0, max_retries=1)


async def get_second_opinion(facts: KeepaFacts, upcoming_events: str) -> LlmAnalysis | None:
    """Ask the local model the same question OpenAI was asked. `None` means "skip"."""
    if not settings.ENABLE_SECOND_OPINION_MODEL:
        return None

    user_prompt = (
        f"Product: {facts.title}\n"
        f"Category: {facts.category}\n"
        f"Upcoming events (next 90 days): {upcoming_events}\n"
        f"{_describe_facts(facts)}"
    )

    try:
        completion = await client.beta.chat.completions.parse(
            model=settings.SECOND_OPINION_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format=LlmAnalysis,
        )
        return completion.choices[0].message.parsed
    except Exception as e:
        logger.warning("Second-opinion model call failed (%s); ignored", type(e).__name__)
        return None
