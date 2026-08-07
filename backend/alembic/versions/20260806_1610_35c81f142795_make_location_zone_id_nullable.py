"""make_location_zone_id_nullable

Revision ID: 35c81f142795
Revises: 44962a2cf37e
Create Date: 2026-08-06 16:10:37.224009

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '35c81f142795'
down_revision: Union[str, None] = '44962a2cf37e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'location',
        'zone_id',
        existing_type=sa.Integer(),
        nullable=True,
    )
def downgrade() -> None:
    # Rollback chỉ chạy được khi không còn location nào có zone_id NULL
    op.execute("DELETE FROM location WHERE zone_id IS NULL")
    op.alter_column(
        'location',
        'zone_id',
        existing_type=sa.Integer(),
        nullable=False,
    )
