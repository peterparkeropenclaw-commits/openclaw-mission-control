"""Add archived flag to dispatch_tasks and archive stale test tasks.

Revision ID: f012ab34cd56
Revises: ef56ab78cd90
Create Date: 2026-03-22 18:05:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f012ab34cd56"
down_revision = "ef56ab78cd90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dispatch_tasks", sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(
        """
        UPDATE dispatch_tasks
        SET archived = true
        WHERE DATE(created_at) = CURRENT_DATE
          AND (
            title ILIKE 'Test %'
            OR title ILIKE '[Reroute] Test %'
            OR title ILIKE '[Escalation] Test %'
          )
        """
    )
    op.alter_column("dispatch_tasks", "archived", server_default=None)


def downgrade() -> None:
    op.drop_column("dispatch_tasks", "archived")
