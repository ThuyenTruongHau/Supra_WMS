"""Durable inbound batches and warehouse send pause."""
from alembic import op
import sqlalchemy as sa

revision = "a83001in0001"
down_revision = "a82801vt0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("inbound_dispatch_control",
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouse.id"), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("legacy_migrated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("message", sa.Text()))
    op.create_table("inbound_dispatch_batch",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouse.id"), nullable=False, index=True),
        sa.Column("location_ids", sa.JSON(), nullable=False),
        sa.Column("assign_robot_id", sa.String(50)),
        sa.Column("sorting_persons", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)))
    op.create_index("uq_inbound_dispatch_open_batch", "inbound_dispatch_batch", ["warehouse_id"], unique=True,
                    postgresql_where=sa.text("completed_at IS NULL"), sqlite_where=sa.text("completed_at IS NULL"))
    op.create_table("inbound_dispatch_command",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouse.id"), nullable=False, index=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inbound_dispatch_batch.id"), index=True),
        sa.Column("detail_id", sa.Integer(), nullable=False, index=True),
        sa.Column("position", sa.Integer()),
        sa.Column("from_location_id", sa.Integer()), sa.Column("to_location_id", sa.Integer()),
        sa.Column("assign_robot_id", sa.String(50)),
        sa.Column("state", sa.String(20), nullable=False, index=True),
        sa.Column("token", sa.String(36)), sa.Column("reserved_at", sa.DateTime(timezone=True)),
        sa.Column("order_id", sa.String(50), unique=True),
        sa.Column("robot_task_id", sa.Integer(), sa.ForeignKey("robot_task.id", ondelete="SET NULL"), unique=True),
        sa.Column("message", sa.Text()),
        sa.Column("verified_by_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("verification_note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("batch_id", "position", name="uq_inbound_dispatch_position"))
    # Existing installations must explicitly resume after legacy queue reconciliation.
    op.execute(sa.text("INSERT INTO inbound_dispatch_control (warehouse_id, enabled, legacy_migrated, message) "
                       "SELECT id, false, false, 'Kiểm tra hàng đợi nhập cũ rồi bấm Tiếp tục' FROM warehouse"))


def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM inbound_dispatch_command "
                                     "WHERE state NOT IN ('completed','failed','cancelled','skipped'))")).scalar():
        raise RuntimeError("Finish/reconcile inbound dispatch commands before downgrade")
    op.drop_table("inbound_dispatch_command")
    op.drop_table("inbound_dispatch_batch")
    op.drop_table("inbound_dispatch_control")
