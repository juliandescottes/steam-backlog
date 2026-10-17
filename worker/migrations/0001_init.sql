-- Schema from TECH.md §3. Times are Unix milliseconds.

-- Global catalog, shared by all users
CREATE TABLE games (
  appid INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  has_portrait_art INTEGER,
  igdb_id INTEGER,
  igdb_main REAL, igdb_main_extra REAL, igdb_comp REAL, igdb_count INTEGER,
  igdb_checked_at INTEGER,
  comm_main_extra REAL, comm_count INTEGER NOT NULL DEFAULT 0, comm_endless_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX games_igdb_queue ON games (igdb_checked_at);

CREATE TABLE community_lengths (
  user_id TEXT NOT NULL,
  appid INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('typed', 'finished_playtime', 'endless')),
  main REAL, main_extra REAL, comp REAL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, appid, kind)
);
CREATE INDEX community_lengths_appid ON community_lengths (appid);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL UNIQUE,
  handle TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  profile_public INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}',
  library_synced_at INTEGER,
  created_at INTEGER NOT NULL
);

-- id is the SHA-256 of the cookie value, so a database leak doesn't leak sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Per-user state; rev = per-user change counter, used by sync
CREATE TABLE user_games (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  appid INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'playing', 'finished', 'dropped')),
  status_at INTEGER, finished_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  my_main REAL, my_main_extra REAL, my_comp REAL,
  my_len_kind TEXT CHECK (my_len_kind IN ('exact', 'approx', 'endless')),
  playtime_min INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER,
  first_seen_at INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, appid)
);
CREATE INDEX user_games_rev ON user_games (user_id, rev);

CREATE TABLE views (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL, filter_json TEXT NOT NULL, sort TEXT NOT NULL, position TEXT NOT NULL,
  rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX views_rev ON views (user_id, rev);

CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('manual', 'filter')),
  filter_json TEXT, sort TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'link', 'profile')),
  rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, slug)
);
CREATE INDEX lists_rev ON lists (user_id, rev);

CREATE TABLE list_items (
  list_id TEXT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  appid INTEGER NOT NULL,
  position TEXT NOT NULL,
  rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (list_id, appid)
);

-- Last rev handed out per user
CREATE TABLE user_rev (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  rev INTEGER NOT NULL
);

-- Op ids already applied, so retried sync requests don't apply twice; purged after a day
CREATE TABLE applied_ops (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  op_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, op_id)
);
