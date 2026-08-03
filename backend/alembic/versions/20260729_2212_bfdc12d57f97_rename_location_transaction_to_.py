"""rename location_transaction to transaction

Revision ID: bfdc12d57f97
Revises: ea11c0ad6d49
Create Date: 2026-07-29 22:12:53.490049

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bfdc12d57f97'
down_revision: Union[str, None] = 'ea11c0ad6d49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("location_transaction", "transaction")

def downgrade() -> None:
    op.rename_table("transaction", "location_transaction")
