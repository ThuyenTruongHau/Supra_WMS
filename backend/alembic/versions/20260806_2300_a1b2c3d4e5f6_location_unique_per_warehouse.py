"""location unique per warehouse

Revision ID: a1b2c3d4e5f6
Revises: 98e353d7265b
Create Date: 2026-08-06 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "98e353d7265b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_location_location_code", table_name="location")
    op.drop_index("ix_location_location_name", table_name="location")
    op.create_index(
        op.f("ix_location_location_code"),
        "location",
        ["location_code"],
        unique=False,
    )
    op.create_index(
        op.f("ix_location_location_name"),
        "location",
        ["location_name"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_location_warehouse_code",
        "location",
        ["warehouse_id", "location_code"],
    )
    op.create_unique_constraint(
        "uq_location_warehouse_name",
        "location",
        ["warehouse_id", "location_name"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_location_warehouse_name", "location", type_="unique")
    op.drop_constraint("uq_location_warehouse_code", "location", type_="unique")
    op.drop_index(op.f("ix_location_location_name"), table_name="location")
    op.drop_index(op.f("ix_location_location_code"), table_name="location")
    op.create_index(
        op.f("ix_location_location_name"),
        "location",
        ["location_name"],
        unique=True,
    )
    op.create_index(
        op.f("ix_location_location_code"),
        "location",
        ["location_code"],
        unique=True,
    )
