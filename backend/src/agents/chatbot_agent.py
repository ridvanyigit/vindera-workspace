import json
import asyncio
from openai import AsyncOpenAI
from src.core.config import settings
from src.core.database import supabase
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_inventory_status",
            "description": "Get the current list of products in the database, including ASIN, title, and status.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "scan_new_asin",
            "description": "Trigger a new deal scan pipeline for a given Amazon ASIN.",
            "parameters": {"type": "object", "properties": {"asin": {"type": "string"}}, "required": ["asin"]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_asin",
            "description": "Delete a product from the database using its ASIN.",
            "parameters": {"type": "object", "properties": {"asin": {"type": "string"}}, "required": ["asin"]}
        }
    }
]
class ChatbotAgent:
    async def process_message(self, user_message: str) -> str:
        msg = user_message.strip()

        # ========================================================
        # 1. HARDCODED SLASH COMMANDS (CLEAN TEXT)
        # ========================================================

        if msg.startswith("/list"):
            res = supabase.table("opportunities").select("status, products(title, asin)").execute()
            if not res.data:
                return "📦 There are no products in the database yet."
            response_text = "📦 DATABASE INVENTORY:\n"
            for item in res.data:
                response_text += f"• {item['products']['title']} (ASIN: {item['products']['asin']}) | Status: {item['status']}\n"
            return response_text
        if msg.startswith("/scan"):
            parts = msg.split(" ")
            if len(parts) < 2:
                return "⚠️ Please enter an ASIN. Example: /scan B09Y2MYL5C"
            asin = parts[1]
            from src.api.endpoints.deals import run_deal_scan_pipeline
            asyncio.create_task(run_deal_scan_pipeline(asin))
            return f"🚀 Scan started for product with ASIN {asin}. Please refresh the page (Refresh Data) after 5 seconds."
        if msg.startswith("/delete"):
            parts = msg.split(" ")
            if len(parts) < 2:
                return "⚠️ Please enter an ASIN. Example: /delete B09Y2MYL5C"
            asin = parts[1]
            supabase.table("products").delete().eq("asin", asin).execute()
            return f"🗑️ Product with ASIN {asin} and all associated opportunities have been successfully deleted from the database!"
        if msg.startswith("/help"):
            return "🛠️ SYSTEM COMMANDS (No Credits Required):\n\n[ /list ] - Lists all products\n[ /scan ASIN ] - Scans a new product\n[ /delete ASIN ] - Deletes the product from the system\n\n(Note: Natural language chat and autonomous operations require valid OpenAI API credits)."
        
        # ========================================================
        # 2. NATURAL LANGUAGE CHAT (NO FUNCTION CALLING REQUIRED)
        # ========================================================

        if not msg.startswith("/"):
            messages = [
                {"role": "system", "content": "You are Vindera AI, a highly capable assistant for an Amazon arbitrage business in Austria."},
                {"role": "user", "content": msg}
            ]
            response = await client.chat.completions.create(model="gpt-4o-mini", messages=messages)
            return response.choices[0].message.content

        messages = [
            {"role": "system", "content": "You are Vindera AI, a highly capable assistant for an Amazon arbitrage business in Austria."},
            {"role": "user", "content": msg}
        ]
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                tools=tools,
                tool_choice="auto"
            )
            response_message = response.choices[0].message
            if response_message.tool_calls:
                messages.append(response_message)
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    function_response = ""
                    if function_name == "get_inventory_status":
                        res = supabase.table("opportunities").select("status, products(title, asin)").execute()
                        function_response = json.dumps(res.data) if res.data else "Database is empty."
                    elif function_name == "scan_new_asin":
                        from src.api.endpoints.deals import run_deal_scan_pipeline
                        asyncio.create_task(run_deal_scan_pipeline(function_args.get("asin")))
                        function_response = "Scan started."
                    elif function_name == "delete_asin":
                        supabase.table("products").delete().eq("asin", function_args.get("asin")).execute()
                        function_response = "Deleted."
                    messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": function_response})
                second_response = await client.chat.completions.create(model="gpt-4o-mini", messages=messages)
                return second_response.choices[0].message.content
            return response_message.content
        except Exception as e:

        # GRACEFUL FALLBACK (CLEAN TEXT)
            return f"⚠️ ARTIFICIAL INTELLIGENCE CONNECTION ERROR:\nYour OpenAI account has no balance or the API key is incorrect.\n\nTo continue using the system for free, please use the slash commands. Type /help to see the available commands."
chatbot_agent = ChatbotAgent()