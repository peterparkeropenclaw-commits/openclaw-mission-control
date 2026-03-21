from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import async_session_maker
from app.models.status_heartbeat import StatusHeartbeat

logger = get_logger(__name__)
CHECK_INTERVAL_SECONDS = 60
TIMEOUT_SECONDS = 5

FLOWS = [
    ("optilyst-homepage", "Optilyst homepage", "https://optilyst.io", {200}, False),
    ("optilyst-results", "Optilyst results page", "https://optilyst.io/results", {200, 304}, False),
    ("mission-control-login", "Mission Control login", "https://openclaw-mission-control-production-f6a2.up.railway.app/healthz", {200}, True),
    ("analysis-engine", "Analysis engine", "https://optilyst.io/analyse", {200}, False),
    ("stripe-checkout", "Stripe checkout", "https://optilyst.io/pro", {200}, False),
    ("warm-lead-scrape", "Warm lead scrape", "https://api.apify.com/v2/acts", {200}, False),
    ("approval-queue", "Approval queue", "https://openclaw-mission-control-production-f6a2.up.railway.app/healthz", {200}, True),
]


def _check_once(flow_id: str, name: str, url: str, expected_codes: set[int], expect_ok_json: bool) -> tuple[str, int | None, str, str | None]:
    headers = {}
    if flow_id == "warm-lead-scrape" and settings.apify_api_key:
        headers["Authorization"] = f"Bearer {settings.apify_api_key}"
    req = Request(url, headers=headers)
    started = time.perf_counter()
    try:
        with urlopen(req, timeout=TIMEOUT_SECONDS) as res:
            body = res.read().decode("utf-8", errors="ignore")
            latency = int((time.perf_counter() - started) * 1000)
            code = getattr(res, "status", 200)
            ok = code in expected_codes and (not expect_ok_json or '"ok":true' in body.replace(" ", "").lower())
            detail = f"HTTP {code} in {latency}ms"
            if flow_id == "warm-lead-scrape" and settings.apify_api_key and ok:
                run_req = Request(
                    "https://api.apify.com/v2/acts/~optilyst-warm-leads/runs/last",
                    headers={"Authorization": f"Bearer {settings.apify_api_key}"},
                )
                try:
                    with urlopen(run_req, timeout=TIMEOUT_SECONDS) as run_res:
                        run_body = run_res.read().decode("utf-8", errors="ignore").lower()
                        if '"status":"succeeded"' in run_body:
                            detail = f"Actor reachable, last run succeeded, {latency}ms"
                        else:
                            return ("degraded", latency, "Actor reachable but last run not succeeded", "Actor reachable but last run not succeeded")
                except Exception as run_err:
                    return ("degraded", latency, f"Actor reachable, last run unknown: {run_err}", f"Actor reachable, last run unknown: {run_err}")
            if ok and latency <= 3000:
                return ("healthy", latency, detail, None)
            return ("degraded", latency, detail, None if ok else detail)
    except HTTPError as err:
        latency = int((time.perf_counter() - started) * 1000)
        detail = f"HTTP {err.code} in {latency}ms"
        return ("degraded", latency, detail, detail)
    except (URLError, TimeoutError, OSError) as err:
        return ("down", None, str(err), str(err))


async def poll_flows_forever() -> None:
    while True:
        for flow_id, name, url, expected_codes, expect_ok_json in FLOWS:
            status, latency_ms, detail, last_error = await asyncio.to_thread(_check_once, flow_id, name, url, expected_codes, expect_ok_json)
            async with async_session_maker() as session:
                heartbeat = await session.get(StatusHeartbeat, flow_id)
                now = datetime.now(timezone.utc)
                if heartbeat is None:
                    heartbeat = StatusHeartbeat(entity_id=flow_id, entity_type="flow", role="flow-checker", name=name, status=status, timestamp=now, latency_ms=latency_ms, detail=detail, last_error_message=last_error)
                else:
                    heartbeat.entity_type = "flow"
                    heartbeat.role = "flow-checker"
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
