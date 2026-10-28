"""Return-only cycles and durable journals for unowned manual returns."""
from alembic import op
import sqlalchemy as sa

revision = "a82801vt0003"
down_revision = "a82801vt0002"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("outbound_auto_cycle", "pick_task_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column("outbound_auto_command", "cycle_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("outbound_auto_command", sa.Column("verified_unsent_by_id", sa.Integer(), nullable=True))
    op.add_column("outbound_auto_command", sa.Column("verified_unsent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("outbound_auto_command", sa.Column("verification_note", sa.Text(), nullable=True))
    op.create_foreign_key("fk_auto_command_verified_user", "outbound_auto_command", "users", ["verified_unsent_by_id"], ["id"])


def downgrade():
    # Do not discard a live journal or return-only ownership during rollback.
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT EXISTS (SELECT 1 FROM outbound_auto_cycle WHERE pick_task_id IS NULL) "
                                  "OR EXISTS (SELECT 1 FROM outbound_auto_command WHERE cycle_id IS NULL)")).scalar():
        raise RuntimeError("Reconcile return-only cycles/journals before downgrading")
    op.drop_constraint("fk_auto_command_verified_user", "outbound_auto_command", type_="foreignkey")
    for name in ("verification_note", "verified_unsent_at", "verified_unsent_by_id"):
        op.drop_column("outbound_auto_command", name)
    op.alter_column("outbound_auto_command", "cycle_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("outbound_auto_cycle", "pick_task_id", existing_type=sa.Integer(), nullable=False)
