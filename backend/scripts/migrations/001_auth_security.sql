ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accept_terms boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash
  ON password_resets (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_resets_email
  ON password_resets (email);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  family_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  created_ip inet,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id
  ON refresh_tokens (family_id);