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
TaskOwner = Literal["ops_director", "builder", "reviewer", "qa", "coder", "research_commercial", "growth_content", "peter"]
TaskStatus = Literal["new", "assigned", "in_progress", "review", "completed", "failed", "blocked"]
TaskSource = Literal["manual", "ops_director", "brain_dump", "system", "auto_escalation"]


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


def getEscalationOwner(task: DispatchTask, classification: str, retryCount: int) -> str:
    owner = task.owner

    if owner == "builder" or owner == "reviewer" or owner == "qa":
        if classification == "transient" and retryCount == 0:
            return owner
        return "coder"

    if owner == "coder":
        return "peter"

    if classification in ["infra", "config", "auth", "deploy"]:
        return "peter"

    return "peter"


def classify_failure(task: DispatchTask, error_message: str | None) -> str:
    text = f"{task.title}\n{task.context or ''}\n{error_message or ''}".lower()
    if any(word in text for word in ["timeout", "timed out", "econnreset", "temporar", "rate limit", "429"]):
        return "transient"
    if any(word in text for word in ["infra", "database", "railway", "network", "connection"]):
        return "infra"
    if any(word in text for word in ["auth", "token", "unauthorized", "forbidden", "401", "403"]):
        return "auth"
    if any(word in text for word in ["config", "missing env", "misconfigured"]):
        return "config"
    if any(word in text for word in ["deploy", "build", "vercel"]):
        return "deploy"
    if any(word in text for word in ["logic", "assert", "exception", "traceback"]):
        return "logic"
    return "unknown"


async def _find_existing_followup(session: AsyncSession, task: DispatchTask, *, owner: str | None = None, source: str | None = None, trigger: str | None = None) -> DispatchTask | None:
    stmt = select(DispatchTask).where(DispatchTask.context.contains(str(task.id)))
    if owner is not None:
        stmt = stmt.where(DispatchTask.owner == owner)
    if source is not None:
        stmt = stmt.where(DispatchTask.source == source)
    if trigger is not None:
        stmt = stmt.where(DispatchTask.trigger == trigger)
    stmt = stmt.order_by(DispatchTask.created_at.asc()).limit(1)
    return (await session.exec(stmt)).first()


async def _auto_route_failed_task(session: AsyncSession, task: DispatchTask) -> None:
    print(f"[ops-director] detected failed task {task.id}")
    classification = classify_failure(task, task.error_message)
    print(f"[ops-director] classified {task.id} as {classification}")

    retry_count = 0
    existing_retry = await _find_existing_followup(session, task, owner=task.owner, source="system", trigger="retry_failed_task")
    if existing_retry is not None:
        retry_count = 1

    target_owner = getEscalationOwner(task, classification, retry_count)
    chain = [f"original task ID: {task.id}"]
    if existing_retry is not None:
        chain.append(f"retry task ID: {existing_retry.id}")

    if target_owner == task.owner and classification == "transient" and retry_count == 0:
        followup = await _find_existing_followup(session, task, owner=task.owner, source="system", trigger="retry_failed_task")
        if followup is None:
            now = datetime.now(timezone.utc)
            followup = DispatchTask(
                title=task.title,
                type=task.type,
                priority=task.priority,
                owner=task.owner,
                status="new",
                context=f"Retry of task {task.id}\nFailure details: {task.error_message or task.result_summary or 'unknown'}",
                acceptance_criteria=task.acceptance_criteria,
                source="system",
                trigger="retry_failed_task",
                created_at=now,
                updated_at=now,
            )
            session.add(followup)
            await session.flush()
        print(f"[ops-director] retry created for {task.id} → {followup.id}")
        task.status = "blocked"
        task.result_summary = f"Auto-rerouted to {task.owner}"
        task.updated_at = datetime.now(timezone.utc)
        session.add(task)
        print(f"[ops-director] marked original task as blocked {task.id}")
        return

    if target_owner == "coder":
        followup = await _find_existing_followup(session, task, owner="coder", source="system", trigger="agent_reroute")
        if followup is None:
            now = datetime.now(timezone.utc)
            followup = DispatchTask(
                title="[Reroute] " + task.title,
                type=task.type,
                priority=task.priority,
                owner="coder",
                status="new",
                context=f"Original task ID: {task.id}\nFailure details: {task.error_message or task.result_summary or 'unknown'}",
                acceptance_criteria=task.acceptance_criteria,
                source="system",
                trigger="agent_reroute",
                created_at=now,
                updated_at=now,
            )
            session.add(followup)
            await session.flush()
        print(f"[ops-director] reroute created for {task.id} → {followup.id}")
        task.status = "blocked"
        task.result_summary = "Auto-rerouted to coder"
        task.updated_at = datetime.now(timezone.utc)
        session.add(task)
        print(f"[ops-director] marked original task as blocked {task.id}")
        return

    existing_escalation = await _find_existing_followup(session, task, owner="peter", source="auto_escalation")
    if existing_escalation is None:
        now = datetime.now(timezone.utc)
        followup = DispatchTask(
            title="[Escalation] " + task.title,
            type=task.type,
            priority=task.priority,
            owner="peter",
            status="new",
            context="\n".join(chain + [f"failure details: {task.error_message or task.result_summary or 'unknown'}"]),
            acceptance_criteria=task.acceptance_criteria,
            source="auto_escalation",
            trigger="agent_escalation",
            created_at=now,
            updated_at=now,
        )
        session.add(followup)
        await session.flush()
        existing_escalation = followup
    print(f"[ops-director] escalation created for {task.id} → {existing_escalation.id}")
    task.status = "blocked"
    task.result_summary = "Auto-escalated to Peter"
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)
    print(f"[ops-director] marked original task as blocked {task.id}")


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
    source: TaskSource | None = Query(default=None),
    trigger: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
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
    if source is not None:
        stmt = stmt.where(DispatchTask.source == source)
    if trigger is not None:
        stmt = stmt.where(DispatchTask.trigger == trigger)
    stmt = stmt.order_by(priority_order, DispatchTask.created_at.asc())
    if limit is not None:
        stmt = stmt.limit(limit)
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
    if payload.status == "failed":
        await _auto_route_failed_task(session, task)
    await session.commit()
    await session.refresh(task)
    return task


@router.post("/{task_id}/claim", response_model=DispatchTaskRead)
async def claim_dispatch_task(task_id: UUID, session: AsyncSession = Depends(get_session)) -> DispatchTask:
    task = await session.get(DispatchTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "new":
        raise HTTPException(status_code=409, detail="Task can only be claimed from new state")
    task.status = "assigned"
    task.assigned_at = datetime.now(timezone.utc)
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task
