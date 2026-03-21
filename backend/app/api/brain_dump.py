from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.brain_dump import BrainDump

router = APIRouter(prefix="/api/brain-dump", tags=["brain-dump"])

Category = Literal["Product", "Growth", "Research", "Infrastructure", "Automation", "Ops", "Content", "Other"]
Priority = Literal["low", "medium", "high", "critical"]
ItemStatus = Literal["new", "triaged", "researching", "feasibility", "converted", "archived"]
AssignAction = Literal["research", "builder", "task"]


class BrainDumpCreate(BaseModel):
    title: str
    content: str
    category: Category
    priority: Priority


class BrainDumpRead(BaseModel):
    id: UUID
    title: str
    content: str | None
    category: str
    priority: str
    status: str
    created_at: datetime
    updated_at: datetime
    notes: str | None = None


class BrainDumpStatusUpdate(BaseModel):
    status: ItemStatus


class BrainDumpAssign(BaseModel):
    action: AssignAction


@router.post("", response_model=BrainDumpRead)
async def create_brain_dump(payload: BrainDumpCreate, session: AsyncSession = Depends(get_session)) -> BrainDump:
    now = datetime.now(timezone.utc)
    item = BrainDump(
        title=payload.title,
        content=payload.content,
        category=payload.category,
        priority=payload.priority,
        status="new",
        created_at=now,
        updated_at=now,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.get("", response_model=list[BrainDumpRead])
async def list_brain_dump(session: AsyncSession = Depends(get_session)) -> list[BrainDump]:
    rows = (await session.exec(select(BrainDump).order_by(BrainDump.created_at.desc()))).all()
    return list(rows)


@router.patch("/{item_id}/status", response_model=BrainDumpRead)
async def update_brain_dump_status(item_id: UUID, payload: BrainDumpStatusUpdate, session: AsyncSession = Depends(get_session)) -> BrainDump:
    item = await session.get(BrainDump, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Brain dump item not found")
    item.status = payload.status
    item.updated_at = datetime.now(timezone.utc)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.patch("/{item_id}/assign", response_model=BrainDumpRead)
async def assign_brain_dump(item_id: UUID, payload: BrainDumpAssign, session: AsyncSession = Depends(get_session)) -> BrainDump:
    item = await session.get(BrainDump, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Brain dump item not found")
    item.status = "triaged"
    item.notes = f"Assigned action: {payload.action}"
    item.updated_at = datetime.now(timezone.utc)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item
