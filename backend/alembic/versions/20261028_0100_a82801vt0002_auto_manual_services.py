"""Distinguish existing native cycles from shared manual-service cycles."""
from alembic import op
import sqlalchemy as sa

revision = "a82801vt0002"
down_revision = "a82701vt0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("outbound_auto_cycle", sa.Column("execution_mode", sa.String(24),
                                                 nullable=False, server_default="native"))


def downgrade():
    op.drop_column("outbound_auto_cycle", "execution_mode")
