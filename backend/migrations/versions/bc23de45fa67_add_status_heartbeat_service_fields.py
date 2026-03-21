"""Add name and latency columns to status heartbeats.

Revision ID: bc23de45fa67
Revises: ab12cd34ef56
Create Date: 2026-03-21 08:55:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "bc23de45fa67"
down_revision = "ab12cd34ef56"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("status_heartbeats") as batch_op:
        batch_op.add_column(sa.Column("name", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("latency_ms", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("status_heartbeats") as batch_op:
        batch_op.drop_column("latency_ms")
        batch_op.drop_column("name")
