from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from src.agents.chatbot_agent import chatbot_agent
from src.core.auth import require_admin
from src.core.rate_limit import CHAT_LIMIT, limiter

router = APIRouter(prefix="/chat", tags=["Chatbot AI"], dependencies=[Depends(require_admin)])

MAX_MESSAGE_LENGTH = 2000


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


@router.post("/")
@limiter.limit(CHAT_LIMIT)
async def handle_chat(request: Request, payload: ChatRequest):
    """Receives a message from the UI widget and returns the AI's response."""
    response = await chatbot_agent.process_message(payload.message)
    return {"response": response}
