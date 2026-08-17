"""add quantity to robot_task

Revision ID: a3f8c2d1e4b5
Revises: 1cb4b8209260
Create Date: 2026-08-17 21:07:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3f8c2d1e4b5"
down_revision: Union[str, None] = "1cb4b8209260"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "robot_task",
        sa.Column("quantity", sa.Integer(), nullable=True),
    )
    op.execute(
        """
        UPDATE robot_task AS rt
        SET quantity = COALESCE(
            (
                SELECT SUM(ooa.quantity)
                FROM outbound_order_allocation AS ooa
                WHERE ooa.robot_task_id = rt.id
            ),
            (
                SELECT SUM(ioa.quantity)
                FROM inbound_order_allocation AS ioa
                JOIN inbound_order_detail AS iod
                  ON iod.id = ioa.inbound_order_detail_id
                WHERE iod.id = rt.inbound_order_detail_id
            ),
            0
        )
        WHERE rt.quantity IS NULL
        """
    )
    op.alter_column("robot_task", "quantity", nullable=False)


def downgrade() -> None:
    op.drop_column("robot_task", "quantity")
