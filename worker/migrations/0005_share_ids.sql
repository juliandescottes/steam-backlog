-- Share links are /s/<share_id>: random, unique across users, set when a list is made.
-- They replace /u/<handle>/l/<slug>; existing lists get a new id, and a rev so clients learn it.
ALTER TABLE lists RENAME COLUMN slug TO share_id;
DROP INDEX lists_slug;
UPDATE lists SET share_id = lower(hex(randomblob(6)));
CREATE UNIQUE INDEX lists_share_id ON lists (share_id);
UPDATE user_rev SET rev = rev + 1 WHERE user_id IN (SELECT user_id FROM lists);
UPDATE lists SET rev = (SELECT rev FROM user_rev r WHERE r.user_id = lists.user_id);
