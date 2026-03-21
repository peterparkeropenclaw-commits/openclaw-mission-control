"""Add brain dump table.

Revision ID: de45fa67bc89
Revises: cd34ef56ab78
Create Date: 2026-03-21 11:05:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "de45fa67bc89"
down_revision = "cd34ef56ab78"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "brain_dump",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("priority", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="new"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_brain_dump_category", "brain_dump", ["category"])
    op.create_index("ix_brain_dump_priority", "brain_dump", ["priority"])
    op.create_index("ix_brain_dump_status", "brain_dump", ["status"])


def downgrade() -> None:
    op.drop_index("ix_brain_dump_status", table_name="brain_dump")
    op.drop_index("ix_brain_dump_priority", table_name="brain_dump")
    op.drop_index("ix_brain_dump_category", table_name="brain_dump")
    op.drop_table("brain_dump")
