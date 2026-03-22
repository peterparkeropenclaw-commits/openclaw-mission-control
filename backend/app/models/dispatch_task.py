from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class DispatchTask(QueryModel, table=True):
    __tablename__ = "dispatch_tasks"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    title: str
    type: str = Field(index=True)
    priority: str = Field(index=True)
    owner: str = Field(index=True)
    status: str = Field(default="new", index=True)
    context: str | None = Field(default=None, sa_column=Column(Text))
    acceptance_criteria: list[str] | None = Field(default=None, sa_column=Column(JSON))
    result_summary: str | None = Field(default=None, sa_column=Column(Text))
    error_message: str | None = Field(default=None, sa_column=Column(Text))
    source: str
    trigger: str | None = None
    archived: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    assigned_at: datetime | None = None
    completed_at: datetime | None = None
