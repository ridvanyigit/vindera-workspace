"""Canonical product categories and Keepa category mapping.

Keepa returns free-form marketplace category names (German, for domain 3 /
Amazon.de). The application works with a small, fixed set of canonical
categories so that the dashboard filter, the Quarterly Category Audit and the
AI seasonality prompts all operate on the same vocabulary.

The canonical list here MUST stay in sync with `TARGET_CATEGORIES` in
`frontend/src/app/page.tsx`.
"""

CANONICAL_CATEGORIES = [
    "Technology & Electronics",
    "Home & Garden",
    "Fashion & Clothing",
    "Toys & Baby",
    "Sports & Outdoors",
    "Automotive",
    "Books & Stationery",
    "Other",
]

FALLBACK_CATEGORY = "Other"

# Lowercase keyword -> canonical category. German keywords cover Amazon.de
# (Keepa domain 3), English keywords cover the other marketplaces.
_KEYWORD_MAP: dict[str, str] = {
    # Technology & Electronics
    "elektronik": "Technology & Electronics",
    "computer": "Technology & Electronics",
    "foto": "Technology & Electronics",
    "handy": "Technology & Electronics",
    "musikinstrumente": "Technology & Electronics",
    "electronics": "Technology & Electronics",
    # Home & Garden
    "küche": "Home & Garden",
    "haushalt": "Home & Garden",
    "wohnen": "Home & Garden",
    "garten": "Home & Garden",
    "baumarkt": "Home & Garden",
    "beleuchtung": "Home & Garden",
    "home": "Home & Garden",
    "garden": "Home & Garden",
    # Fashion & Clothing
    "bekleidung": "Fashion & Clothing",
    "schuhe": "Fashion & Clothing",
    "schmuck": "Fashion & Clothing",
    "uhren": "Fashion & Clothing",
    "koffer": "Fashion & Clothing",
    "fashion": "Fashion & Clothing",
    "clothing": "Fashion & Clothing",
    # Toys & Baby
    "spielzeug": "Toys & Baby",
    "baby": "Toys & Baby",
    "games": "Toys & Baby",
    "toys": "Toys & Baby",
    # Sports & Outdoors
    "sport": "Sports & Outdoors",
    "freizeit": "Sports & Outdoors",
    "camping": "Sports & Outdoors",
    "outdoor": "Sports & Outdoors",
    # Automotive
    "auto": "Automotive",
    "motorrad": "Automotive",
    "kfz": "Automotive",
    "automotive": "Automotive",
    # Books & Stationery
    "bücher": "Books & Stationery",
    "bürobedarf": "Books & Stationery",
    "schreibwaren": "Books & Stationery",
    "books": "Books & Stationery",
    "office": "Books & Stationery",
}


def map_to_canonical_category(raw_category: str | None) -> str:
    """Map a marketplace category name onto the canonical vocabulary.

    Returns `FALLBACK_CATEGORY` when the input is empty or unrecognized, so the
    caller never has to deal with `None`.
    """
    if not raw_category:
        return FALLBACK_CATEGORY

    haystack = raw_category.casefold()

    if raw_category in CANONICAL_CATEGORIES:
        return raw_category

    for keyword, canonical in _KEYWORD_MAP.items():
        if keyword in haystack:
            return canonical

    return FALLBACK_CATEGORY
