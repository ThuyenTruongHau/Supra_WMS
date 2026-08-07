"""change_item_base_unit_to_unit_fk

Revision ID: a109eb9f1110
Revises: c1d2e3f4a5b6
Create Date: 2026-08-07 08:57:44.220495

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a109eb9f1110'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tạo unit cho mỗi base_unit string chưa có trong bảng unit
    op.execute("""
        INSERT INTO unit (name, description)
        SELECT DISTINCT TRIM(i.base_unit), NULL
        FROM item i
        WHERE NOT EXISTS (
            SELECT 1 FROM unit u WHERE u.name = TRIM(i.base_unit)
        )
    """)
    # 2. Thêm cột FK tạm (nullable trước)
    op.add_column(
        "item",
        sa.Column("base_unit_id", sa.Integer(), nullable=True),
    )
    # 3. Map string -> unit.id
    op.execute("""
        UPDATE item i
        SET base_unit_id = u.id
        FROM unit u
        WHERE u.name = TRIM(i.base_unit)
    """)
    # 4. Kiểm tra dữ liệu orphan (nên fail sớm nếu có)
    conn = op.get_bind()
    orphan_count = conn.execute(
        sa.text("SELECT COUNT(*) FROM item WHERE base_unit_id IS NULL")
    ).scalar()
    if orphan_count:
        raise RuntimeError(
            f"Migration failed: {orphan_count} item(s) have no matching unit"
        )
    # 5. Xóa cột string cũ
    op.drop_column("item", "base_unit")
    # 6. Đổi tên cột mới thành base_unit (giữ tên cột DB như model)
    op.alter_column("item", "base_unit_id", new_column_name="base_unit")
    # 7. NOT NULL + FK
    op.alter_column("item", "base_unit", nullable=False)
    op.create_foreign_key(
        "fk_item_base_unit_unit",
        "item",
        "unit",
        ["base_unit"],
        ["id"],
    )
def downgrade() -> None:
    op.drop_constraint("fk_item_base_unit_unit", "item", type_="foreignkey")
    op.add_column(
        "item",
        sa.Column("base_unit_name", sa.String(length=20), nullable=True),
    )
    op.execute("""
        UPDATE item i
        SET base_unit_name = u.name
        FROM unit u
        WHERE u.id = i.base_unit
    """)
    op.drop_column("item", "base_unit")
    op.alter_column("item", "base_unit_name", new_column_name="base_unit")
    op.alter_column("item", "base_unit", nullable=False)
