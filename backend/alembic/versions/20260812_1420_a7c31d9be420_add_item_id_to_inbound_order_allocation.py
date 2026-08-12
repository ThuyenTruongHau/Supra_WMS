"""add item_id to inbound_order_allocation (merge heads)

Revision ID: a7c31d9be420
Revises: e495d531169c, 75805a002f20
Create Date: 2026-08-12 14:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c31d9be420'
down_revision: Union[str, Sequence[str], None] = ('e495d531169c', '75805a002f20')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'inbound_order_allocation',
        sa.Column('item_id', sa.Integer(), nullable=True),
    )
    # Backfill from the linked stock row before enforcing NOT NULL.
    op.execute(
        """
        UPDATE inbound_order_allocation AS a
        SET item_id = s.item_id
        FROM item_stock AS s
        WHERE a.item_stock_id = s.id AND a.item_id IS NULL
        """
    )
    op.execute("DELETE FROM inbound_order_allocation WHERE item_id IS NULL")
    op.alter_column('inbound_order_allocation', 'item_id', nullable=False)
    op.create_index(
        op.f('ix_inbound_order_allocation_item_id'),
        'inbound_order_allocation',
        ['item_id'],
        unique=False,
    )
    op.create_foreign_key(
        'fk_inbound_order_allocation_item_id_item',
        'inbound_order_allocation',
        'item',
        ['item_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_inbound_order_allocation_item_id_item',
        'inbound_order_allocation',
        type_='foreignkey',
    )
    op.drop_index(
        op.f('ix_inbound_order_allocation_item_id'),
        table_name='inbound_order_allocation',
    )
    op.drop_column('inbound_order_allocation', 'item_id')
