-- Existing classrooms start unlocked. Apply once, before deploying the new Worker.
ALTER TABLE classrooms ADD COLUMN screen_locked INTEGER NOT NULL DEFAULT 0;
