-- Lists sync like views (TECH.md §9). Both tables are still empty: recreate them.
-- Slugs are made on the client, possibly offline on two devices, so they're only unique once a list is shared.
-- list_items gets user_id, so a sync finds the items changed since a rev without a join.
DROP TABLE list_items;
DROP TABLE lists;

CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('manual', 'filter')),
  filter_json TEXT, sort TEXT,
  slug TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'link', 'profile')),
  position TEXT NOT NULL,
  rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX lists_rev ON lists (user_id, rev);
CREATE INDEX lists_slug ON lists (user_id, slug);

CREATE TABLE list_items (
  list_id TEXT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  appid INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (list_id, appid)
);
CREATE INDEX list_items_rev ON list_items (user_id, rev);
