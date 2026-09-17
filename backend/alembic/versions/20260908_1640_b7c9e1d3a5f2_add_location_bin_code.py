"""add location bin_code as stable identity across map imports

Revision ID: b7c9e1d3a5f2
Revises: f1a2b3c4d5e6
Create Date: 2026-09-08 16:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c9e1d3a5f2"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("location", sa.Column("bin_code", sa.String(length=50), nullable=True))
    op.create_index(
        op.f("ix_location_bin_code"),
        "location",
        ["bin_code"],
        unique=False,
    )

    # Seed bin_code from location_name for rows whose name is a real bin label.
    # A purely numeric name means the map node was never named, so it carries no
    # stable identity and must stay NULL.
    op.execute(
        "UPDATE location SET bin_code = location_name "
        "WHERE location_name IS NOT NULL AND location_name !~ '^[0-9]+$'"
    )

    # Partial unique: only named bins must be unique per warehouse.
    op.create_index(
        "uq_location_warehouse_bin",
        "location",
        ["warehouse_id", "bin_code"],
        unique=True,
        postgresql_where=sa.text("bin_code IS NOT NULL"),
    )

    # location_name becomes a mutable display label; retired rows would otherwise
    # keep reserving names and block later imports.
    op.drop_constraint("uq_location_warehouse_name", "location", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_location_warehouse_name",
        "location",
        ["warehouse_id", "location_name"],
    )
    op.drop_index("uq_location_warehouse_bin", table_name="location")
    op.drop_index(op.f("ix_location_bin_code"), table_name="location")
    op.drop_column("location", "bin_code")
