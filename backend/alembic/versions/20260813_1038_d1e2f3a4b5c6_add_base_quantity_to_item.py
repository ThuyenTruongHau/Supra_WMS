"""add_base_quantity_to_item

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-08-13 10:38:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default backfills existing rows with 1 before NOT NULL is enforced.
    op.add_column(
        "item",
        sa.Column("base_quantity", sa.Integer(), nullable=False, server_default="1"),
    )
    op.alter_column("item", "base_quantity", server_default=None)


def downgrade() -> None:
    op.drop_column("item", "base_quantity")
