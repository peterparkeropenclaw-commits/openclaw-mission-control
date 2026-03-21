from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
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
    FlowStatus(id="optilyst-results-page", name="Optilyst results page", status="unknown"),
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


async def _heartbeat_lookup(session: AsyncSession, entity_type: str) -> dict[str, StatusHeartbeat]:
    rows = (await session.exec(select(StatusHeartbeat).where(StatusHeartbeat.entity_type == entity_type))).all()
    return {row.entity_id: row for row in rows}


@router.post("/heartbeat")
async def post_status_heartbeat(payload: HeartbeatPayload, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
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
    await session.commit()
    return {"ok": True}


@router.get("/overview", response_model=Overview)
async def get_status_overview(session: AsyncSession = Depends(get_session)) -> Overview:
    agents = await get_status_agents(session)
    services = await get_status_services(session)
    healthy_agents = sum(1 for item in agents if item.status == "healthy")
    healthy_services = sum(1 for item in services if item.status == "healthy")
    healthy_flows = sum(1 for item in FLOWS if item.status == "healthy")
    overall_status: Status = "healthy" if all(
        count == total for count, total in ((healthy_agents, len(agents)), (healthy_services, len(services)), (healthy_flows, len(FLOWS)))
    ) else "unknown"
    return Overview(
        overall_status=overall_status,
        agent_count=len(agents),
        healthy_agents=healthy_agents,
        service_count=len(services),
        healthy_services=healthy_services,
        flow_count=len(FLOWS),
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
async def get_status_flows() -> list[FlowStatus]:
    return FLOWS
