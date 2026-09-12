from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class GeneratedListing(BaseModel):
    generated_title: str = Field(description="SEO optimized, catchy title for Willhaben")
    generated_description: str = Field(description="Persuasive description. Mention 'New/OVP' and pickup in Vienna")
    suggested_price: float = Field(description="Suggested selling price in Euros")

class ListingGeneratorAgent:
    def generate_willhaben_listing(self, product_title: str, product_category: str, bought_price: float, historical_price: float) -> GeneratedListing:
        system_prompt = (
            "You are a top-tier pricing and sales expert on Willhaben (Austria). "
            "Your task is to generate a listing for a product that was bought on a massive Amazon discount. "
            "The product is 100% Brand New and Unopened (Neu und Originalverpackt - OVP). "
            "PRICING STRATEGY: Calculate a 'suggested_price' that is EXACTLY halfway between the 'bought_price' and the 'historical_price'. "
            "This ensures a fast sale because it's significantly cheaper than Amazon's normal price, but still highly profitable for the seller."
        )
        
        user_prompt = (
            f"Product: {product_title}\n"
            f"Bought for: €{bought_price}\n"
            f"Amazon Normal Price: €{historical_price}\n\n"
            "Generate the German title, description, and the calculated suggested price."
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
            return completion.choices[0].message.parsed
        except Exception as e:
            # FALLBACK MOCK (If OpenAI API fails)
            print(f"⚠️ OpenAI Error: {str(e)}. Using MOCK Listing Data with Auto-Pricing.")
            
            # Auto-Pricing Math: Exactly halfway between bought price and normal market price
            optimal_price = bought_price + ((historical_price - bought_price) / 2)
            
            return GeneratedListing(
                generated_title=f"{product_title} - NEU & OVP!",
                generated_description="Verkaufe hier diesen brandneuen Artikel.\n\nZustand: Absolut neu und originalverpackt (ungeöffnet).\n\nAbholung in Wien oder versicherter Versand möglich. Bei Fragen gerne melden!",
                suggested_price=round(optimal_price, 2)
            )

listing_generator = ListingGeneratorAgent()