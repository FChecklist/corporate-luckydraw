-- "Notify me when this game begins" (release 1.6.0, apps/edge/src/push.ts): when the game really started and when its one alert was claimed for sending. No personal data in either column.
-- Apply BEFORE setting PUSH_URL and PUSH_ADMIN_KEY (while those are unset the code never touches these columns). test/migrations.test.ts keeps this identical to PUSH_SCHEMA in src/push.ts.
ALTER TABLE draw ADD COLUMN push_due_ms INTEGER;
ALTER TABLE draw ADD COLUMN push_sent_ms INTEGER;
