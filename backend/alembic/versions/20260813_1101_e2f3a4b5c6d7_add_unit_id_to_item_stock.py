"""add unit_id to item_stock

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-13 11:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("item_stock", sa.Column("unit_id", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE item_stock AS s
        SET unit_id = i.base_unit
        FROM item AS i
        WHERE s.item_id = i.id
        """
    )
    op.alter_column("item_stock", "unit_id", nullable=False)
    op.create_index(op.f("ix_item_stock_unit_id"), "item_stock", ["unit_id"], unique=False)
    op.create_foreign_key(
        "fk_item_stock_unit_id_unit",
        "item_stock",
        "unit",
        ["unit_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_item_stock_unit_id_unit", "item_stock", type_="foreignkey")
    op.drop_index(op.f("ix_item_stock_unit_id"), table_name="item_stock")
    op.drop_column("item_stock", "unit_id")
