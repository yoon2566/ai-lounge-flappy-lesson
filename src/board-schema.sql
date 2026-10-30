CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  title TEXT NOT NULL,
  lesson TEXT NOT NULL,
  html TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS works_newest ON works(created_at DESC, id DESC);
