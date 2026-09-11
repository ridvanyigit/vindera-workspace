from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings

# Bu ajan, satın almaya karar verdiğimiz ürün için "Willhaben" platformuna özel, satış odaklı Almanca bir başlık ve açıklama yazacak.

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class GeneratedListing(BaseModel):
    title: str = Field(description="SEO optimized, catchy German title for Willhaben. Max 50 characters.")
    description: str = Field(description="Persuasive German description for the product. Mentioning it is brand new (Neu / OVP).")
    suggested_price: float = Field(description="Suggested selling price in Euros on Willhaben.")

class ListingGeneratorAgent:
    def generate_willhaben_listing(self, product_title: str, product_category: str, bought_price: float, historical_price: float) -> GeneratedListing:
        """
        Generates a German listing for Willhaben based on the Amazon product details.
        """
        system_prompt = (
            "You are a top-tier sales expert on Willhaben (Austria's largest classified ads platform). "
            "Write listings in Austrian-German. The tone should be friendly, trustworthy, and professional. "
            "Always emphasize that the product is 'Neu und Originalverpackt' (Brand new and originally packaged). "
            "Create a reasonable selling price that is lower than the historical Amazon price but higher than the bought price."
        )

        user_prompt = (
            f"Original Amazon Title: {product_title}\n"
            f"Category: {product_category}\n"
            f"I bought it for: €{bought_price}\n"
            f"Normal Market Price: €{historical_price}\n\n"
            "Create the Willhaben listing data in JSON format."
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
            print(f"Error in ListingGeneratorAgent: {str(e)}")
            return GeneratedListing(title="Error", description="Failed to generate listing.", suggested_price=0.0)

listing_generator = ListingGeneratorAgent()