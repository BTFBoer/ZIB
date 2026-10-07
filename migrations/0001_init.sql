-- ZIB database (Cloudflare D1 / SQLite)
-- Alle gegevens worden als JSON-document per record bewaard; elke wijziging bewaart de vorige versie.

CREATE TABLE IF NOT EXISTS records (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  data        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  deleted     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  created_by  TEXT,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_type ON records (type, deleted, updated_at);

CREATE TABLE IF NOT EXISTS record_versions (
  id        TEXT NOT NULL,
  version   INTEGER NOT NULL,
  data      TEXT NOT NULL,
  saved_at  TEXT,
  saved_by  TEXT,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS audit (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  user       TEXT,
  action     TEXT NOT NULL,
  record_id  TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_record ON audit (record_id, at);
