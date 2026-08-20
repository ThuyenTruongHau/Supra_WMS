CREATE UNLOGGED TABLE item_import_staging (
    job_id       UUID        NOT NULL,
    row_no       BIGINT      NOT NULL,          -- số dòng trong file (bắt đầu từ 2 nếu có header)
    sku          TEXT,
    name         TEXT,
    description  TEXT,
    supplier     TEXT,
    base_unit    TEXT,                        -- tên đơn vị hoặc id (tùy format Masan)
    base_quantity TEXT,
    min_quantity  TEXT,
    max_quantity  TEXT,
    -- thêm cột raw khác từ file Masan nếu cần
    raw_data     JSONB       DEFAULT '{}'::jsonb
);

-- Index nhẹ chỉ phục vụ merge/validate trong 1 job
CREATE INDEX ix_item_import_staging_job_id ON item_import_staging (job_id);
CREATE INDEX ix_item_import_staging_job_sku ON item_import_staging (job_id, sku);

CREATE TABLE item_import_error (
    id         BIGSERIAL PRIMARY KEY,
    job_id     UUID        NOT NULL,
    row_no     BIGINT      NOT NULL,
    sku        TEXT,
    message    TEXT        NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_item_import_error_job_id ON item_import_error (job_id);