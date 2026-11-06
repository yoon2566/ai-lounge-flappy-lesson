CREATE TABLE IF NOT EXISTS classrooms (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  open_mask INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  board_visibility TEXT NOT NULL DEFAULT 'public' CHECK (board_visibility IN ('class','public')),
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS classrooms_newest ON classrooms(created_at DESC);
CREATE TABLE IF NOT EXISTS classroom_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS classroom_sessions_expiry ON classroom_sessions(expires_at);
CREATE TABLE IF NOT EXISTS classroom_login_attempts (
  address TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_works (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  author TEXT NOT NULL,
  title TEXT NOT NULL,
  lesson TEXT NOT NULL,
  html TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  edit_secret_hash TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  public_sync_pending INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS classroom_works_room_newest ON classroom_works(room_code,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS classroom_works_newest ON classroom_works(created_at DESC);

CREATE INDEX IF NOT EXISTS classroom_works_pending ON classroom_works(room_code,public_sync_pending,updated_at);
CREATE TABLE IF NOT EXISTS classroom_code_aliases (old_code TEXT PRIMARY KEY CHECK(length(old_code)=6),new_code TEXT NOT NULL CHECK(length(new_code)=6 AND new_code NOT GLOB '*[^0-9]*'),migrated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS classroom_code_aliases_new ON classroom_code_aliases(new_code);

-- Dino 2 only. Preserve these reservations when a work or classroom is deleted.
-- A browser's room cookie owns at most one work; existing posts are unchanged.
CREATE TABLE IF NOT EXISTS classroom_board_owners (
  room_code TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  work_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_code,owner_hash)
);
CREATE INDEX IF NOT EXISTS classroom_board_owners_work ON classroom_board_owners(work_id);

-- Apply to the two classroom databases and the shared public artwork database.
-- Existing works start at zero because counts come from actual reaction rows.
CREATE TABLE IF NOT EXISTS board_work_hearts (
  work_id TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  PRIMARY KEY (work_id,client_hash)
) WITHOUT ROWID;
