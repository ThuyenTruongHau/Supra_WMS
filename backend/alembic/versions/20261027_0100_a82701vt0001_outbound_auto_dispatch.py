"""Durable automatic outbound dispatch; all zone switches initially off.

Revision ID: a82701vt0001
Revises: c7ba03df7c04
"""
from alembic import op
import sqlalchemy as sa

revision = "a82701vt0001"
down_revision = "c7ba03df7c04"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("outbound_auto_zone",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouse.id"), nullable=False),
        sa.Column("display_zone_id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("state", sa.String(20), nullable=False, server_default="stopped"),
        sa.Column("message", sa.Text()),
        sa.Column("next_pair", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_by_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("warehouse_id", "display_zone_id", name="uq_auto_zone"))
    op.create_index("ix_outbound_auto_zone_warehouse_id", "outbound_auto_zone", ["warehouse_id"])
    op.create_table("outbound_auto_cycle",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("outbound_auto_zone.id"), nullable=False),
        sa.Column("vt_location_id", sa.Integer(), sa.ForeignKey("location.id"), nullable=False),
        sa.Column("source_location_id", sa.Integer(), sa.ForeignKey("location.id"), nullable=False),
        sa.Column("phase", sa.String(30), nullable=False),
        sa.Column("stock_ids", sa.JSON(), nullable=False),
        sa.Column("allocation_ids", sa.JSON(), nullable=False),
        sa.Column("cc_assignments", sa.JSON(), nullable=False),
        sa.Column("pick_task_id", sa.Integer(), sa.ForeignKey("robot_task.id"), nullable=False, unique=True),
        sa.Column("return_task_id", sa.Integer(), sa.ForeignKey("robot_task.id"), unique=True),
        sa.Column("message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("cache_pending", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("completed_at", sa.DateTime(timezone=True)))
    op.create_index("ix_outbound_auto_cycle_zone_id", "outbound_auto_cycle", ["zone_id"])
    op.create_index("uq_auto_active_vt", "outbound_auto_cycle", ["vt_location_id"], unique=True,
                    postgresql_where=sa.text("completed_at IS NULL"), sqlite_where=sa.text("completed_at IS NULL"))
    op.create_table("outbound_auto_command",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cycle_id", sa.Integer(), sa.ForeignKey("outbound_auto_cycle.id"), nullable=False),
        sa.Column("robot_task_id", sa.Integer(), sa.ForeignKey("robot_task.id"), nullable=False, unique=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("cycle_id", "kind", name="uq_auto_cycle_command"))
    op.create_index("ix_outbound_auto_command_cycle_id", "outbound_auto_command", ["cycle_id"])
    op.add_column("outbound_order_allocation", sa.Column("auto_cycle_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_allocation_auto_cycle", "outbound_order_allocation", "outbound_auto_cycle", ["auto_cycle_id"], ["id"])
    op.create_index("ix_outbound_order_allocation_auto_cycle_id", "outbound_order_allocation", ["auto_cycle_id"])


def downgrade():
    op.drop_index("ix_outbound_order_allocation_auto_cycle_id", table_name="outbound_order_allocation")
    op.drop_constraint("fk_allocation_auto_cycle", "outbound_order_allocation", type_="foreignkey")
    op.drop_column("outbound_order_allocation", "auto_cycle_id")
    op.drop_table("outbound_auto_command")
    op.drop_table("outbound_auto_cycle")
    op.drop_table("outbound_auto_zone")
