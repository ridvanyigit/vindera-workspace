from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class GeneratedListing(BaseModel):
    generated_title: str = Field(description="SEO optimized, catchy title for Willhaben")
    generated_description: str = Field(description="Structured description including Zustand, Lieferumfang, Garantie, Abholung/Versand, and Zahlungsart.")
    suggested_price: float = Field(description="Suggested selling price in Euros")

class ListingGeneratorAgent:
    def generate_willhaben_listing(self, product_title: str, product_category: str, bought_price: float, historical_price: float) -> GeneratedListing:
        system_prompt = (
            "You are an expert Willhaben (Austria) seller and professional copywriter. "
            "Your task is to generate a highly converting listing for a product. "
            "The listing MUST follow this exact structure in German:\n\n"
            "Kurzbeschreibung (Short catchy intro highlighting the deal)\n\n"
            "• Zustand: (e.g., Neu und originalverpackt - ungeöffnet)\n"
            "• Lieferumfang: (What is included in the box)\n"
            "• Garantie/Rechnung: (Mention that the original purchase invoice is available for warranty)\n"
            "• Übergabe: (Abholung in Wien oder versicherter Postversand)\n"
            "• Bezahlung: (Barzahlung bei Abholung, Vorabüberweisung)\n\n"
            "PRICING STRATEGY: Calculate 'suggested_price' exactly halfway between 'bought_price' and 'historical_price'."
        )
        
        user_prompt = (
            f"Product: {product_title}\n"
            f"Category: {product_category}\n"
            f"Bought for: €{bought_price}\n"
            f"Amazon Normal Price: €{historical_price}\n\n"
            "Generate the German title, the strictly structured description, and the calculated suggested price."
        )

        try:
            completion = client.beta.chat.completions.parse(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=GeneratedListing,
            )
            parsed = completion.choices[0].message.parsed
            if parsed is None:
                raise ValueError("OpenAI returned no structured result (refusal or empty response).")
            return parsed
        except Exception as e:
            # Fallback copy is a development aid only; production must fail loudly.
            if not settings.ALLOW_MOCK_DATA:
                raise
            print(f"⚠️ OpenAI Error: {str(e)}. Using MOCK Listing Data with Auto-Pricing (ALLOW_MOCK_DATA=true).")
            
            optimal_price = bought_price + ((historical_price - bought_price) / 2)
            
            mock_desc = (
                "Verkaufe hier diesen brandneuen Artikel zum absoluten Top-Preis. Ideal als Geschenk oder für den Eigengebrauch!\n\n"
                "• Zustand: Absolut neu und originalverpackt (ungeöffnet - Siegel intakt).\n"
                "• Lieferumfang: Kompletter Original-Lieferumfang des Herstellers.\n"
                "• Garantie/Rechnung: Kaufrechnung ist vorhanden und wird für die Herstellergarantie mitgegeben.\n"
                "• Übergabe: Bevorzugt persönliche Abholung in Wien. Versicherter Versand ist nach Absprache ebenfalls möglich.\n"
                "• Bezahlung: Barzahlung bei Abholung oder Banküberweisung im Voraus.\n\n"
                "Bei Interesse oder Fragen können Sie mir gerne eine kurze Nachricht schreiben. Schnelle Antwort garantiert!"
            )
            
            return GeneratedListing(
                generated_title=f"{product_title} - NEU & OVP (Rechnung inkl.)",
                generated_description=mock_desc,
                suggested_price=round(optimal_price, 2)
            )

listing_generator = ListingGeneratorAgent()