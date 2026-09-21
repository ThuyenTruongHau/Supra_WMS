"""add_notification_table

Revision ID: 72c7929396b3
Revises: f4a8b2c1d3e4
Create Date: 2026-09-21 23:59:43.580757

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "72c7929396b3"
down_revision: Union[str, None] = "f4a8b2c1d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("action", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.String(length=50),
            nullable=False,
            server_default="unsolved",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notification_id"), "notification", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_notification_id"), table_name="notification")
    op.drop_table("notification")
