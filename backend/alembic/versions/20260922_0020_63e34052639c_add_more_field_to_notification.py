"""add_more_field_to_notification

Revision ID: 63e34052639c
Revises: 72c7929396b3
Create Date: 2026-09-22 00:20:17.185479

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63e34052639c'
down_revision: Union[str, None] = '72c7929396b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notification",
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
    )
    op.create_foreign_key(
        "fk_notification_warehouse_id",
        "notification",
        "warehouse",
        ["warehouse_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_notification_warehouse_id", "notification", type_="foreignkey")
    op.drop_column("notification", "warehouse_id")
