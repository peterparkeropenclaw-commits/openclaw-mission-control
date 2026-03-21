from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, Text
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class BrainDump(QueryModel, table=True):
    __tablename__ = "brain_dump"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    title: str
    content: str | None = Field(default=None, sa_column=Column(Text))
    category: str = Field(default="Other", index=True)
    priority: str = Field(default="medium", index=True)
    status: str = Field(default="new", index=True)
    notes: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
