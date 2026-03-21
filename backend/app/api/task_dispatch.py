from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import case, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.dispatch_task import DispatchTask

router = APIRouter(prefix="/api/tasks", tags=["task-dispatch"])

TaskType = Literal["bugfix", "infra", "research", "growth", "review", "config", "feasibility"]
TaskPriority = Literal["low", "medium", "high", "critical"]
TaskOwner = Literal["ops_director", "builder", "reviewer", "research_commercial", "growth_content", "peter"]
TaskStatus = Literal["new", "assigned", "in_progress", "review", "completed", "failed", "blocked"]
TaskSource = Literal["manual", "ops_director", "brain_dump", "system"]


class DispatchTaskCreate(BaseModel):
    title: str
    type: TaskType
    priority: TaskPriority
    owner: TaskOwner
    context: str | None = None
    acceptance_criteria: list[str] | None = None
    source: TaskSource
    trigger: str | None = None


class DispatchTaskUpdate(BaseModel):
    status: TaskStatus
    result_summary: str | None = None
    error_message: str | None = None


class DispatchTaskRead(BaseModel):
    id: UUID
    title: str
    type: str
    priority: str
    owner: str
    status: str
    context: str | None
    acceptance_criteria: list[str] | None
    result_summary: str | None
    error_message: str | None
    source: str
    trigger: str | None
    created_at: datetime
    updated_at: datetime
    assigned_at: datetime | None
    completed_at: datetime | None


@router.post("/create", response_model=DispatchTaskRead)
async def create_dispatch_task(payload: DispatchTaskCreate, session: AsyncSession = Depends(get_session)) -> DispatchTask:
    now = datetime.now(timezone.utc)
    task = DispatchTask(**payload.model_dump(), created_at=now, updated_at=now)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


@router.get("", response_model=list[DispatchTaskRead])
async def list_dispatch_tasks(
    status: TaskStatus | None = Query(default=None),
    owner: TaskOwner | None = Query(default=None),
    priority: TaskPriority | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[DispatchTask]:
    priority_order = case(
        (DispatchTask.priority == "critical", 0),
        (DispatchTask.priority == "high", 1),
        (DispatchTask.priority == "medium", 2),
        else_=3,
    )
    stmt = select(DispatchTask)
    if status is not None:
        stmt = stmt.where(DispatchTask.status == status)
    if owner is not None:
        stmt = stmt.where(DispatchTask.owner == owner)
    if priority is not None:
        stmt = stmt.where(DispatchTask.priority == priority)
    stmt = stmt.order_by(priority_order, DispatchTask.created_at.asc())
    rows = (await session.exec(stmt)).all()
    return list(rows)


@router.post("/{task_id}/update", response_model=DispatchTaskRead)
async def update_dispatch_task(task_id: UUID, payload: DispatchTaskUpdate, session: AsyncSession = Depends(get_session)) -> DispatchTask:
    task = await session.get(DispatchTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = payload.status
    task.result_summary = payload.result_summary
    task.error_message = payload.error_message
    task.updated_at = datetime.now(timezone.utc)
    if payload.status in {"completed", "failed"}:
        task.completed_at = datetime.now(timezone.utc)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


@router.post("/{task_id}/claim", response_model=DispatchTaskRead)
async def claim_dispatch_task(task_id: UUID, session: AsyncSession = Depends(get_session)) -> DispatchTask:
    task = await session.get(DispatchTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = "assigned"
    task.assigned_at = datetime.now(timezone.utc)
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task
