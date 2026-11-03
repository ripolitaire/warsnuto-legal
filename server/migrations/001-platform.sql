CREATE TABLE users (
  id INTEGER PRIMARY KEY, discord_id TEXT NOT NULL UNIQUE,
  username TEXT, display_name TEXT, avatar TEXT, banner TEXT,
  account_created_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  first_login_at INTEGER, last_login_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  preferences TEXT NOT NULL DEFAULT '{"reducedMotion":false}', version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX users_username ON users(username COLLATE NOCASE);
CREATE INDEX users_last_login ON users(last_login_at);
CREATE TABLE roles (name TEXT PRIMARY KEY CHECK(name IN ('USER','MODERATOR','ADMIN','OWNER')), version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE role_permissions (role TEXT NOT NULL REFERENCES roles(name), permission TEXT NOT NULL, PRIMARY KEY(role,permission));
CREATE TABLE user_roles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL REFERENCES roles(name));
CREATE INDEX user_roles_role ON user_roles(role);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, authenticated_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, revoked_at INTEGER, browser TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id,revoked_at,expires_at);
CREATE INDEX sessions_expiration ON sessions(expires_at);
CREATE TABLE oauth_states (state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, verifier TEXT NOT NULL, destination TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX oauth_expiration ON oauth_states(expires_at);
CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_id TEXT, created_at INTEGER NOT NULL, result TEXT NOT NULL, context TEXT NOT NULL DEFAULT '{}');
CREATE INDEX audit_time ON audit_logs(created_at DESC,id DESC);
CREATE INDEX audit_actor ON audit_logs(actor_id,id DESC);
CREATE INDEX audit_action ON audit_logs(action,id DESC);
CREATE TABLE site_settings (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL DEFAULT 'WarsNuto', description TEXT NOT NULL DEFAULT '', announcement TEXT NOT NULL DEFAULT '', maintenance INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0);
INSERT INTO site_settings(id) VALUES(1);
CREATE TABLE rate_limits (bucket TEXT PRIMARY KEY, counter INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_expiration ON rate_limits(expires_at);
