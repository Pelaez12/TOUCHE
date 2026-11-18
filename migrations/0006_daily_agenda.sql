ALTER TABLE appointments ADD COLUMN assignee TEXT NOT NULL DEFAULT '';
ALTER TABLE appointments ADD COLUMN updated_at TEXT;
CREATE INDEX appointments_client_time ON appointments(client_id,starts_at,ends_at);
CREATE TABLE agenda_preferences(id TEXT PRIMARY KEY CHECK(id='salon'),open_time TEXT NOT NULL,close_time TEXT NOT NULL,weekdays_json TEXT NOT NULL);
INSERT INTO agenda_preferences VALUES ('salon','09:00','19:00','[1,2,3,4,5,6]');
CREATE TABLE agenda_day_notes(day TEXT PRIMARY KEY,notes TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
INSERT INTO schema_migrations(version) VALUES ('0006_daily_agenda');
