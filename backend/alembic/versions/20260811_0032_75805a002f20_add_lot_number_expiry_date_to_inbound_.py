"""add_lot_number_expiry_date_to_inbound_order_detail

Revision ID: 75805a002f20
Revises: d0e1f2a3b4c5
Create Date: 2026-08-11 00:32:08.221689

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '75805a002f20'
down_revision: Union[str, None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
