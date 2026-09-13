import json
import asyncio
from openai import AsyncOpenAI
from src.core.config import settings
from src.core.database import supabase

# We use AsyncOpenAI to prevent blocking the FastAPI server
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

# Define the Tools (Functions) the AI can use autonomously
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_inventory_status",
            "description": "Get the current list of products in the database, including their ASIN, title, and current status.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "scan_new_asin",
            "description": "Trigger a new deal scan pipeline for a given Amazon ASIN.",
            "parameters": {
                "type": "object",
                "properties": {
                    "asin": {"type": "string", "description": "The 10-character Amazon ASIN code (e.g. B09Y2MYL5C)"}
                },
                "required": ["asin"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_asin",
            "description": "Delete a product and all its data from the database using its ASIN.",
            "parameters": {
                "type": "object",
                "properties": {
                    "asin": {"type": "string", "description": "The 10-character Amazon ASIN code"}
                },
                "required": ["asin"]
            }
        }
    }
]

class ChatbotAgent:
    async def process_message(self, user_message: str) -> str:
        messages = [
            {"role": "system", "content": "You are Vindera AI, a highly capable assistant for an Amazon arbitrage business in Austria. You can manage the database, scan new items, and delete items using your tools. Be concise, professional, and friendly. Answer in the language the user speaks (mostly Turkish or English)."},
            {"role": "user", "content": user_message}
        ]

        try:
            # 1. Send the message and tools to OpenAI
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                tools=tools,
                tool_choice="auto"
            )

            response_message = response.choices[0].message
            
            # 2. Check if AI decided to use a tool
            if response_message.tool_calls:
                messages.append(response_message) # Append the AI's tool call request
                
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    function_response = ""
                    
                    print(f"🤖 AI is executing tool: {function_name} with args {function_args}")

                    # 3. Execute the actual Python code based on AI's choice
                    if function_name == "get_inventory_status":
                        res = supabase.table("opportunities").select("status, products(title, asin)").execute()
                        function_response = json.dumps(res.data) if res.data else "Database is empty."
                    
                    elif function_name == "scan_new_asin":
                        asin = function_args.get("asin")
                        from src.api.endpoints.deals import run_deal_scan_pipeline # Imported here to avoid circular imports
                        asyncio.create_task(run_deal_scan_pipeline(asin))
                        function_response = f"Successfully started background scan for ASIN: {asin}. Tell the user to wait 5 seconds and refresh the page."
                    
                    elif function_name == "delete_asin":
                        asin = function_args.get("asin")
                        supabase.table("products").delete().eq("asin", asin).execute()
                        function_response = f"Successfully deleted ASIN: {asin} from the database. Tell the user it is removed."
                        
                    # 4. Return the tool's result back to OpenAI
                    messages.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": function_response,
                    })
                    
                # 5. Get the final human-readable answer from OpenAI
                second_response = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages
                )
                return second_response.choices[0].message.content

            # If no tool was called, just return the standard text reply
            return response_message.content

        except Exception as e:
            print(f"Chatbot Error: {str(e)}")
            return f"Sorry boss, I encountered an error: {str(e)}"

chatbot_agent = ChatbotAgent()