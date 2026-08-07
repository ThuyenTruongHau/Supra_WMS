"""inbound_order_detail_unit_to_unit_id

Revision ID: c9d4e5f6a7b8
Revises: b8f3a2c1d4e6
Create Date: 2026-08-07 13:44:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d4e5f6a7b8"
down_revision: Union[str, None] = "b8f3a2c1d4e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO unit (name, description)
        SELECT DISTINCT TRIM(d.unit), NULL
        FROM inbound_order_detail d
        WHERE NOT EXISTS (
            SELECT 1 FROM unit u WHERE u.name = TRIM(d.unit)
        )
    """)
    op.add_column(
        "inbound_order_detail",
        sa.Column("unit_id", sa.Integer(), nullable=True),
    )
    op.execute("""
        UPDATE inbound_order_detail d
        SET unit_id = u.id
        FROM unit u
        WHERE u.name = TRIM(d.unit)
    """)
    conn = op.get_bind()
    orphan_count = conn.execute(
        sa.text("SELECT COUNT(*) FROM inbound_order_detail WHERE unit_id IS NULL")
    ).scalar()
    if orphan_count:
        raise RuntimeError(
            f"Migration failed: {orphan_count} inbound_order_detail row(s) have no matching unit"
        )
    op.drop_column("inbound_order_detail", "unit")
    op.alter_column("inbound_order_detail", "unit_id", nullable=False)
    op.create_foreign_key(
        "fk_inbound_order_detail_unit_id_unit",
        "inbound_order_detail",
        "unit",
        ["unit_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_inbound_order_detail_unit_id_unit",
        "inbound_order_detail",
        type_="foreignkey",
    )
    op.add_column(
        "inbound_order_detail",
        sa.Column("unit", sa.String(length=50), nullable=True),
    )
    op.execute("""
        UPDATE inbound_order_detail d
        SET unit = u.name
        FROM unit u
        WHERE u.id = d.unit_id
    """)
    op.drop_column("inbound_order_detail", "unit_id")
    op.alter_column("inbound_order_detail", "unit", nullable=False)
