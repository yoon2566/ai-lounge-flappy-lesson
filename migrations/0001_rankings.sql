CREATE TABLE IF NOT EXISTS flappy_players (
 id TEXT PRIMARY KEY,
 nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
 token_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 best_score INTEGER NOT NULL DEFAULT 0 CHECK(best_score BETWEEN 0 AND 500),
 best_at INTEGER NOT NULL DEFAULT 0,
 completed_runs INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS flappy_runs (
 id TEXT PRIMARY KEY,
 player_id TEXT NOT NULL REFERENCES flappy_players(id),
 started_at INTEGER NOT NULL,
 ended_at INTEGER,
 score INTEGER NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 500)
);
CREATE INDEX IF NOT EXISTS flappy_runs_player ON flappy_runs(player_id, ended_at);
CREATE INDEX IF NOT EXISTS flappy_players_rank ON flappy_players(best_score DESC, best_at ASC);
CREATE TRIGGER IF NOT EXISTS flappy_finish_once
AFTER UPDATE OF ended_at ON flappy_runs
WHEN OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL
BEGIN
 UPDATE flappy_players SET
 best_at=CASE WHEN NEW.score>best_score OR completed_runs=0 THEN NEW.ended_at ELSE best_at END,
 best_score=MAX(best_score,NEW.score),
 completed_runs=completed_runs+1
 WHERE id=NEW.player_id;
END;
