BEGIN;

-- Running upgrade a82801vt0002 -> a82801vt0003

ALTER TABLE outbound_auto_cycle ALTER COLUMN pick_task_id DROP NOT NULL;

ALTER TABLE outbound_auto_command ALTER COLUMN cycle_id DROP NOT NULL;

ALTER TABLE outbound_auto_command ADD COLUMN verified_unsent_by_id INTEGER;

ALTER TABLE outbound_auto_command ADD COLUMN verified_unsent_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE outbound_auto_command ADD COLUMN verification_note TEXT;

ALTER TABLE outbound_auto_command ADD CONSTRAINT fk_auto_command_verified_user FOREIGN KEY(verified_unsent_by_id) REFERENCES users (id);

UPDATE alembic_version SET version_num='a82801vt0003' WHERE alembic_version.version_num = 'a82801vt0002';

COMMIT;

