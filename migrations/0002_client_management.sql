ALTER TABLE clients ADD COLUMN birthday TEXT;
ALTER TABLE clients ADD COLUMN archived_at TEXT;
ALTER TABLE clients ADD COLUMN updated_at TEXT;
CREATE INDEX clients_archived_name ON clients(archived_at,full_name);
INSERT INTO schema_migrations(version) VALUES ('0002_client_management');
