"""make_warehouse_map_zone_id_nullable

Revision ID: 44962a2cf37e
Revises: dc77a404581d
Create Date: 2026-08-05 13:27:22.509622

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44962a2cf37e'
down_revision: Union[str, None] = 'dc77a404581d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'warehouse_map',
        'zone_id',
        existing_type=sa.Integer(),
        nullable=True,
    )

def downgrade() -> None:
    op.alter_column(
        'warehouse_map',
        'zone_id',
        existing_type=sa.Integer(),
        nullable=False,
    )
