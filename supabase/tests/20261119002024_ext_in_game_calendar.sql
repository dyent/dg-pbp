-- In-game calendar: GM-only date changes (set, shift, clear a room, undo),
-- the room-override rules, and who can read which changes.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(24);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'calgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'calsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caljo@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'calout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code, is_archived)
VALUES
  ('00000000-0000-0000-0000-0000000e2001', 'Calendar', '00000000-0000-0000-0000-0000000e1001', '0e200001', false),
  ('00000000-0000-0000-0000-0000000e2002', 'Fresh', '00000000-0000-0000-0000-0000000e1001', '0e200002', false),
  ('00000000-0000-0000-0000-0000000e2003', 'Archived', '00000000-0000-0000-0000-0000000e1001', '0e200003', true);

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1003', 'Jo', now(), false),
  ('00000000-0000-0000-0000-0000000e2002', '00000000-0000-0000-0000-0000000e1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000e2003', '00000000-0000-0000-0000-0000000e1001', 'GM', now(), false);

INSERT INTO sub_channels (id, channel_id, name, visibility)
VALUES
  ('00000000-0000-0000-0000-0000000e3001', '00000000-0000-0000-0000-0000000e2001', 'Morgue', 'all'),
  ('00000000-0000-0000-0000-0000000e3002', '00000000-0000-0000-0000-0000000e2001', 'Flashback', 'private'),
  ('00000000-0000-0000-0000-0000000e3003', '00000000-0000-0000-0000-0000000e2002', 'Elsewhere', 'all');

INSERT INTO sub_channel_members (sub_channel_id, user_id)
VALUES ('00000000-0000-0000-0000-0000000e3002', '00000000-0000-0000-0000-0000000e1002');

-- Day numbers: days since 1970-01-01.
CREATE TEMP TABLE d AS SELECT
  (DATE '1997-10-14' - DATE '1970-01-01') AS oct14,
  (DATE '1997-10-17' - DATE '1970-01-01') AS oct17,
  (DATE '1997-10-15' - DATE '1970-01-01') AS oct15,
  (DATE '1997-01-31' - DATE '1970-01-01') AS jan31,
  (DATE '1997-02-28' - DATE '1970-01-01') AS feb28;
GRANT SELECT ON d TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM ========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_set_in_game_date('00000000-0000-0000-0000-0000000e2001', NULL, (SELECT oct14 FROM d))$$,
  'GM sets the campaign date'
);
SELECT lives_ok(
  $$SELECT ext_shift_in_game_date('00000000-0000-0000-0000-0000000e2001', NULL, 3, 'day')$$,
  'GM moves the campaign forward 3 days'
);
SELECT is(
  (SELECT day_number FROM ext_calendar_changes WHERE channel_id = '00000000-0000-0000-0000-0000000e2001' ORDER BY created_at DESC LIMIT 1),
  (SELECT oct17 FROM d), 'The campaign is now on 17 Oct 1997'
);
SELECT is(
  (SELECT shift_amount || ' ' || shift_unit FROM ext_calendar_changes WHERE kind = 'shift' AND channel_id = '00000000-0000-0000-0000-0000000e2001'),
  '3 day', 'The shift is recorded for the divider'
);

-- A room without its own date starts from the campaign date.
SELECT lives_ok(
  $$SELECT ext_shift_in_game_date('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e3001', -2, 'day')$$,
  'GM moves one room back 2 days'
);
SELECT is(
  (SELECT day_number FROM ext_calendar_changes WHERE sub_channel_id = '00000000-0000-0000-0000-0000000e3001' ORDER BY created_at DESC LIMIT 1),
  (SELECT oct15 FROM d), 'The room is on 15 Oct (2 days before the campaign date)'
);
SELECT lives_ok(
  $$SELECT ext_clear_room_date('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e3001')$$,
  'GM returns the room to the campaign date'
);
SELECT throws_ok(
  $$SELECT ext_clear_room_date('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e3001')$$,
  'P0001', 'This room already follows the campaign date',
  'A room that follows the campaign cannot be cleared again'
);

-- Months keep the day of the month where they can.
SELECT ext_set_in_game_date('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e3002', (SELECT jan31 FROM d));
SELECT ext_shift_in_game_date('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e3002', 1, 'month');
SELECT is(
  (SELECT day_number FROM ext_calendar_changes WHERE sub_channel_id = '00000000-0000-0000-0000-0000000e3002' ORDER BY created_at DESC LIMIT 1),
  (SELECT feb28 FROM d), '31 Jan + 1 month = 28 Feb'
);

SELECT throws_ok(
  $$SELECT ext_shift_in_game_date('00000000-0000-0000-0000-0000000e2002', NULL, 1, 'day')$$,
  'P0001', 'Set the in-game date first', 'Time cannot move before a date is set'
);
SELECT throws_ok(
  $$SELECT ext_shift_in_game_date('00000000-0000-0000-0000-0000000e2001', NULL, 1, 'hour')$$,
  'P0001', 'Choose days, weeks, months or years', 'Unknown units are refused'
);
SELECT throws_ok(
  $$SELECT ext_shift_in_game_date('00000000-0000-0000-0000-0000000e2001', NULL, 0, 'day')$$,
  'P0001', 'Move the date by 1 to 1000 at a time', 'A zero move is refused'
);
SELECT throws_ok(
  $$SELECT ext_set_in_game_date('00000000-0000-0000-0000-0000000e2001', NULL, 3000000)$$,
  'P0001', 'The in-game date must be between the years 1 and 9999', 'Dates past the year 9999 are refused'
);
SELECT throws_ok(
  $$SELECT ext_set_in_game_date('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e3003', 0)$$,
  'P0001', 'That room is not in this campaign', 'A room from another campaign is refused'
);
SELECT throws_ok(
  $$SELECT ext_set_in_game_date('00000000-0000-0000-0000-0000000e2003', NULL, 0)$$,
  'P0001', 'This campaign is archived', 'Archived campaigns keep their date'
);

-- ===== Sam: member of the private Flashback room ==================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1002","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_set_in_game_date('00000000-0000-0000-0000-0000000e2001', NULL, 0)$$,
  '42501', 'Only the GM can change the in-game date', 'Players cannot set the date'
);
SELECT throws_ok(
  $$SELECT ext_undo_in_game_date_change((SELECT id FROM ext_calendar_changes ORDER BY created_at DESC LIMIT 1))$$,
  '42501', 'Only the GM can change the in-game date', 'Players cannot undo a change'
);
SELECT is(
  (SELECT count(*)::int FROM ext_calendar_changes WHERE channel_id = '00000000-0000-0000-0000-0000000e2001'),
  6, 'Sam sees every change, including his private room'
);

-- ===== Jo: not in the private room ==============================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM ext_calendar_changes WHERE channel_id = '00000000-0000-0000-0000-0000000e2001'),
  4, 'Jo sees the campaign and the public room, not the private room'
);
SELECT is_empty(
  $$SELECT 1 FROM ext_calendar_changes WHERE sub_channel_id = '00000000-0000-0000-0000-0000000e3002'$$,
  'Jo cannot see the private room''s date'
);

-- ===== Outsider ==================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1004","role":"authenticated"}', true);

SELECT is_empty($$SELECT 1 FROM ext_calendar_changes$$, 'People outside the campaign see no dates');

-- ===== GM: undo ==================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1001","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_undo_in_game_date_change((SELECT id FROM ext_calendar_changes WHERE kind = 'set' AND sub_channel_id IS NULL))$$,
  'P0001', 'Only the most recent date change can be undone', 'Older changes cannot be undone'
);
SELECT lives_ok(
  $$SELECT ext_undo_in_game_date_change((SELECT id FROM ext_calendar_changes WHERE channel_id = '00000000-0000-0000-0000-0000000e2001' ORDER BY created_at DESC LIMIT 1))$$,
  'GM undoes the most recent change'
);
SELECT is(
  (SELECT day_number FROM ext_calendar_changes WHERE sub_channel_id = '00000000-0000-0000-0000-0000000e3002' ORDER BY created_at DESC LIMIT 1),
  (SELECT jan31 FROM d), 'After the undo the private room is back on 31 Jan'
);

SELECT * FROM finish();
ROLLBACK;
