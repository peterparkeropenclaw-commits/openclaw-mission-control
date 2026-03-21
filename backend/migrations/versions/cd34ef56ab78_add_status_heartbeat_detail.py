"""Add detail column to status heartbeats.

Revision ID: cd34ef56ab78
Revises: bc23de45fa67
Create Date: 2026-03-21 09:12:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "cd34ef56ab78"
down_revision = "bc23de45fa67"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("status_heartbeats") as batch_op:
        batch_op.add_column(sa.Column("detail", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("status_heartbeats") as batch_op:
        batch_op.drop_column("detail")
