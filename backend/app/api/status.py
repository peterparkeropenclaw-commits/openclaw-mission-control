from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import case, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.dispatch_task import DispatchTask
from app.models.status_heartbeat import StatusHeartbeat

Status = Literal["healthy", "degraded", "down", "unknown", "misconfigured"]
DEFAULT_EXPECTED_INTERVAL_SECONDS = 360
STALE_MULTIPLIER = 2


class AgentStatus(BaseModel):
    id: str
    name: str
    status: Status
    model: Optional[str] = None
    channel: Optional[str] = None
    last_heartbeat_at: Optional[str] = None
    last_error: Optional[str] = None


class ServiceStatus(BaseModel):
    id: str
    name: str
    status: Status
    last_checked_at: Optional[str] = None
    last_error: Optional[str] = None


class FlowStatus(BaseModel):
    id: str
    name: str
    status: Status
    last_checked_at: Optional[str] = None
    last_error: Optional[str] = None


class Overview(BaseModel):
    overall_status: Status
    agent_count: int
    healthy_agents: int
    service_count: int
    healthy_services: int
    flow_count: int
    healthy_flows: int


class OpsModeResponse(BaseModel):
    mode: Literal["normal", "product_stability", "infra_recovery", "unknown"]
    reason: str
    computed_at: str


class AttentionItem(BaseModel):
    type: Literal["flow", "service", "agent"]
    id: str
    name: str
    status: Literal["degraded", "down", "misconfigured"]
    detail: str | None


class AttentionResponse(BaseModel):
    items: list[AttentionItem]
    count: int


class HeartbeatHealth(BaseModel):
    env_ok: bool
    auth_ok: bool
    restart_count_24h: int


class HeartbeatActivity(BaseModel):
    last_task_outcome: Literal["success", "failure"] | None
    last_task_finished_at: str | None


class HeartbeatErrors(BaseModel):
    last_error_message: str | None


class HeartbeatSoul(BaseModel):
    config_version: str | None


class HeartbeatPayload(BaseModel):
    entity_type: Literal["agent", "service"]
    entity_id: str
    role: str
    status: Status
    timestamp: str
    health: HeartbeatHealth
    activity: HeartbeatActivity
    errors: HeartbeatErrors
    soul: HeartbeatSoul


class HeartbeatTask(BaseModel):
    id: UUID
    title: str
    type: str
    priority: str
    context: str | None
    acceptance_criteria: list[str] | None


class HeartbeatResponse(BaseModel):
    ok: bool
    tasks: list[HeartbeatTask]


class AgentActivityItem(BaseModel):
    id: str
    name: str
    status: Status
    last_heartbeat_at: str | None = None
    current_task_id: UUID | None = None
    current_task_title: str | None = None
    last_task_id: UUID | None = None
    last_task_title: str | None = None
    last_task_outcome: Literal["completed", "failed", "blocked"] | None = None
    last_updated_at: str | None = None


router = APIRouter(prefix="/api/status", tags=["status"])

AGENTS = [
    AgentStatus(id="peter", name="Peter", status="unknown", model="claude-sonnet-4.6", channel="Telegram"),
    AgentStatus(id="ops-director", name="Ops Director", status="unknown", model="GPT-5.4", channel="#1482328089244729487"),
    AgentStatus(id="builder", name="Builder", status="unknown", model="GPT-5.4", channel="#1482399890293391410"),
    AgentStatus(id="reviewer", name="Reviewer", status="unknown", model="claude-sonnet-4.6", channel="#1482399890293391410"),
    AgentStatus(id="research-commercial", name="Research/Commercial", status="unknown", model="claude-sonnet-4.6", channel="#1482436579933814836"),
    AgentStatus(id="growth-content", name="Growth/Content", status="unknown", model="GPT-5-mini", channel="#1482474058301047076"),
]

SERVICES = [
    ServiceStatus(id="discord-gateway", name="Discord Gateway", status="unknown"),
    ServiceStatus(id="railway-backend", name="Railway backend", status="unknown"),
    ServiceStatus(id="vercel-frontend", name="Vercel frontend", status="unknown"),
    ServiceStatus(id="x-warm-leads-listener", name="X warm leads listener", status="unknown"),
    ServiceStatus(id="apify-scraper", name="Apify scraper", status="unknown"),
]

FLOWS = [
    FlowStatus(id="mission-control-login", name="Mission Control login", status="unknown"),
    FlowStatus(id="optilyst-homepage", name="Optilyst homepage", status="unknown"),
    FlowStatus(id="optilyst-results", name="Optilyst results page", status="unknown"),
    FlowStatus(id="stripe-checkout", name="Stripe checkout", status="unknown"),
    FlowStatus(id="warm-lead-scrape", name="Warm lead scrape", status="unknown"),
    FlowStatus(id="approval-queue", name="Approval queue", status="unknown"),
]


def _parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _effective_status(current: Status, timestamp: datetime) -> Status:
    if datetime.now(timezone.utc) - timestamp.replace(tzinfo=timezone.utc) > timedelta(seconds=DEFAULT_EXPECTED_INTERVAL_SECONDS * STALE_MULTIPLIER):
        return "down"
    return current


def _owner_for_entity(entity_id: str) -> str | None:
    mapping = {
        "peter": "peter",
        "ops-director": "ops_director",
        "builder": "builder",
        "reviewer": "reviewer",
        "coder": "coder",
        "qa": "qa",
        "research-commercial": "research_commercial",
        "growth-content": "growth_content",
    }
    return mapping.get(entity_id)


async def _heartbeat_lookup(session: AsyncSession, entity_type: str) -> dict[str, StatusHeartbeat]:
    rows = (await session.exec(select(StatusHeartbeat).where(StatusHeartbeat.entity_type == entity_type))).all()
    return {row.entity_id: row for row in rows}


@router.post("/heartbeat", response_model=HeartbeatResponse)
async def post_status_heartbeat(payload: HeartbeatPayload, session: AsyncSession = Depends(get_session)) -> HeartbeatResponse:
    try:
        heartbeat = await session.get(StatusHeartbeat, payload.entity_id)
        timestamp = _parse_iso(payload.timestamp)
        if heartbeat is None:
            heartbeat = StatusHeartbeat(
                entity_id=payload.entity_id,
                entity_type=payload.entity_type,
                role=payload.role,
                status=payload.status,
                timestamp=timestamp,
                health=payload.health.model_dump(),
                activity=payload.activity.model_dump(),
                errors=payload.errors.model_dump(),
                soul=payload.soul.model_dump(),
                last_error_message=payload.errors.last_error_message,
            )
        else:
            heartbeat.entity_type = payload.entity_type
            heartbeat.role = payload.role
            heartbeat.status = payload.status
            heartbeat.timestamp = timestamp
            heartbeat.health = payload.health.model_dump()
            heartbeat.activity = payload.activity.model_dump()
            heartbeat.errors = payload.errors.model_dump()
            heartbeat.soul = payload.soul.model_dump()
            heartbeat.last_error_message = payload.errors.last_error_message
            heartbeat.updated_at = datetime.now(timezone.utc)
        session.add(heartbeat)
        await session.flush()
    except Exception as exc:
        await session.rollback()
        print(f"[status.heartbeat] storage warning: {exc}")

    tasks: list[HeartbeatTask] = []
    owner = _owner_for_entity(payload.entity_id)
    if owner:
        priority_order = case(
            (DispatchTask.priority == "critical", 0),
            (DispatchTask.priority == "high", 1),
            (DispatchTask.priority == "medium", 2),
            else_=3,
        )
        stmt = (
            select(DispatchTask)
            .where(DispatchTask.owner == owner)
            .where(DispatchTask.status == "new")
            .order_by(priority_order, DispatchTask.created_at.asc())
            .limit(1)
        )
        queued = (await session.exec(stmt)).all()
        now = datetime.now(timezone.utc)
        for task in queued:
            task.status = "assigned"
            task.assigned_at = now
            task.updated_at = now
            session.add(task)
            tasks.append(
                HeartbeatTask(
                    id=task.id,
                    title=task.title,
                    type=task.type,
                    priority=task.priority,
                    context=task.context,
                    acceptance_criteria=task.acceptance_criteria,
                )
            )

    await session.commit()
    return HeartbeatResponse(ok=True, tasks=tasks)


@router.get("/overview", response_model=Overview)
async def get_status_overview(session: AsyncSession = Depends(get_session)) -> Overview:
    agents = await get_status_agents(session)
    services = await get_status_services(session)
    flows = await get_status_flows(session)
    healthy_agents = sum(1 for item in agents if item.status == "healthy")
    healthy_services = sum(1 for item in services if item.status == "healthy")
    healthy_flows = sum(1 for item in flows if item.status == "healthy")
    overall_status: Status = "healthy" if all(
        count == total for count, total in ((healthy_agents, len(agents)), (healthy_services, len(services)), (healthy_flows, len(flows)))
    ) else "unknown"
    return Overview(
        overall_status=overall_status,
        agent_count=len(agents),
        healthy_agents=healthy_agents,
        service_count=len(services),
        healthy_services=healthy_services,
        flow_count=len(flows),
        healthy_flows=healthy_flows,
    )


@router.get("/agents", response_model=list[AgentStatus])
async def get_status_agents(session: AsyncSession = Depends(get_session)) -> list[AgentStatus]:
    live = await _heartbeat_lookup(session, "agent")
    items: list[AgentStatus] = []
    for item in AGENTS:
        heartbeat = live.get(item.id)
        if heartbeat is None:
            items.append(item)
            continue
        items.append(AgentStatus(
            id=item.id,
            name=item.name,
            model=item.model,
            channel=item.channel,
            status=_effective_status(heartbeat.status, heartbeat.timestamp),
            last_heartbeat_at=heartbeat.timestamp.isoformat(),
            last_error=heartbeat.last_error_message,
        ))
    return items


@router.get("/services", response_model=list[ServiceStatus])
async def get_status_services(session: AsyncSession = Depends(get_session)) -> list[ServiceStatus]:
    live = await _heartbeat_lookup(session, "service")
    items: list[ServiceStatus] = []
    for item in SERVICES:
        heartbeat = live.get(item.id)
        if heartbeat is None:
            items.append(item)
            continue
        items.append(ServiceStatus(
            id=item.id,
            name=heartbeat.name or item.name,
            status=_effective_status(heartbeat.status, heartbeat.timestamp),
            last_checked_at=heartbeat.timestamp.isoformat(),
            last_error=heartbeat.last_error_message,
        ))
    return items


@router.get("/flows", response_model=list[FlowStatus])
async def get_status_flows(session: AsyncSession = Depends(get_session)) -> list[FlowStatus]:
    live = await _heartbeat_lookup(session, "flow")
    items: list[FlowStatus] = []
    for item in FLOWS:
        heartbeat = live.get(item.id)
        if heartbeat is None:
            items.append(item)
            continue
        items.append(FlowStatus(
            id=item.id,
            name=heartbeat.name or item.name,
            status=_effective_status(heartbeat.status, heartbeat.timestamp),
            last_checked_at=heartbeat.timestamp.isoformat(),
            last_error=heartbeat.detail or heartbeat.last_error_message,
        ))
    return items


@router.get("/ops-mode", response_model=OpsModeResponse)
async def get_ops_mode(session: AsyncSession = Depends(get_session)) -> OpsModeResponse:
    agents = await get_status_agents(session)
    services = await get_status_services(session)
    flows = await get_status_flows(session)

    bad_flows = [item for item in flows if item.status in {"down", "degraded"}]
    if bad_flows:
        return OpsModeResponse(
            mode="product_stability",
            reason=f"Critical flow issue: {bad_flows[0].name} is {bad_flows[0].status}",
            computed_at=datetime.now(timezone.utc).isoformat(),
        )

    bad_services = [item for item in services if item.status in {"down", "degraded", "misconfigured"}]
    if bad_services:
        return OpsModeResponse(
            mode="infra_recovery",
            reason=f"Service issue: {bad_services[0].name} is {bad_services[0].status}",
            computed_at=datetime.now(timezone.utc).isoformat(),
        )

    if agents and services and flows and all(item.status == "healthy" for item in [*agents, *services, *flows]):
        return OpsModeResponse(
            mode="normal",
            reason="All agents, services, and flows are healthy",
            computed_at=datetime.now(timezone.utc).isoformat(),
        )

    return OpsModeResponse(
        mode="unknown",
        reason="Not enough healthy telemetry to determine mode",
        computed_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/attention", response_model=AttentionResponse)
async def get_attention(session: AsyncSession = Depends(get_session)) -> AttentionResponse:
    agents = await get_status_agents(session)
    services = await get_status_services(session)
    flows = await get_status_flows(session)
    items: list[AttentionItem] = []

    for item in agents:
        if item.status in {"degraded", "down", "misconfigured"}:
            items.append(AttentionItem(type="agent", id=item.id, name=item.name, status=item.status, detail=item.last_error))
    for item in services:
        if item.status in {"degraded", "down", "misconfigured"}:
            items.append(AttentionItem(type="service", id=item.id, name=item.name, status=item.status, detail=item.last_error))
    for item in flows:
        if item.status in {"degraded", "down", "misconfigured"}:
            items.append(AttentionItem(type="flow", id=item.id, name=item.name, status=item.status, detail=item.last_error))

    return AttentionResponse(items=items, count=len(items))


@router.get("/agent-activity", response_model=list[AgentActivityItem])
async def get_agent_activity(session: AsyncSession = Depends(get_session)) -> list[AgentActivityItem]:
    agent_specs = [
        ("ops-director", "Ops Director"),
        ("builder", "Builder"),
        ("reviewer", "Reviewer"),
        ("peter", "Peter"),
    ]
    live = await _heartbeat_lookup(session, "agent")
    results: list[AgentActivityItem] = []

    for entity_id, name in agent_specs:
        owner = _owner_for_entity(entity_id)
        heartbeat = live.get(entity_id)
        current_task = None
        last_task = None
        if owner is not None:
            current_task = (await session.exec(
                select(DispatchTask)
                .where(DispatchTask.owner == owner)
                .where(DispatchTask.status == "in_progress")
                .order_by(DispatchTask.updated_at.desc())
                .limit(1)
            )).first()
            last_task = (await session.exec(
                select(DispatchTask)
                .where(DispatchTask.owner == owner)
                .order_by(DispatchTask.updated_at.desc())
                .limit(1)
            )).first()

        terminal = last_task.status if last_task and last_task.status in {"completed", "failed", "blocked"} else None
        status = _effective_status(heartbeat.status, heartbeat.timestamp) if heartbeat else "unknown"
        results.append(AgentActivityItem(
            id=entity_id,
            name=name,
            status=status,
            last_heartbeat_at=heartbeat.timestamp.isoformat() if heartbeat else None,
            current_task_id=current_task.id if current_task else None,
            current_task_title=current_task.title if current_task else None,
            last_task_id=last_task.id if last_task else None,
            last_task_title=last_task.title if last_task else None,
            last_task_outcome=terminal,
            last_updated_at=last_task.updated_at.isoformat() if last_task else None,
        ))

    return results
