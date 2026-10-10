CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','editor','operator','commercial','viewer')), active boolean NOT NULL DEFAULT true, auth_version integer NOT NULL DEFAULT 0, failed_attempts integer NOT NULL DEFAULT 0, locked_until timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE TABLE workspace_settings(key text PRIMARY KEY,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE user_drafts(user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,key text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(user_id,key));
CREATE TABLE audit_logs(id uuid PRIMARY KEY,user_id text NOT NULL,action text NOT NULL,resource text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at DESC);
