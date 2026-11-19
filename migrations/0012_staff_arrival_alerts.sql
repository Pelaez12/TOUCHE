CREATE TABLE admin_alerts_v2 (
  id TEXT PRIMARY KEY,
  appointment_id TEXT REFERENCES appointments(id),
  client_id TEXT REFERENCES clients(id),
  staff_id TEXT REFERENCES staff(id),
  kind TEXT NOT NULL CHECK(kind IN ('client_not_arrived','client_reminder_needed','staff_arrived')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT
);
INSERT INTO admin_alerts_v2 SELECT * FROM admin_alerts;
DROP TABLE admin_alerts;
ALTER TABLE admin_alerts_v2 RENAME TO admin_alerts;
CREATE INDEX IF NOT EXISTS admin_alerts_status_created ON admin_alerts(status, created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('0012_staff_arrival_alerts');
