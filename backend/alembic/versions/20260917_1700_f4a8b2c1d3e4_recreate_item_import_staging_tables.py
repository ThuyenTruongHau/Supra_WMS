"""recreate item import staging tables

Revision ID: f4a8b2c1d3e4
Revises: 3eb0c1679875
Create Date: 2026-09-17 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "f4a8b2c1d3e4"
down_revision: Union[str, None] = "3eb0c1679875"
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


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_item_import_staging_job_sku")
    op.execute("DROP INDEX IF EXISTS ix_item_import_staging_job_id")
    op.execute("DROP TABLE IF EXISTS item_import_staging")
