"""add_lot_number_expiry_date_to_inbound_order_detail

Revision ID: d0e1f2a3b4c5
Revises: c9d4e5f6a7b8
Create Date: 2026-08-11 00:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "inbound_order_detail",
        sa.Column("lot_number", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "inbound_order_detail",
        sa.Column("expiry_date", sa.String(length=50), nullable=True),
    )
    op.create_index(
        op.f("ix_inbound_order_detail_lot_number"),
        "inbound_order_detail",
        ["lot_number"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inbound_order_detail_expiry_date"),
        "inbound_order_detail",
        ["expiry_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_inbound_order_detail_expiry_date"),
        table_name="inbound_order_detail",
    )
    op.drop_index(
        op.f("ix_inbound_order_detail_lot_number"),
        table_name="inbound_order_detail",
    )
    op.drop_column("inbound_order_detail", "expiry_date")
    op.drop_column("inbound_order_detail", "lot_number")