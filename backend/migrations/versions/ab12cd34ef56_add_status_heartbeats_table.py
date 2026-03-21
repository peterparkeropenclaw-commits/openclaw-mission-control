"""Add status heartbeats table.

Revision ID: ab12cd34ef56
Revises: a9b1c2d3e4f7
Create Date: 2026-03-20 22:20:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "ab12cd34ef56"
down_revision = "a9b1c2d3e4f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("status_heartbeats"):
        op.create_table(
            "status_heartbeats",
            sa.Column("entity_id", sa.String(), nullable=False),
            sa.Column("entity_type", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("timestamp", sa.DateTime(), nullable=False),
            sa.Column("health", sa.JSON(), nullable=True),
            sa.Column("activity", sa.JSON(), nullable=True),
            sa.Column("errors", sa.JSON(), nullable=True),
            sa.Column("soul", sa.JSON(), nullable=True),
            sa.Column("last_error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("entity_id"),
        )

    inspector = sa.inspect(bind)
    indexes = {item["name"] for item in inspector.get_indexes("status_heartbeats")}
    if "ix_status_heartbeats_entity_type" not in indexes:
        op.create_index("ix_status_heartbeats_entity_type", "status_heartbeats", ["entity_type"])
    if "ix_status_heartbeats_role" not in indexes:
        op.create_index("ix_status_heartbeats_role", "status_heartbeats", ["role"])
    if "ix_status_heartbeats_status" not in indexes:
        op.create_index("ix_status_heartbeats_status", "status_heartbeats", ["status"])
    if "ix_status_heartbeats_timestamp" not in indexes:
        op.create_index("ix_status_heartbeats_timestamp", "status_heartbeats", ["timestamp"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("status_heartbeats"):
        indexes = {item["name"] for item in inspector.get_indexes("status_heartbeats")}
        for name in [
            "ix_status_heartbeats_timestamp",
            "ix_status_heartbeats_status",
            "ix_status_heartbeats_role",
            "ix_status_heartbeats_entity_type",
        ]:
            if name in indexes:
                op.drop_index(name, table_name="status_heartbeats")
        op.drop_table("status_heartbeats")
