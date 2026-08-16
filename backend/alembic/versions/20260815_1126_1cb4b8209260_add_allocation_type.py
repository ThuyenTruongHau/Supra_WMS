"""add allocation type

Revision ID: 1cb4b8209260
Revises: 73a2848af4f2
Create Date: 2026-08-15 11:26:05.091176

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "1cb4b8209260"
down_revision: Union[str, None] = "73a2848af4f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "outbound_order_allocation",
        sa.Column("allocation_type", sa.String(length=20), nullable=True),
    )

    # Backfill existing rows before enforcing NOT NULL.
    # return: chỉ to_location (trả dư về kệ); outbound: lấy hàng từ from_location.
    op.execute(
        text(
            """
            UPDATE outbound_order_allocation
            SET allocation_type = CASE
                WHEN to_location_id IS NOT NULL AND from_location_id IS NULL THEN 'return'
                ELSE 'outbound'
            END
            WHERE allocation_type IS NULL
            """
        )
    )

    op.alter_column(
        "outbound_order_allocation",
        "allocation_type",
        existing_type=sa.String(length=20),
        nullable=False,
    )

    op.create_index(
        op.f("ix_outbound_order_allocation_allocation_type"),
        "outbound_order_allocation",
        ["allocation_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_outbound_order_allocation_allocation_type"),
        table_name="outbound_order_allocation",
    )
    op.drop_column("outbound_order_allocation", "allocation_type")
