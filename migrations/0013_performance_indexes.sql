-- Índices de rendimiento (auditoría expert-code). Idempotente.
CREATE INDEX IF NOT EXISTS web_accounts_email_lower ON web_accounts(lower(email));
CREATE INDEX IF NOT EXISTS appointments_client_status_tr ON appointments(client_id, status, treatment_id);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS treatments_staff ON treatments(staff_id);
CREATE INDEX IF NOT EXISTS admin_alerts_appt_kind_status ON admin_alerts(appointment_id, kind, status);
CREATE INDEX IF NOT EXISTS admin_alerts_staff ON admin_alerts(staff_id);
