CREATE TABLE web_access_settings(id TEXT PRIMARY KEY CHECK(id='admin'),key_hash TEXT NOT NULL,salt TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE web_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX web_sessions_expiry ON web_sessions(expires_at);
CREATE TABLE web_login_limits(principal_hash TEXT PRIMARY KEY,window_start INTEGER NOT NULL,attempts INTEGER NOT NULL);
INSERT INTO schema_migrations(version) VALUES ('0008_web_access');
