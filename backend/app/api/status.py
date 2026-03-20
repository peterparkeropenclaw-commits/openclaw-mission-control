from __future__ import annotations

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


@router.get("/overview", response_model=Overview)
async def get_status_overview() -> Overview:
    healthy_agents = sum(1 for item in AGENTS if item.status == "healthy")
    healthy_services = sum(1 for item in SERVICES if item.status == "healthy")
    healthy_flows = sum(1 for item in FLOWS if item.status == "healthy")
    overall_status: Status = "healthy" if all(
        count == total for count, total in ((healthy_agents, len(AGENTS)), (healthy_services, len(SERVICES)), (healthy_flows, len(FLOWS)))
    ) else "unknown"
    return Overview(
        overall_status=overall_status,
        agent_count=len(AGENTS),
        healthy_agents=healthy_agents,
        service_count=len(SERVICES),
        healthy_services=healthy_services,
        flow_count=len(FLOWS),
        healthy_flows=healthy_flows,
    )


@router.get("/agents", response_model=list[AgentStatus])
async def get_status_agents() -> list[AgentStatus]:
    return AGENTS


@router.get("/services", response_model=list[ServiceStatus])
async def get_status_services() -> list[ServiceStatus]:
    return SERVICES


@router.get("/flows", response_model=list[FlowStatus])
async def get_status_flows() -> list[FlowStatus]:
    return FLOWS
