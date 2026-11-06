-- Apply to shared ARTWORK_DB; existing works and legacy Workers stay unchanged.
CREATE TABLE IF NOT EXISTS classroom_work_sync (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL
);
