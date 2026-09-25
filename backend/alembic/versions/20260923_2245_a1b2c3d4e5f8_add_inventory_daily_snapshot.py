"""add_inventory_daily_snapshot

Revision ID: a1b2c3d4e5f8
Revises: 747d1f476051
Create Date: 2026-09-23 22:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f8"
down_revision: Union[str, None] = "747d1f476051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inventory_daily_snapshot",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column(
            "total_quantity",
            sa.Numeric(precision=20, scale=4),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "total_inventory_value",
            sa.Numeric(precision=20, scale=2),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "warehouse_id",
            "snapshot_date",
            name="uq_inventory_daily_snapshot_wh_date",
        ),
    )
    op.create_index(
        op.f("ix_inventory_daily_snapshot_id"),
        "inventory_daily_snapshot",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_daily_snapshot_warehouse_id"),
        "inventory_daily_snapshot",
        ["warehouse_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_inventory_daily_snapshot_warehouse_id"),
        table_name="inventory_daily_snapshot",
    )
    op.drop_index(
        op.f("ix_inventory_daily_snapshot_id"),
        table_name="inventory_daily_snapshot",
    )
    op.drop_table("inventory_daily_snapshot")
