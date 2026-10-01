"""Optional Langfuse LLM tracing (learn/llmops, Module 1). Does nothing unless
both LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set.

Vindera never calls load_dotenv(): values from `.env` reach this process through
Pydantic `Settings`, not through the real `os.environ`. The Langfuse SDK reads its
keys from `os.environ` directly, so they have to be bridged explicitly here -
skipping this step looks fully configured but silently produces zero traces.
"""

import logging
import os

from src.core.config import settings

logger = logging.getLogger("vindera.observability")


def init_langfuse() -> bool:
    """Start Langfuse tracing when both keys are configured. Returns whether it is active."""
    public_key = settings.LANGFUSE_PUBLIC_KEY.get_secret_value().strip() if settings.LANGFUSE_PUBLIC_KEY else ""
    secret_key = settings.LANGFUSE_SECRET_KEY.get_secret_value().strip() if settings.LANGFUSE_SECRET_KEY else ""
    if not public_key or not secret_key:
        return False

    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", public_key)
    os.environ.setdefault("LANGFUSE_SECRET_KEY", secret_key)
    # The Langfuse SDK itself reads LANGFUSE_HOST, regardless of what this
    # project calls its own setting (LANGFUSE_BASE_URL) in .env.
    os.environ.setdefault("LANGFUSE_HOST", settings.LANGFUSE_BASE_URL)

    # Monkey-patches AsyncOpenAI's completion methods (including the
    # `beta.chat` alias both agents use) to report every call to Langfuse.
    # No change needed in the agent files themselves.
    import langfuse.openai  # noqa: F401

    logger.info("Langfuse LLM tracing is active (host: %s)", settings.LANGFUSE_BASE_URL)
    return True
