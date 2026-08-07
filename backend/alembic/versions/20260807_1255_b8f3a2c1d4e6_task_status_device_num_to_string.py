"""task_status_device_num_to_string

Revision ID: b8f3a2c1d4e6
Revises: d426a8285129
Create Date: 2026-08-07 12:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8f3a2c1d4e6"
down_revision: Union[str, None] = "d426a8285129"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "task_status",
        "device_num",
        existing_type=sa.INTEGER(),
        type_=sa.String(length=50),
        existing_nullable=True,
        postgresql_using="device_num::text",
    )


def downgrade() -> None:
    op.alter_column(
        "task_status",
        "device_num",
        existing_type=sa.String(length=50),
        type_=sa.INTEGER(),
        existing_nullable=True,
        postgresql_using="device_num::integer",
    )
