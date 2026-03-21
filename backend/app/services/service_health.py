from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlmodel import select

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import async_session_maker
from app.models.status_heartbeat import StatusHeartbeat

logger = get_logger(__name__)
CHECK_INTERVAL_SECONDS = 60
TIMEOUT_SECONDS = 5

SERVICES = [
    ("discord-gateway", "Discord Gateway", "https://discord.com/api/v10/gateway", False),
    ("railway-backend", "Railway backend", "https://openclaw-mission-control-production-f6a2.up.railway.app/healthz", True),
    ("vercel-frontend", "Vercel frontend", "https://openclaw-mission-control-liart.vercel.app", False),
    ("x-warm-leads-listener", "X warm leads listener", None, False),
    ("apify-scraper", "Apify scraper", "https://api.apify.com/v2/acts", False),
    ("optilyst-homepage", "Optilyst homepage", "https://optilyst.io", False),
    ("stripe", "Stripe", "https://api.stripe.com/v1/charges", False),
]


def _check_once(service_id: str, name: str, url: str | None, expect_ok_json: bool) -> tuple[str, int | None, str | None, str | None]:
    if service_id == "x-warm-leads-listener":
        return (
            "misconfigured",
            None,
            "monitored via pm2 on Mac Mini — no remote health endpoint",
            "monitored via pm2 on Mac Mini — no remote health endpoint",
        )

    headers = {}
    if service_id == "stripe" and settings.stripe_secret_key:
        headers["Authorization"] = f"Bearer {settings.stripe_secret_key}"
    if service_id == "apify-scraper" and settings.apify_api_key:
        headers["Authorization"] = f"Bearer {settings.apify_api_key}"
    req = Request(url, headers=headers)
    started = time.perf_counter()
    try:
        with urlopen(req, timeout=TIMEOUT_SECONDS) as res:
            body = res.read().decode("utf-8", errors="ignore")
            latency = int((time.perf_counter() - started) * 1000)
            code = getattr(res, "status", 200)
            if expect_ok_json:
                healthy = code == 200 and '"ok":true' in body.replace(" ", "").lower()
            elif service_id == "stripe":
                healthy = code in (200, 401)
            else:
                healthy = code == 200
            if healthy and latency <= 3000:
                return ("healthy", latency, None, None)
            return ("degraded", latency, f"Unexpected response status={code}", f"Unexpected response status={code}")
    except HTTPError as err:
        latency = int((time.perf_counter() - started) * 1000)
        if service_id == "stripe" and err.code == 401:
            return ("healthy", latency, None, None)
        return ("degraded", latency, f"HTTP {err.code}", f"HTTP {err.code}")
    except (URLError, TimeoutError, OSError) as err:
        return ("down", None, str(err), str(err))


async def poll_services_forever() -> None:
    while True:
        for service_id, name, url, expect_ok_json in SERVICES:
            status, latency_ms, detail, last_error = await asyncio.to_thread(_check_once, service_id, name, url, expect_ok_json)
            async with async_session_maker() as session:
                heartbeat = await session.get(StatusHeartbeat, service_id)
                now = datetime.now(timezone.utc)
                if heartbeat is None:
                    heartbeat = StatusHeartbeat(
                        entity_id=service_id,
                        entity_type="service",
                        role="service-checker",
                        name=name,
                        status=status,
                        timestamp=now,
                        latency_ms=latency_ms,
                        detail=detail,
                        last_error_message=last_error,
                    )
                else:
                    heartbeat.entity_type = "service"
                    heartbeat.role = "service-checker"
                    heartbeat.name = name
                    heartbeat.status = status
                    heartbeat.timestamp = now
                    heartbeat.latency_ms = latency_ms
                    heartbeat.detail = detail
                    heartbeat.last_error_message = last_error
                    heartbeat.updated_at = now
                session.add(heartbeat)
                await session.commit()
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
