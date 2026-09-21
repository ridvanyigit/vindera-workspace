"""Business expense endpoints.

Costs that don't belong to a single deal (storage rent, packaging, Keepa /
OpenAI subscriptions, ...). The Tax & Reports page reads `business_expenses`
directly (admin-only RLS) and subtracts the total from gross profit; every
write goes through here via the service role.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.core.auth import require_admin
from src.core.database import supabase

router = APIRouter(prefix="/expenses", tags=["Business Expenses"], dependencies=[Depends(require_admin)])


class ExpenseRequest(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=1_000_000)
    category: str = Field(min_length=1, max_length=100)
    incurred_at: date | None = None
    is_recurring: bool = False


def _payload(request: ExpenseRequest) -> dict:
    return {
        "description": request.description.strip(),
        "amount": request.amount,
        "category": request.category.strip(),
        "incurred_at": (request.incurred_at or date.today()).isoformat(),
        "is_recurring": request.is_recurring,
    }


def _validate(payload: dict) -> None:
    if not payload["description"] or not payload["category"]:
        raise HTTPException(status_code=422, detail="Description and category must not be blank.")


@router.post("/", status_code=201)
def create_expense(request: ExpenseRequest):
    """Record one expense."""
    payload = _payload(request)
    _validate(payload)

    try:
        res = supabase.table("business_expenses").insert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "success", "data": res.data[0]}


@router.get("/")
def list_expenses():
    """List every expense, newest first."""
    try:
        res = (
            supabase.table("business_expenses")
            .select("*")
            .order("incurred_at", desc=True)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "success", "data": res.data}


@router.put("/{expense_id}")
def update_expense(expense_id: uuid.UUID, request: ExpenseRequest):
    """Replace every editable field of an expense."""
    payload = _payload(request)
    _validate(payload)

    try:
        res = supabase.table("business_expenses").update(payload).eq("id", str(expense_id)).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=404, detail=f"Expense {expense_id} not found.")

    return {"status": "success", "data": res.data[0]}


@router.delete("/{expense_id}")
def delete_expense(expense_id: uuid.UUID):
    """Delete one expense."""
    try:
        res = supabase.table("business_expenses").delete().eq("id", str(expense_id)).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=404, detail=f"Expense {expense_id} not found.")

    return {"status": "success", "deleted_id": str(expense_id)}
