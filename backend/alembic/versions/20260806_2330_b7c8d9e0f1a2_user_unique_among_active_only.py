"""user unique among active only

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-08-06 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)
    op.execute(
        "CREATE UNIQUE INDEX uq_users_username_active "
        "ON users (username) WHERE is_active IS TRUE"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_users_email_active "
        "ON users (email) WHERE is_active IS TRUE"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_email_active")
    op.execute("DROP INDEX IF EXISTS uq_users_username_active")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)
