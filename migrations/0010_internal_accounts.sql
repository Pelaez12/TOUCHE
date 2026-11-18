-- Cuentas internas de acceso sin Gmail: 1 única cuenta de Administrador y colaboradores pendientes de activación por contraseña.

CREATE TABLE IF NOT EXISTS web_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','collaborator')),
  staff_id TEXT REFERENCES staff(id),
  password_hash TEXT,
  salt TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  password_updated_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Garantiza en base de datos que solo exista UNA cuenta de Administrador.
CREATE UNIQUE INDEX IF NOT EXISTS web_accounts_single_admin ON web_accounts(role) WHERE role='admin';
CREATE UNIQUE INDEX IF NOT EXISTS web_accounts_staff ON web_accounts(staff_id) WHERE staff_id IS NOT NULL;

-- La cuenta única de Administrador hereda la clave administrativa vigente (0008) si existe, para no bloquear el primer acceso.
INSERT INTO web_accounts (id,email,display_name,role,staff_id,password_hash,salt,active,password_updated_at)
SELECT
  'acct-admin',
  'admin@touche.pe',
  'Administración Touché',
  'admin',
  NULL,
  (SELECT key_hash FROM web_access_settings WHERE id='admin'),
  (SELECT salt FROM web_access_settings WHERE id='admin'),
  CASE WHEN EXISTS(SELECT 1 FROM web_access_settings WHERE id='admin') THEN 1 ELSE 0 END,
  CASE WHEN EXISTS(SELECT 1 FROM web_access_settings WHERE id='admin') THEN CURRENT_TIMESTAMP ELSE NULL END
WHERE NOT EXISTS (SELECT 1 FROM web_accounts WHERE id='acct-admin' OR role='admin');

-- Cuentas internas de colaboradoras creadas inicialmente vacías/inactivas para que Administración asigne su contraseña desde la web.
INSERT INTO web_accounts (id,email,display_name,role,staff_id,password_hash,salt,active,password_updated_at) VALUES
  ('acct-milagros','milagros@touche.pe','Milagros Núñez','collaborator','staff-milagros',NULL,NULL,0,NULL),
  ('acct-miriam','miriam@touche.pe','Miriam Pecho','collaborator','staff-miriam',NULL,NULL,0,NULL),
  ('acct-maritza','maritza@touche.pe','Maritza Trucios','collaborator','staff-maritza',NULL,NULL,0,NULL),
  ('acct-martha','martha@touche.pe','Martha Arone','collaborator','staff-martha',NULL,NULL,0,NULL),
  ('acct-silvia','silvia@touche.pe','Silvia Rodríguez','collaborator','staff-silvia',NULL,NULL,0,NULL)
ON CONFLICT(id) DO NOTHING;

ALTER TABLE web_sessions ADD COLUMN account_id TEXT REFERENCES web_accounts(id);
CREATE INDEX IF NOT EXISTS web_sessions_account ON web_sessions(account_id);

INSERT INTO schema_migrations(version) VALUES ('0010_internal_accounts');
