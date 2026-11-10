ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id
  ON audit_logs (request_id);