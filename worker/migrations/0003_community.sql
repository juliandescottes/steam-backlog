-- Imported lengths (a file of hours) are the user's own but never shared with the community,
-- so they get their own kind. SQLite can't change a CHECK constraint: rebuild the table.
PRAGMA defer_foreign_keys = true;

CREATE TABLE user_games_new (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  appid INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'playing', 'finished', 'dropped')),
  status_at INTEGER, finished_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  my_main REAL, my_main_extra REAL, my_comp REAL,
  my_len_kind TEXT CHECK (my_len_kind IN ('exact', 'approx', 'endless', 'imported')),
  playtime_min INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER,
  first_seen_at INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, appid)
);
INSERT INTO user_games_new SELECT * FROM user_games;
DROP TABLE user_games;
ALTER TABLE user_games_new RENAME TO user_games;
CREATE INDEX user_games_rev ON user_games (user_id, rev);

-- Deleting an account removes its community entries
DROP TABLE community_lengths;
CREATE TABLE community_lengths (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  appid INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('typed', 'finished_playtime', 'endless')),
  main REAL, main_extra REAL, comp REAL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, appid, kind)
);
CREATE INDEX community_lengths_appid ON community_lengths (appid);
