-- Clue extras (Phase 2b step 4): status, found by / at / day, GM checklist.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(26);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000ad1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'clgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ad1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'clsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ad1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cljo@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000ad2001', 'Clues', '00000000-0000-0000-0000-000000ad1001', 'ad200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000ad2001', '00000000-0000-0000-0000-000000ad1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-000000ad2001', '00000000-0000-0000-0000-000000ad1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-000000ad2001', '00000000-0000-0000-0000-000000ad1003', 'Jo', now(), false);

-- The morgue is shown to everyone, the attic and the cult to nobody.
INSERT INTO ext_records (id, channel_id, kind, name, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ad3001', '00000000-0000-0000-0000-000000ad2001', 'location', 'Morgue', '00000000-0000-0000-0000-000000ad1001'),
  ('00000000-0000-0000-0000-000000ad3002', '00000000-0000-0000-0000-000000ad2001', 'location', 'Attic', '00000000-0000-0000-0000-000000ad1001'),
  ('00000000-0000-0000-0000-000000ad3003', '00000000-0000-0000-0000-000000ad2001', 'organisation', 'The Fellowship', '00000000-0000-0000-0000-000000ad1001');
SELECT set_config('ext.allow_record_visibility', 'on', true);
UPDATE ext_records SET visibility = 'players' WHERE id = '00000000-0000-0000-0000-000000ad3001';
SELECT set_config('ext.allow_record_visibility', '', true);

-- Reyes is a revealed PC, Okafor a hidden one, Hale an NPC.
INSERT INTO ext_characters (id, channel_id, kind, name, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ad4001', '00000000-0000-0000-0000-000000ad2001', 'pc', 'Reyes', true, '00000000-0000-0000-0000-000000ad1001'),
  ('00000000-0000-0000-0000-000000ad4002', '00000000-0000-0000-0000-000000ad2001', 'pc', 'Okafor', false, '00000000-0000-0000-0000-000000ad1001'),
  ('00000000-0000-0000-0000-000000ad4003', '00000000-0000-0000-0000-000000ad2001', 'npc', 'Dr Hale', true, '00000000-0000-0000-0000-000000ad1001');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM: status ==============================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1001","role":"authenticated"}', true);

INSERT INTO ext_records (id, channel_id, kind, name, created_by)
VALUES ('00000000-0000-0000-0000-000000ad3009', '00000000-0000-0000-0000-000000ad2001', 'clue', 'Bloody glove', '00000000-0000-0000-0000-000000ad1001');
SELECT ext_set_record_visibility('00000000-0000-0000-0000-000000ad3009', 'selected', ARRAY['00000000-0000-0000-0000-000000ad1002']::uuid[]);

SELECT is(
  (SELECT clue_status FROM ext_records WHERE id = '00000000-0000-0000-0000-000000ad3009'),
  'unexamined', 'New clues start unexamined'
);
SELECT is(
  (SELECT clue_status FROM ext_records WHERE id = '00000000-0000-0000-0000-000000ad3001'),
  NULL, 'Other kinds have no status'
);
SELECT lives_ok(
  $$UPDATE ext_records SET clue_status = 'investigated' WHERE id = '00000000-0000-0000-0000-000000ad3009'$$,
  'GM changes the status'
);
SELECT is(
  (SELECT details FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-000000ad3009' AND event_type = 'status_changed'),
  '{"from": "unexamined", "to": "investigated"}'::jsonb,
  'The status change is logged'
);
SELECT throws_ok(
  $$UPDATE ext_records SET clue_status = 'resolved' WHERE id = '00000000-0000-0000-0000-000000ad3001'$$,
  '23514', NULL,
  'Only clues have a status'
);
SELECT throws_ok(
  $$UPDATE ext_records SET clue_status = NULL WHERE id = '00000000-0000-0000-0000-000000ad3009'$$,
  '23514', NULL,
  'A clue always has a status'
);

-- ===== GM: found by / at / day ===================================================
SELECT throws_ok(
  $$UPDATE ext_records SET found_by_character_id = '00000000-0000-0000-0000-000000ad4003' WHERE id = '00000000-0000-0000-0000-000000ad3009'$$,
  'P0001', 'A clue can only be found by a PC of this campaign',
  'NPCs do not find clues'
);
SELECT throws_ok(
  $$UPDATE ext_records SET found_at_record_id = '00000000-0000-0000-0000-000000ad3003' WHERE id = '00000000-0000-0000-0000-000000ad3009'$$,
  'P0001', 'A clue can only be found at a location of this campaign',
  'Found at must be a location'
);
SELECT throws_ok(
  $$UPDATE ext_records SET found_day = 99999999 WHERE id = '00000000-0000-0000-0000-000000ad3009'$$,
  'P0001', 'The in-game date must be between the years 1 and 9999',
  'Found day must be a real date'
);
SELECT throws_ok(
  $$UPDATE ext_records SET found_day = 10000 WHERE id = '00000000-0000-0000-0000-000000ad3001'$$,
  '23514', NULL,
  'Only clues have found details'
);
SELECT lives_ok(
  $$UPDATE ext_records SET found_by_character_id = '00000000-0000-0000-0000-000000ad4001',
           found_at_record_id = '00000000-0000-0000-0000-000000ad3001', found_day = 10148
    WHERE id = '00000000-0000-0000-0000-000000ad3009'$$,
  'GM records who found it, where and when'
);
SELECT is(
  (SELECT details FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-000000ad3009' AND event_type = 'found_changed'),
  '{"by": "Reyes", "at": "Morgue", "day": 10148}'::jsonb,
  'The found details are logged with names'
);
SELECT results_eq(
  $$SELECT clue_status, found_by_name, found_at_name, found_day FROM ext_clue_details('00000000-0000-0000-0000-000000ad3009')$$,
  $$VALUES ('investigated'::text, 'Reyes'::text, 'Morgue'::text, 10148)$$,
  'GM reads the clue details'
);

-- ===== Sam: the clue is shown to them ===========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1002","role":"authenticated"}', true);

SELECT is(
  (SELECT clue_status FROM ext_records WHERE id = '00000000-0000-0000-0000-000000ad3009'),
  'investigated', 'Sam sees the status'
);
SELECT results_eq(
  $$SELECT found_by_name, found_at_name, found_day FROM ext_clue_details('00000000-0000-0000-0000-000000ad3009')$$,
  $$VALUES ('Reyes'::text, 'Morgue'::text, 10148)$$,
  'Sam sees who found it and where, when both are visible'
);
WITH u AS (UPDATE ext_records SET clue_status = 'resolved' WHERE id = '00000000-0000-0000-0000-000000ad3009' RETURNING 1)
SELECT is(count(*)::int, 0, 'Players cannot change the status') FROM u;

-- The GM moves it to the hidden attic, found by the hidden Okafor.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1001","role":"authenticated"}', true);
UPDATE ext_records SET found_by_character_id = '00000000-0000-0000-0000-000000ad4002',
       found_at_record_id = '00000000-0000-0000-0000-000000ad3002'
WHERE id = '00000000-0000-0000-0000-000000ad3009';

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1002","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT found_by_character_id, found_by_name, found_at_record_id, found_at_name FROM ext_clue_details('00000000-0000-0000-0000-000000ad3009')$$,
  $$VALUES (NULL::uuid, NULL::text, NULL::uuid, NULL::text)$$,
  'Hidden PCs and locations are not named to players'
);

-- ===== Jo: not shown the clue =====================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1003","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM ext_clue_details('00000000-0000-0000-0000-000000ad3009')),
  0, 'Nothing about a clue Jo cannot see'
);

-- ===== The GM checklist ==========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO ext_clue_points (id, record_id, channel_id, body, sort_order)
    VALUES ('00000000-0000-0000-0000-000000ad5001', '00000000-0000-0000-0000-000000ad3009', '00000000-0000-0000-0000-000000ad2001', 'Glove belongs to Dr Hale', 0)$$,
  'GM adds a checklist point'
);
SELECT throws_ok(
  $$INSERT INTO ext_clue_points (record_id, channel_id, body)
    VALUES ('00000000-0000-0000-0000-000000ad3001', '00000000-0000-0000-0000-000000ad2001', 'Not a clue')$$,
  'P0001', 'Checklist points belong to clues',
  'Only clues have a checklist'
);
SELECT throws_ok(
  $$INSERT INTO ext_clue_points (record_id, channel_id, body)
    VALUES ('00000000-0000-0000-0000-000000ad3009', '00000000-0000-0000-0000-000000ad2001', '')$$,
  '23514', NULL,
  'Points need text'
);
SELECT lives_ok(
  $$UPDATE ext_clue_points SET worked_out = true WHERE id = '00000000-0000-0000-0000-000000ad5001'$$,
  'GM ticks a point as worked out'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM ext_clue_points), 0, 'Players cannot read the checklist');
SELECT throws_ok(
  $$INSERT INTO ext_clue_points (record_id, channel_id, body)
    VALUES ('00000000-0000-0000-0000-000000ad3009', '00000000-0000-0000-0000-000000ad2001', 'My theory')$$,
  '42501', NULL,
  'Players cannot add checklist points'
);

-- ===== Deleting a location; archived campaigns ===================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1001","role":"authenticated"}', true);
DELETE FROM ext_records WHERE id = '00000000-0000-0000-0000-000000ad3002';
SELECT is(
  (SELECT found_at_record_id FROM ext_records WHERE id = '00000000-0000-0000-0000-000000ad3009'),
  NULL, 'Deleting the location clears where the clue was found'
);

RESET ROLE;
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-000000ad2001';
SET LOCAL ROLE authenticated;
WITH d AS (DELETE FROM ext_clue_points WHERE id = '00000000-0000-0000-0000-000000ad5001' RETURNING 1)
SELECT is(count(*)::int, 0, 'Archived campaigns are read-only') FROM d;

SELECT * FROM finish();
ROLLBACK;
