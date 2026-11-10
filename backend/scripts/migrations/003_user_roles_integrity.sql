DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM user_roles LIMIT 1) THEN
    RAISE EXCEPTION 'user_roles contains rows; review and map them before rebuilding this malformed join table';
  END IF;
END
$$;

DROP TABLE user_roles;

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id smallint NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT NOW(),
  assigned_by bigint REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role_id)
);

CREATE INDEX idx_user_roles_role_id ON user_roles (role_id);

INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT id, role_id, created_at
FROM users
WHERE deleted_at IS NULL
ON CONFLICT (user_id, role_id) DO NOTHING;