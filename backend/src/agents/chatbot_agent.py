"""Chatbot Agent backing the workspace AI terminal.

Two execution modes:
  1. Slash commands  - deterministic, hit Supabase directly, need no API credits.
  2. Natural language - gpt-4o-mini with function calling over the same actions.
"""

import asyncio
import json

from openai import AsyncOpenAI

from src.core.config import settings
from src.core.database import supabase

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = "You are Vindera AI, a highly capable assistant for an Amazon arbitrage business in Austria."

HELP_TEXT = (
    "🛠️ SYSTEM COMMANDS (No Credits Required):\n\n"
    "[ /list ] - Lists all products\n"
    "[ /scan ASIN ] - Scans a new product\n"
    "[ /delete ASIN ] - Deletes the product from the system\n\n"
    "(Note: Natural language chat and autonomous operations require valid OpenAI API credits)."
)

AI_UNAVAILABLE_TEXT = (
    "⚠️ ARTIFICIAL INTELLIGENCE CONNECTION ERROR:\n"
    "Your OpenAI account has no balance or the API key is incorrect.\n\n"
    "To continue using the system for free, please use the slash commands. "
    "Type /help to see the available commands."
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_inventory_status",
            "description": "Get the current list of products in the database, including ASIN, title, and status.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "scan_new_asin",
            "description": "Trigger a new deal scan pipeline for a given Amazon ASIN.",
            "parameters": {"type": "object", "properties": {"asin": {"type": "string"}}, "required": ["asin"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_asin",
            "description": "Delete a product from the database using its ASIN.",
            "parameters": {"type": "object", "properties": {"asin": {"type": "string"}}, "required": ["asin"]},
        },
    },
]


class ChatbotAgent:
    async def process_message(self, user_message: str) -> str:
        msg = user_message.strip()

        if msg.startswith("/"):
            return self._handle_slash_command(msg)

        return await self._handle_natural_language(msg)

    # --- Slash commands ---------------------------------------------------

    def _handle_slash_command(self, msg: str) -> str:
        if msg.startswith("/help"):
            return HELP_TEXT

        if msg.startswith("/list"):
            return self._list_inventory()

        if msg.startswith("/scan"):
            asin = self._parse_asin(msg)
            if not asin:
                return "⚠️ Please enter an ASIN. Example: /scan B09Y2MYL5C"
            return self._scan_asin(asin)

        if msg.startswith("/delete"):
            asin = self._parse_asin(msg)
            if not asin:
                return "⚠️ Please enter an ASIN. Example: /delete B09Y2MYL5C"
            return self._delete_asin(asin)

        return f"⚠️ Unknown command: {msg.split(' ')[0]}\n\n{HELP_TEXT}"

    @staticmethod
    def _parse_asin(msg: str) -> str | None:
        parts = msg.split(" ", 1)
        return parts[1].strip().upper() if len(parts) > 1 and parts[1].strip() else None

    @staticmethod
    def _list_inventory() -> str:
        res = supabase.table("opportunities").select("status, products(title, asin)").execute()
        if not res.data:
            return "📦 There are no products in the database yet."

        lines = ["📦 DATABASE INVENTORY:"]
        for item in res.data:
            product = item.get("products") or {}
            lines.append(
                f"• {product.get('title', 'Unknown')} (ASIN: {product.get('asin', 'N/A')}) | Status: {item['status']}"
            )
        return "\n".join(lines)

    @staticmethod
    def _scan_asin(asin: str) -> str:
        from src.api.endpoints.deals import run_deal_scan_pipeline

        asyncio.create_task(run_deal_scan_pipeline(asin))
        return f"🚀 Scan started for product with ASIN {asin}. The workspace updates automatically when it finishes."

    @staticmethod
    def _delete_asin(asin: str) -> str:
        supabase.table("products").delete().eq("asin", asin).execute()
        return f"🗑️ Product with ASIN {asin} and all associated opportunities have been successfully deleted!"

    # --- Natural language -------------------------------------------------

    async def _handle_natural_language(self, msg: str) -> str:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": msg},
        ]

        try:
            response = await client.chat.completions.create(
                model=MODEL,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
            )
            response_message = response.choices[0].message

            if not response_message.tool_calls:
                return response_message.content

            # Standard two-step tool-calling roundtrip.
            messages.append(response_message)
            for tool_call in response_message.tool_calls:
                messages.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": tool_call.function.name,
                    "content": self._run_tool(tool_call.function.name, json.loads(tool_call.function.arguments)),
                })

            follow_up = await client.chat.completions.create(model=MODEL, messages=messages)
            return follow_up.choices[0].message.content
        except Exception as e:
            print(f"⚠️ OpenAI Error in ChatbotAgent: {str(e)}")
            return AI_UNAVAILABLE_TEXT

    def _run_tool(self, name: str, args: dict) -> str:
        if name == "get_inventory_status":
            res = supabase.table("opportunities").select("status, products(title, asin)").execute()
            return json.dumps(res.data) if res.data else "Database is empty."

        if name == "scan_new_asin":
            return self._scan_asin(args.get("asin", ""))

        if name == "delete_asin":
            return self._delete_asin(args.get("asin", ""))

        return f"Unknown tool: {name}"


chatbot_agent = ChatbotAgent()
