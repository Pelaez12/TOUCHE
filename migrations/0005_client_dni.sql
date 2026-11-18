ALTER TABLE clients ADD COLUMN dni TEXT CHECK(dni IS NULL OR (length(dni)=8 AND dni NOT GLOB '*[^0-9]*'));
CREATE UNIQUE INDEX clients_unique_dni ON clients(dni) WHERE dni IS NOT NULL;
INSERT INTO schema_migrations(version) VALUES ('0005_client_dni');
