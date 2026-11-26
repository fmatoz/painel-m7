BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto' AND n.nspname<>'public') THEN
  ALTER EXTENSION pgcrypto SET SCHEMA public;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS utm7.own_users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, full_name text NOT NULL,
 password_hash text, active boolean NOT NULL DEFAULT true, is_admin boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS utm7.own_sessions (
 token_hash text PRIMARY KEY CHECK(length(token_hash)=64), user_id uuid NOT NULL REFERENCES utm7.own_users(id),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS utm7.own_activations (
 token_hash text PRIMARY KEY CHECK(length(token_hash)=64), user_id uuid NOT NULL REFERENCES utm7.own_users(id),
 expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE IF NOT EXISTS utm7.own_login_attempts (
 email text PRIMARY KEY, failures integer NOT NULL DEFAULT 0, window_started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE utm7.own_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm7.own_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm7.own_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm7.own_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA utm7 FROM PUBLIC, anon, authenticated;
COMMIT;

