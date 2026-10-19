-- The user said no to marking a game Finished from its playtime (ONB-5): it isn't suggested again.
ALTER TABLE user_games ADD COLUMN triage_declined INTEGER NOT NULL DEFAULT 0;
