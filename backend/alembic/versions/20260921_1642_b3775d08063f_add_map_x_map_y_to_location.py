"""add_map_x_map_y_to_location

Revision ID: b3775d08063f
Revises: a1b2c3d4e5f8
Create Date: 2026-09-21 16:42:10.429227

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "b3775d08063f"
down_revision: Union[str, None] = "a1b2c3d4e5f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("location")}
    if "map_x" not in columns:
        op.add_column("location", sa.Column("map_x", sa.Integer(), nullable=True))
    if "map_y" not in columns:
        op.add_column("location", sa.Column("map_y", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in inspect(bind).get_columns("location")}
    if "map_y" in columns:
        op.drop_column("location", "map_y")
    if "map_x" in columns:
        op.drop_column("location", "map_x")
