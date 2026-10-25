-- 列国纪 cloud saves. The same statements run idempotently from src/server/cloud47.ts
-- (CLOUD_SCHEMA47) on first use; keep the two in step.
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE COLLATE NOCASE,salt TEXT NOT NULL,hash TEXT NOT NULL,iterations INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS saves(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,saved_at INTEGER NOT NULL,size INTEGER NOT NULL,day TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,name));
CREATE TABLE IF NOT EXISTS save_chunks(user_id INTEGER NOT NULL,name TEXT NOT NULL,idx INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(user_id,name,idx));
CREATE TABLE IF NOT EXISTS login_failures(key TEXT NOT NULL,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_failures_key ON login_failures(key,at);
