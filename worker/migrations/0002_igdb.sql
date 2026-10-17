-- Short-lived values the Worker caches between runs (the Twitch token for IGDB)
CREATE TABLE cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
