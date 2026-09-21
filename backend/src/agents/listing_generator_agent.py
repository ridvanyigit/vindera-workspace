"""Listing Generator Agent: German Willhaben copy.

The model writes the title and the body. The payment line and the legal footer
are NOT written by the model: they are appended verbatim from `business_settings`
(`listing_payment_text`, `listing_legal_footer`), so the owner controls that wording
and no legal text is ever generated. The price is not this agent's job either.
"""

import logging

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from src.core.config import settings
from src.core.metrics import OPENAI_ERRORS

logger = logging.getLogger(__name__)

client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key",
    timeout=60.0,
    max_retries=2,
)


class GeneratedListing(BaseModel):
    generated_title: str = Field(description="SEO optimized, catchy title for Willhaben")
    generated_description: str = Field(description="Structured description including Zustand, Lieferumfang, Garantie/Rechnung and Übergabe. No payment information.")


class ListingGeneratorAgent:
    async def generate_willhaben_listing(
        self,
        product_title: str,
        product_category: str,
        payment_text: str,
        legal_footer: str = "",
    ) -> GeneratedListing:
        system_prompt = (
            "You are an expert Willhaben (Austria) seller and professional copywriter. "
            "Your task is to generate a highly converting listing for a product. "
            "The listing MUST follow this exact structure in German:\n\n"
            "Kurzbeschreibung (Short catchy intro)\n\n"
            "• Zustand: (e.g., Neu und originalverpackt - ungeöffnet)\n"
            "• Lieferumfang: (What is included in the box)\n"
            "• Garantie/Rechnung: (Mention that the original purchase invoice is available for warranty)\n"
            "• Übergabe: (Abholung in Wien oder versicherter Postversand)\n\n"
            "Do NOT mention payment methods, prices, legal terms or comparisons with other shops; "
            "those are added separately."
        )
        user_prompt = (
            f"Product: {product_title}\n"
            f"Category: {product_category}\n\n"
            "Generate the German title and the strictly structured description."
        )

        try:
            if not settings.openai_configured:
                raise RuntimeError("OpenAI API key is not configured.")
            completion = await client.beta.chat.completions.parse(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format=GeneratedListing,
            )
            parsed = completion.choices[0].message.parsed
            if parsed is None:
                raise ValueError("OpenAI returned no structured result (refusal or empty response).")
        except Exception as e:
            OPENAI_ERRORS.inc()
            # Fallback copy is a development aid only; production must fail loudly.
            if not settings.ALLOW_MOCK_DATA:
                raise
            logger.warning("OpenAI failed (%s); using MOCK listing (ALLOW_MOCK_DATA=true)", type(e).__name__)
            parsed = self._mock_listing(product_title)

        return GeneratedListing(
            generated_title=parsed.generated_title,
            generated_description=self.append_fixed_text(parsed.generated_description, payment_text, legal_footer),
        )

    @staticmethod
    def append_fixed_text(description: str, payment_text: str, legal_footer: str) -> str:
        """Add the owner-controlled payment line and legal footer, verbatim."""
        text = description.rstrip()
        if payment_text.strip():
            text += f"\n• Bezahlung: {payment_text.strip()}"
        if legal_footer.strip():
            text += f"\n\n{legal_footer.strip()}"
        return text

    @staticmethod
    def _mock_listing(product_title: str) -> GeneratedListing:
        description = (
            "Verkaufe hier diesen brandneuen Artikel. Ideal als Geschenk oder für den Eigengebrauch!\n\n"
            "• Zustand: Absolut neu und originalverpackt (ungeöffnet - Siegel intakt).\n"
            "• Lieferumfang: Kompletter Original-Lieferumfang des Herstellers.\n"
            "• Garantie/Rechnung: Kaufrechnung ist vorhanden und wird für die Herstellergarantie mitgegeben.\n"
            "• Übergabe: Bevorzugt persönliche Abholung in Wien. Versicherter Versand ist nach Absprache ebenfalls möglich."
        )
        return GeneratedListing(
            generated_title=f"{product_title} - NEU & OVP (Rechnung inkl.)",
            generated_description=description,
        )


listing_generator = ListingGeneratorAgent()
