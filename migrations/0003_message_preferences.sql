CREATE TABLE IF NOT EXISTS message_preferences (
 id TEXT PRIMARY KEY CHECK(id='return'),
 template TEXT NOT NULL, promotion TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO message_preferences(id,template) VALUES ('return','Hola, {nombre}. Te saludamos de Touché Hair Studio. En tu última visita registrada te realizaste {servicio}. Nos encantaría recibirte nuevamente. {promocion}
¿Te gustaría que coordinemos tu próxima visita?');
INSERT INTO schema_migrations(version) VALUES ('0003_message_preferences');
