ALTER TABLE staff ADD COLUMN short_name TEXT NOT NULL DEFAULT '';
ALTER TABLE staff ADD COLUMN role TEXT NOT NULL DEFAULT 'stylist' CHECK(role IN ('stylist','junior_stylist_assistant','reception','manicurist'));
ALTER TABLE staff ADD COLUMN seniority_tier TEXT NOT NULL DEFAULT 'senior' CHECK(seniority_tier IN ('senior','junior','support'));
ALTER TABLE staff ADD COLUMN can_hold_appointments INTEGER NOT NULL DEFAULT 1 CHECK(can_hold_appointments IN (0,1));
ALTER TABLE staff ADD COLUMN rest_weekday INTEGER CHECK(rest_weekday IS NULL OR (rest_weekday BETWEEN 0 AND 6));
ALTER TABLE staff ADD COLUMN specialty_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE staff ADD COLUMN notes TEXT NOT NULL DEFAULT '';

INSERT INTO staff(id,display_name,short_name,role,seniority_tier,can_hold_appointments,rest_weekday,specialty_summary,active) VALUES
  ('staff-milagros','Milagros Núñez','Mili','stylist','senior',1,1,'Estilista colorista y cortes',1),
  ('staff-miriam','Miriam Pecho','Miriam','stylist','senior',1,2,'Estilista colorista, alisado, botox, maquillaje, peinados y moños (apoyo temporal: uñas y depilación)',1),
  ('staff-maritza','Maritza Trucios','Maritza','stylist','senior',1,3,'Estilista colorista, alisados, botox y cepillados (apoyo temporal: uñas y depilación)',1),
  ('staff-martha','Martha Arone','Martha','junior_stylist_assistant','junior',1,2,'Asistente y colorista junior (todo color e hidrataciones)',1),
  ('staff-silvia','Silvia Rodríguez','Silvia','reception','support',0,NULL,'Recepción, WhatsApp Web, agenda y confirmaciones',1)
ON CONFLICT(id) DO UPDATE SET
  display_name=excluded.display_name,
  short_name=excluded.short_name,
  role=excluded.role,
  seniority_tier=excluded.seniority_tier,
  can_hold_appointments=excluded.can_hold_appointments,
  rest_weekday=excluded.rest_weekday,
  specialty_summary=excluded.specialty_summary,
  active=excluded.active;

CREATE TABLE IF NOT EXISTS staff_category_capabilities (
  staff_id TEXT NOT NULL REFERENCES staff(id),
  category TEXT NOT NULL,
  capability_level TEXT NOT NULL CHECK(capability_level IN ('primary','junior','plan_b')),
  PRIMARY KEY(staff_id,category)
);

CREATE TABLE IF NOT EXISTS staff_service_overrides (
  staff_id TEXT NOT NULL REFERENCES staff(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  capability_level TEXT NOT NULL CHECK(capability_level IN ('primary','junior','plan_b','disabled')),
  PRIMARY KEY(staff_id,service_id)
);

INSERT OR REPLACE INTO staff_category_capabilities(staff_id,category,capability_level) VALUES
  ('staff-milagros','COLOR','primary'),
  ('staff-milagros','CORTE','primary'),
  ('staff-milagros','TRATAMIENTO','primary'),
  ('staff-milagros','ASESORÍA','primary'),
  ('staff-miriam','COLOR','primary'),
  ('staff-miriam','QUÍMICO','primary'),
  ('staff-miriam','PEINADO','primary'),
  ('staff-miriam','MAQUILLAJE','primary'),
  ('staff-miriam','TRATAMIENTO','primary'),
  ('staff-miriam','ASESORÍA','primary'),
  ('staff-miriam','MANOS / PIES','plan_b'),
  ('staff-miriam','DEPILACION','plan_b'),
  ('staff-maritza','COLOR','primary'),
  ('staff-maritza','QUÍMICO','primary'),
  ('staff-maritza','TRATAMIENTO','primary'),
  ('staff-maritza','ASESORÍA','primary'),
  ('staff-maritza','MANOS / PIES','plan_b'),
  ('staff-maritza','DEPILACION','plan_b'),
  ('staff-martha','COLOR','junior'),
  ('staff-martha','TRATAMIENTO','junior');

INSERT OR REPLACE INTO staff_service_overrides(staff_id,service_id,capability_level)
SELECT 'staff-maritza',id,'primary' FROM services WHERE id IN ('catalog-26','catalog-27','catalog-28','catalog-29','catalog-30');

INSERT OR REPLACE INTO staff_service_overrides(staff_id,service_id,capability_level)
SELECT 'staff-miriam',id,'plan_b' FROM services WHERE id IN ('catalog-41','catalog-42','catalog-43','catalog-44','catalog-45');

INSERT OR REPLACE INTO staff_service_overrides(staff_id,service_id,capability_level)
SELECT 'staff-maritza',id,'plan_b' FROM services WHERE id IN ('catalog-41','catalog-42','catalog-43','catalog-44','catalog-45');

CREATE TABLE IF NOT EXISTS staff_schedule_exceptions (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  exception_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('rest_override','urgent_leave','extra_shift','partial_block')),
  starts_time TEXT,
  ends_time TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'local-administrator',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS staff_exceptions_date ON staff_schedule_exceptions(exception_date,staff_id);

CREATE TABLE IF NOT EXISTS staff_daily_shifts (
  day TEXT NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  turn_order INTEGER NOT NULL CHECK(turn_order>=1),
  checked_in_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present','absent')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(day,staff_id)
);
CREATE INDEX IF NOT EXISTS staff_daily_shifts_order ON staff_daily_shifts(day,turn_order);

ALTER TABLE services ADD COLUMN duration_max_minutes INTEGER CHECK(duration_max_minutes IS NULL OR duration_max_minutes>=duration_minutes);

UPDATE services SET duration_minutes=20,duration_max_minutes=20 WHERE id='touche-evaluacion-capilar';
UPDATE services SET duration_minutes=15,duration_max_minutes=15 WHERE id IN ('catalog-70','catalog-72');
UPDATE services SET duration_minutes=35,duration_max_minutes=40 WHERE category='TRATAMIENTO' AND id NOT IN ('catalog-70','catalog-72');
UPDATE services SET duration_minutes=40,duration_max_minutes=60 WHERE category='CORTE';
UPDATE services SET duration_minutes=90,duration_max_minutes=90 WHERE category='PEINADO';
UPDATE services SET duration_minutes=120,duration_max_minutes=120 WHERE id IN ('catalog-47','catalog-59','catalog-60','catalog-61');
UPDATE services SET duration_minutes=120,duration_max_minutes=150 WHERE id IN ('catalog-46','catalog-55','catalog-56','catalog-57','catalog-58');
UPDATE services SET duration_minutes=90,duration_max_minutes=120 WHERE id IN ('catalog-62','catalog-63','catalog-64','catalog-65','catalog-66','catalog-67','catalog-68','catalog-69');
UPDATE services SET duration_minutes=180,duration_max_minutes=240 WHERE id IN ('catalog-48','catalog-49','catalog-50','catalog-51','catalog-52','catalog-53','catalog-54');

ALTER TABLE appointments ADD COLUMN assignment_mode TEXT NOT NULL DEFAULT 'requested' CHECK(assignment_mode IN ('requested','pool_turn'));
ALTER TABLE appointments ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK(confirmation_status IN ('unconfirmed','reminded_day_before','reminded_same_day','confirmed','rescheduled'));
ALTER TABLE appointments ADD COLUMN reminded_day_before_at TEXT;
ALTER TABLE appointments ADD COLUMN reminded_same_day_at TEXT;
ALTER TABLE appointments ADD COLUMN confirmed_at TEXT;
ALTER TABLE appointments ADD COLUMN reschedule_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE treatments ADD COLUMN staff_id TEXT REFERENCES staff(id);
ALTER TABLE treatments ADD COLUMN technical_notes TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS appointment_events (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','reminded_day_before','reminded_same_day','confirmed','rescheduled','reassigned','completed','cancelled','no_show')),
  previous_starts_at TEXT,
  previous_ends_at TEXT,
  previous_staff_id TEXT,
  next_starts_at TEXT,
  next_ends_at TEXT,
  next_staff_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'local-administrator',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS appointment_events_appt ON appointment_events(appointment_id,created_at);
CREATE INDEX IF NOT EXISTS appointments_status_time ON appointments(status,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS appointments_starts_at ON appointments(starts_at);

DELETE FROM appointments WHERE id IN (
  'b1fdb466-c2b0-44d6-89c6-5bd4c0b169ba',
  '458dab99-0967-4e8a-8b3a-6f97f6a13ed4',
  '7c1b540c-a76a-454c-be32-57c5be6e05d9',
  'cc5047d3-af16-4bd5-aef7-ecb76677df58'
) AND treatment_id IS NULL;

INSERT INTO schema_migrations(version) VALUES ('0009_internal_operations');
