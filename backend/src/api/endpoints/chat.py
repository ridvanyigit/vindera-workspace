from fastapi import APIRouter
from pydantic import BaseModel
from src.agents.chatbot_agent import chatbot_agent

router = APIRouter(prefix="/chat", tags=["Chatbot AI"])

class ChatRequest(BaseModel):
    message: str

@router.post("/")
async def handle_chat(request: ChatRequest):
    """Receives a message from the UI widget and returns the AI's response."""
    response = await chatbot_agent.process_message(request.message)
    return {"response": response}