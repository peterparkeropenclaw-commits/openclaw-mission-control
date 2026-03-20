from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel

Status = Literal["healthy", "degraded", "down", "unknown", "misconfigured"]


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


router = APIRouter(prefix="/api/status", tags=["status"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _agents() -> list[AgentStatus]:
    return [
        AgentStatus(id="peter", name="Peter", status="unknown", model="claude-sonnet-4.6", channel="Telegram"),
        AgentStatus(id="ops-director", name="Ops Director", status="unknown", model="GPT-5.4", channel="#1482328089244729487"),
        AgentStatus(id="builder", name="Builder", status="unknown", model="gpt-5.3-codex", channel="#1482399890293391410"),
        AgentStatus(id="reviewer", name="Reviewer", status="unknown", model="claude-sonnet-4.6", channel="#1482399890293391410"),
        AgentStatus(id="research-commercial", name="Research/Commercial", status="unknown", model="claude-sonnet-4.6", channel="#1482436579933814836"),
        AgentStatus(id="growth-content", name="Growth/Content", status="unknown", model="gpt-5-mini", channel="#1482474058301047076"),
    ]


def _services() -> list[ServiceStatus]:
    checked = _now_iso()
    return [
        ServiceStatus(id="discord-gateway", name="Discord Gateway", status="unknown", last_checked_at=checked),
        ServiceStatus(id="railway-backend", name="Railway backend", status="unknown", last_checked_at=checked),
        ServiceStatus(id="vercel-frontend", name="Vercel frontend", status="unknown", last_checked_at=checked),
        ServiceStatus(id="x-warm-leads-listener", name="X warm leads listener", status="unknown", last_checked_at=checked),
        ServiceStatus(id="apify-scraper", name="Apify scraper", status="unknown", last_checked_at=checked),
    ]


def _flows() -> list[FlowStatus]:
    checked = _now_iso()
    return [
        FlowStatus(id="mission-control-login", name="Mission Control login", status="unknown", last_checked_at=checked),
        FlowStatus(id="optilyst-homepage", name="Optilyst homepage", status="unknown", last_checked_at=checked),
        FlowStatus(id="optilyst-results-page", name="Optilyst results page", status="unknown", last_checked_at=checked),
        FlowStatus(id="stripe-checkout", name="Stripe checkout", status="unknown", last_checked_at=checked),
        FlowStatus(id="warm-lead-scrape", name="Warm lead scrape", status="unknown", last_checked_at=checked),
        FlowStatus(id="approval-queue", name="Approval queue", status="unknown", last_checked_at=checked),
    ]


@router.get("/overview", response_model=Overview)
async def get_status_overview() -> Overview:
    agents = _agents()
    services = _services()
    flows = _flows()
    healthy_agents = sum(1 for a in agents if a.status == "healthy")
    healthy_services = sum(1 for s in services if s.status == "healthy")
    healthy_flows = sum(1 for f in flows if f.status == "healthy")
    overall_status: Status = "healthy" if all(
        x > 0 for x in [healthy_agents, healthy_services, healthy_flows]
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
async def get_status_agents() -> list[AgentStatus]:
    return _agents()


@router.get("/services", response_model=list[ServiceStatus])
async def get_status_services() -> list[ServiceStatus]:
    return _services()


@router.get("/flows", response_model=list[FlowStatus])
async def get_status_flows() -> list[FlowStatus]:
    return _flows()
