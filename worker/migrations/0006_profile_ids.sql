-- Public profiles are /u/<profile_id>: random, set for every user, nothing to choose (no usernames to squat).
-- The handle column stays, unused: SQLite can't drop a UNIQUE column, and the code before this migration still reads it.
ALTER TABLE users ADD COLUMN profile_id TEXT;
UPDATE users SET profile_id = lower(hex(randomblob(6)));
CREATE UNIQUE INDEX users_profile_id ON users (profile_id);
