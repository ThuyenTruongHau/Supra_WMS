"""recreate item import staging tables

Revision ID: d4e5f6a7b8c9
Revises: c8d9e0f1a2b3
Create Date: 2026-08-20 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNLOGGED TABLE IF NOT EXISTS item_import_staging (
            job_id        UUID NOT NULL,
            row_no        BIGINT NOT NULL,
            sku           TEXT,
            name          TEXT,
            description   TEXT,
            supplier      TEXT,
            base_unit     TEXT,
            base_quantity TEXT,
            min_quantity  TEXT,
            max_quantity  TEXT,
            raw_data      JSONB DEFAULT '{}'::jsonb
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_item_import_staging_job_id
        ON item_import_staging (job_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_item_import_staging_job_sku
        ON item_import_staging (job_id, sku)
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS item_import_error (
            id         BIGSERIAL PRIMARY KEY,
            job_id     UUID NOT NULL,
            row_no     BIGINT NOT NULL,
            sku        TEXT,
            message    TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_item_import_error_job_id
        ON item_import_error (job_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_item_import_error_job_id")
    op.execute("DROP TABLE IF EXISTS item_import_error")
    op.execute("DROP INDEX IF EXISTS ix_item_import_staging_job_sku")
    op.execute("DROP INDEX IF EXISTS ix_item_import_staging_job_id")
    op.execute("DROP TABLE IF EXISTS item_import_staging")
