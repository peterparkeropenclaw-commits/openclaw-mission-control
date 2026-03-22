from __future__ import annotations

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
SYSTEM_CHANNEL_ID = "1482328089244729487"
REVIEWER_CHANNEL_ID = "1482399890293391410"


def _prefix_for_status(status: str) -> str:
    if status in {"blocked", "failed"}:
        return "🚨" if status == "blocked" else "❌"
    if status == "completed":
        return "✅"
    return "📋"


async def send_discord_notification(task, event_type: str) -> None:
    token = settings.discord_bot_token.strip()
    if not token:
        logger.warning("discord notification skipped: DISCORD_BOT_TOKEN not set")
        return

    channel_id = REVIEWER_CHANNEL_ID if task.owner == "reviewer" or task.type == "review" else SYSTEM_CHANNEL_ID
    prefix = _prefix_for_status(task.status)
    content = (
        f"{prefix} [TASK EVENT] {task.status.upper()}\n"
        f"Title: {task.title}\n"
        f"ID: {task.id}\n"
        f"Owner: {task.owner}\n"
        f"Status: {task.status}\n"
        f"Summary: {task.result_summary or task.error_message or '—'}"
    )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"https://discord.com/api/v10/channels/{channel_id}/messages",
                headers={
                    "Authorization": f"Bot {token}",
                    "Content-Type": "application/json",
                },
                json={"content": content},
            )
        logger.info("discord notification sent event=%s channel=%s status=%s", event_type, channel_id, response.status_code)
    except Exception as exc:
        logger.warning("discord notification failed event=%s error=%s", event_type, exc)
