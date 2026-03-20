from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class StatusHeartbeat(QueryModel, table=True):
    __tablename__ = "status_heartbeats"  # pyright: ignore[reportAssignmentType]

    entity_id: str = Field(primary_key=True)
    entity_type: str = Field(index=True)
    role: str = Field(default="", index=True)
    status: str = Field(default="unknown", index=True)
    timestamp: datetime = Field(index=True)
    health: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    activity: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    errors: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    soul: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    last_error_message: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
