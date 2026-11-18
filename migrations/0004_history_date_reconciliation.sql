ALTER TABLE treatments ADD COLUMN source_cell_original TEXT;
ALTER TABLE treatments ADD COLUMN source_part INTEGER NOT NULL DEFAULT 1;
ALTER TABLE treatments ADD COLUMN date_resolution TEXT;
CREATE TABLE history_date_revisions (
 id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES import_batches(id),
 source_sheet TEXT NOT NULL, source_cell TEXT NOT NULL,
 original_value TEXT, original_header TEXT, dates_json TEXT NOT NULL,
 rule TEXT NOT NULL, authorization_note TEXT NOT NULL, review_date TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(import_id,source_sheet,source_cell,review_date)
);
INSERT INTO schema_migrations(version) VALUES ('0004_history_date_reconciliation');
