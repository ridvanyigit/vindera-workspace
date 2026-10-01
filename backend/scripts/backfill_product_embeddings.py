"""One-off backfill: embeds every `products` row that has no embedding yet
(learn/llmops Module 3), using OpenAI's text-embedding-3-small.

Safety check: refuses to run unless SUPABASE_URL is local. A real scan was once
accidentally run against the hosted project because backend/.env's SUPABASE_URL
had silently been left pointed at it - a write script gets the same check.

Usage (local values only; never point this at the hosted project):
    cd backend && SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_SERVICE_ROLE_KEY="<local service role key>" \\
      PYTHONPATH=. .venv/bin/python scripts/backfill_product_embeddings.py
"""

import asyncio
import logging

from openai import AsyncOpenAI

from src.core.config import settings
from src.core.database import supabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vindera.backfill_embeddings")

EMBEDDING_MODEL = "text-embedding-3-small"
_LOCAL_HOSTS = ("127.0.0.1", "localhost")


def _assert_local_supabase() -> None:
    if not any(host in settings.SUPABASE_URL for host in _LOCAL_HOSTS):
        raise RuntimeError(
            f"SUPABASE_URL ({settings.SUPABASE_URL}) is not local. "
            "Refusing to run a write script against the hosted project."
        )


async def main() -> None:
    _assert_local_supabase()
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else None)

    res = supabase.table("products").select("id, title, category").is_("embedding", "null").execute()
    rows = res.data or []
    if not rows:
        logger.info("Nothing to backfill - every product already has an embedding.")
        return

    for row in rows:
        text = f"{row['title']} ({row['category']})"
        embedding = await client.embeddings.create(model=EMBEDDING_MODEL, input=text)
        vector = embedding.data[0].embedding
        supabase.table("products").update({"embedding": vector}).eq("id", row["id"]).execute()
        logger.info("Embedded %s (%d dimensions)", row["title"], len(vector))

    logger.info("Backfilled %d product(s).", len(rows))


if __name__ == "__main__":
    asyncio.run(main())
