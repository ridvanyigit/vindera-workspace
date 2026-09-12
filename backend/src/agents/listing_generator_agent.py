from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class GeneratedListing(BaseModel):
    generated_title: str = Field(description="SEO optimized, catchy title")
    generated_description: str = Field(description="Persuasive description. Mention 'New/OVP'")
    suggested_price: float = Field(description="Suggested selling price in Euros")

class ListingGeneratorAgent:
    def generate_willhaben_listing(self, product_title: str, product_category: str, bought_price: float, historical_price: float) -> GeneratedListing:
        system_prompt = "You are a top-tier sales expert on Willhaben..."
        user_prompt = f"Product: {product_title}"

        try:
            completion = client.beta.chat.completions.parse(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=GeneratedListing,
            )
            return completion.choices[0].message.parsed
        except Exception as e:
            # FALLBACK: Return a successful MOCK German listing
            print(f"⚠️ OpenAI Error: {str(e)}. Using MOCK Listing Data.")
            return GeneratedListing(
                generated_title=f"{product_title} - NEU & OVP!",
                generated_description="Verkaufe hier diesen brandneuen Artikel.\n\nZustand: Absolut neu und originalverpackt (ungeöffnet).\n\nAbholung in Wien oder versicherter Versand möglich. Bei Fragen gerne melden!",
                suggested_price=historical_price * 0.9 # 10% cheaper than Amazon historical price
            )

listing_generator = ListingGeneratorAgent()