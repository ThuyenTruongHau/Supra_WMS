"""add item_stock stock_level and nullable location_id

Revision ID: f1a2b3c4d5e6
Revises: 24a5b14caaf9
Create Date: 2026-09-03 21:37:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "24a5b14caaf9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("item_stock", sa.Column("stock_level", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_item_stock_stock_level"),
        "item_stock",
        ["stock_level"],
        unique=False,
    )
    op.execute("UPDATE item_stock SET stock_level = 1 WHERE stock_level IS NULL")
    op.alter_column(
        "item_stock",
        "location_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "item_stock",
        "location_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_index(op.f("ix_item_stock_stock_level"), table_name="item_stock")
    op.drop_column("item_stock", "stock_level")
