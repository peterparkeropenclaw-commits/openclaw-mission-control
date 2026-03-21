"""Add dispatch tasks table.

Revision ID: ef56ab78cd90
Revises: de45fa67bc89
Create Date: 2026-03-21 14:25:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "ef56ab78cd90"
down_revision = "de45fa67bc89"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dispatch_tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("priority", sa.Text(), nullable=False),
        sa.Column("owner", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="new"),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("acceptance_criteria", sa.JSON(), nullable=True),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("trigger", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    for name, cols in {
        "ix_dispatch_tasks_type": ["type"],
        "ix_dispatch_tasks_priority": ["priority"],
        "ix_dispatch_tasks_owner": ["owner"],
        "ix_dispatch_tasks_status": ["status"],
    }.items():
        op.create_index(name, "dispatch_tasks", cols)


def downgrade() -> None:
    for name in ["ix_dispatch_tasks_status", "ix_dispatch_tasks_owner", "ix_dispatch_tasks_priority", "ix_dispatch_tasks_type"]:
        op.drop_index(name, table_name="dispatch_tasks")
    op.drop_table("dispatch_tasks")
