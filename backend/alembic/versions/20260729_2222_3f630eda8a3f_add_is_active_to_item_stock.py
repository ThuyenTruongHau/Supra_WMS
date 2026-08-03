"""add is_active to item_stock

Revision ID: <auto>
Revises: bfdc12d57f97
Create Date: ...
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '<auto>'
down_revision: Union[str, None] = 'bfdc12d57f97'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'item_stock',
        sa.Column(
            'is_active',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('true'),  # quan trọng nếu bảng đã có data
        ),
    )


def downgrade() -> None:
    op.drop_column('item_stock', 'is_active')