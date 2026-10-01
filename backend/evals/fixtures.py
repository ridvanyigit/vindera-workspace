"""Realistic scenarios shared by the eval scripts in this folder (learn/llmops
Modules 2/5/6). Deliberately separate from tests/helpers.py: these fixtures feed
real, billed OpenAI calls, and this whole folder is excluded from `uv run pytest`
on purpose (see the package docstring in check_listing_generator.py).
"""

from src.services.keepa_service import KeepaFacts

SCENARIOS: list[KeepaFacts] = [
    KeepaFacts(
        title="Sony WH-1000XM5 Kabelloser Noise Cancelling Kopfhörer",
        category="Technology & Electronics",
        image_url=None,
        current_price=249.0,
        price_source="buybox",
        reference_price=379.0,
        reference_source="buybox_avg90",
        buybox_seller_id="ATVPDKIKX0DER",
        buybox_is_amazon=True,
        buybox_is_fba=True,
        monthly_sold=340,
        price_history=[{"recorded_at": "2026-09-21T12:00:00+00:00", "price_amazon": None, "price_buybox": 249.0}],
    ),
    KeepaFacts(
        title="LEGO Star Wars Millennium Falcon Bauset",
        category="Toys & Games",
        image_url=None,
        current_price=129.0,
        price_source="marketplace_new",
        reference_price=169.0,
        reference_source="amazon_avg90",
        buybox_seller_id="A1UNKNOWNSELLER",
        buybox_is_amazon=False,
        buybox_is_fba=False,
        monthly_sold=None,
        price_history=[{"recorded_at": "2026-09-21T12:00:00+00:00", "price_amazon": 169.0, "price_buybox": None}],
    ),
]

PAYMENT_TEXT = "Barzahlung bei Abholung oder PayPal Freunde/Familie vorab."
LEGAL_FOOTER = "Privatverkauf: keine Garantie, keine Rücknahme, keine Gewährleistung."
