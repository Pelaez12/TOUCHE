ALTER TABLE appointments ADD COLUMN arrival_status TEXT NOT NULL DEFAULT 'pending' CHECK(arrival_status IN ('pending','arrived','not_arrived'));
ALTER TABLE appointments ADD COLUMN arrived_at TEXT;

CREATE TABLE IF NOT EXISTS admin_alerts (
  id TEXT PRIMARY KEY,
  appointment_id TEXT REFERENCES appointments(id),
  client_id TEXT REFERENCES clients(id),
  staff_id TEXT REFERENCES staff(id),
  kind TEXT NOT NULL CHECK(kind IN ('client_not_arrived','client_reminder_needed')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS admin_alerts_status_created ON admin_alerts(status, created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('0011_stylist_alerts_and_profile');
