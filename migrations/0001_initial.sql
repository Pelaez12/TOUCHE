PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS import_batches (
 id TEXT PRIMARY KEY, source_name TEXT NOT NULL, source_sha256 TEXT NOT NULL UNIQUE,
 as_of TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clients (
 id TEXT PRIMARY KEY, full_name TEXT NOT NULL, phone TEXT, birthday_raw TEXT,
 in_directory INTEGER NOT NULL DEFAULT 0 CHECK(in_directory IN (0,1)),
 identity_status TEXT NOT NULL DEFAULT 'provisional' CHECK(identity_status IN ('provisional','confirmed')),
 notes TEXT NOT NULL DEFAULT '', source_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS services (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
 price_cents INTEGER CHECK(price_cents IS NULL OR price_cents>=0),
 duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes>0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), source_json TEXT
);
CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)));
CREATE TABLE IF NOT EXISTS service_rules (
 category TEXT PRIMARY KEY, retouch_days INTEGER CHECK(retouch_days IS NULL OR retouch_days>0),
 upcoming_days INTEGER CHECK(upcoming_days IS NULL OR upcoming_days>=0),
 updated_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS treatments (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), service_id TEXT REFERENCES services(id),
 service_name TEXT NOT NULL, category TEXT NOT NULL, performed_on TEXT NOT NULL,
 import_id TEXT REFERENCES import_batches(id), source_sheet TEXT, source_cell TEXT,
 source_value TEXT, source_header TEXT, notes TEXT NOT NULL DEFAULT '',
 UNIQUE(import_id,source_sheet,source_cell)
);
CREATE INDEX IF NOT EXISTS treatments_client_date ON treatments(client_id,performed_on);
CREATE INDEX IF NOT EXISTS treatments_date_category ON treatments(performed_on,category);
CREATE TABLE IF NOT EXISTS import_issues (
 id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES import_batches(id), client_id TEXT REFERENCES clients(id),
 source_sheet TEXT NOT NULL, source_cell TEXT NOT NULL, source_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','resolved','dismissed')),
 resolution_note TEXT, resolved_by TEXT, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS appointments (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), service_id TEXT NOT NULL REFERENCES services(id),
 staff_id TEXT REFERENCES staff(id), starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','completed','cancelled','no_show')),
 treatment_id TEXT UNIQUE REFERENCES treatments(id), notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS appointments_staff_time ON appointments(staff_id,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS client_followups (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), category TEXT NOT NULL,
 treatment_id TEXT REFERENCES treatments(id), override_date TEXT, assigned_to TEXT REFERENCES staff(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','contacted','booked','closed')),
 notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(client_id,category)
);
CREATE TABLE IF NOT EXISTS audit_log (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL, changes_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE VIEW IF NOT EXISTS recorded_visits AS SELECT DISTINCT client_id,performed_on FROM treatments;
INSERT OR IGNORE INTO schema_migrations(version) VALUES ('0001_initial');
