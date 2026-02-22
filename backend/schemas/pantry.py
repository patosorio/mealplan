from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class PantryItemCreate(BaseModel):
    name: str
    quantity: Optional[str] = None
    category: Optional[str] = None


class PantryItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[str] = None
    category: Optional[str] = None


class PantryItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    quantity: Optional[str] = None
    category: Optional[str] = None
    added_at: datetime


class ShoppingItem(BaseModel):
    """A single item inside a ShoppingList.items JSONB array."""

    name: str
    qty: Optional[str] = None
    category: Optional[str] = None
    checked: bool = False


class ShoppingListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    meal_plan_id: Optional[uuid.UUID] = None
    items: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class ShoppingItemToggle(BaseModel):
    """Payload for PATCH /shopping/{id}/items/{item_id}."""

    checked: bool


class GenerateShoppingListRequest(BaseModel):
    """Payload for POST /shopping/generate."""

    meal_plan_id: uuid.UUID
