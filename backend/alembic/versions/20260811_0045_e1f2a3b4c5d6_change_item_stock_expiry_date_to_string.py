"""change_item_stock_expiry_date_to_string

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-08-11 00:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "item_stock",
        "expiry_date",
        existing_type=sa.Date(),
        type_=sa.String(length=50),
        existing_nullable=True,
        postgresql_using="expiry_date::text",
    )


def downgrade() -> None:
    op.alter_column(
        "item_stock",
        "expiry_date",
        existing_type=sa.String(length=50),
        type_=sa.Date(),
        existing_nullable=True,
        postgresql_using="expiry_date::date",
    )
