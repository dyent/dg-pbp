-- Campaign records: GM-only management, default fields per kind, per-record
-- sharing (GM only / all players / chosen players), GM-only fields, tags and
-- history.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(32);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recjo@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code, is_archived)
VALUES
  ('00000000-0000-0000-0000-0000000e2001', 'Records', '00000000-0000-0000-0000-0000000e1001', '0e200001', false),
  ('00000000-0000-0000-0000-0000000e2003', 'Archived', '00000000-0000-0000-0000-0000000e1001', '0e200003', true);

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1003', 'Jo', now(), false),
  ('00000000-0000-0000-0000-0000000e2003', '00000000-0000-0000-0000-0000000e1001', 'GM', now(), false);

-- An archived campaign's record (inserted by the owner, as if made earlier).
INSERT INTO ext_records (id, channel_id, kind, name, created_by)
VALUES ('00000000-0000-0000-0000-0000000e3009', '00000000-0000-0000-0000-0000000e2003', 'location', 'Old place',
        '00000000-0000-0000-0000-0000000e1001');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM ========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO ext_records (id, channel_id, kind, name, created_by) VALUES
      ('00000000-0000-0000-0000-0000000e3001', '00000000-0000-0000-0000-0000000e2001', 'location', 'County morgue', '00000000-0000-0000-0000-0000000e1001'),
      ('00000000-0000-0000-0000-0000000e3002', '00000000-0000-0000-0000-0000000e2001', 'clue', 'Bloody glove', '00000000-0000-0000-0000-0000000e1001'),
      ('00000000-0000-0000-0000-0000000e3003', '00000000-0000-0000-0000-0000000e2001', 'organisation', 'The Fellowship', '00000000-0000-0000-0000-0000000e1001'),
      ('00000000-0000-0000-0000-0000000e3004', '00000000-0000-0000-0000-0000000e2001', 'operation', 'Operation LAMPLIGHT', '00000000-0000-0000-0000-0000000e1001')$$,
  'GM creates one record of each kind'
);
SELECT lives_ok(
  $$WITH x AS (INSERT INTO ext_records (channel_id, kind, name, created_by)
      VALUES ('00000000-0000-0000-0000-0000000e2001', 'clue', 'Matchbook', '00000000-0000-0000-0000-0000000e1001') RETURNING id)
    SELECT id FROM x$$,
  'GM creates a record and gets it straight back (as the app does)'
);
SELECT results_eq(
  $$SELECT label || ':' || visibility FROM ext_record_fields WHERE record_id = '00000000-0000-0000-0000-0000000e3001' ORDER BY visibility DESC, sort_order$$,
  $$VALUES ('Description:players'), ('Address / where:players'), ('Who''s there:gm'), ('GM notes:gm')$$,
  'A location starts with its standard fields'
);
SELECT is(
  (SELECT count(*)::int FROM ext_record_fields WHERE record_id = '00000000-0000-0000-0000-0000000e3004' AND visibility = 'players'),
  3, 'An operation starts with briefing, summary and outcome for everyone'
);
SELECT is(
  (SELECT visibility FROM ext_records WHERE id = '00000000-0000-0000-0000-0000000e3001'),
  'gm', 'New records are GM only'
);
SELECT is(
  (SELECT provenance FROM ext_records WHERE id = '00000000-0000-0000-0000-0000000e3001'),
  'canon', 'Records written by the GM are canon'
);
SELECT throws_ok(
  $$INSERT INTO ext_records (channel_id, kind, name, created_by, visibility)
    VALUES ('00000000-0000-0000-0000-0000000e2001', 'clue', 'Leak', '00000000-0000-0000-0000-0000000e1001', 'players')$$,
  'P0001', 'New records start as GM only; share them afterwards',
  'A record cannot be created already shared'
);
SELECT throws_ok(
  $$UPDATE ext_records SET visibility = 'players' WHERE id = '00000000-0000-0000-0000-0000000e3001'$$,
  'P0001', 'Use the sharing settings to change who can see a record',
  'Visibility changes only through the sharing function'
);
SELECT throws_ok(
  $$UPDATE ext_records SET kind = 'clue' WHERE id = '00000000-0000-0000-0000-0000000e3001'$$,
  'P0001', 'A record cannot change campaign, kind, creator or creation time',
  'A record keeps its kind'
);
SELECT throws_ok(
  $$UPDATE ext_records SET picture_url = 'javascript:alert(1)' WHERE id = '00000000-0000-0000-0000-0000000e3001'$$,
  'P0001', 'URLs must start with http:// or https://',
  'Picture links must be safe'
);
SELECT throws_ok(
  $$UPDATE ext_record_fields SET visibility = 'players'
    WHERE record_id = '00000000-0000-0000-0000-0000000e3001' AND field_key = 'gm_notes'$$,
  '23514', NULL,
  'GM notes stay GM only'
);

-- Edits, sharing and history.
UPDATE ext_record_fields SET body = 'Cold, tiled, smells of bleach.'
  WHERE record_id = '00000000-0000-0000-0000-0000000e3001' AND field_key = 'description';
UPDATE ext_record_fields SET body = 'Night attendant Pete.'
  WHERE record_id = '00000000-0000-0000-0000-0000000e3001' AND field_key = 'occupants';
UPDATE ext_records SET name = 'Hollow Creek morgue' WHERE id = '00000000-0000-0000-0000-0000000e3001';

SELECT lives_ok(
  $$SELECT ext_set_record_visibility('00000000-0000-0000-0000-0000000e3001', 'players', NULL)$$,
  'GM shows the morgue to every player'
);
SELECT lives_ok(
  $$SELECT ext_set_record_visibility('00000000-0000-0000-0000-0000000e3002', 'selected',
      ARRAY['00000000-0000-0000-0000-0000000e1002'::uuid])$$,
  'GM shows the glove to Sam only'
);
SELECT throws_ok(
  $$SELECT ext_set_record_visibility('00000000-0000-0000-0000-0000000e3003', 'selected', '{}')$$,
  'P0001', 'Choose at least one player to share the record with',
  'Sharing with chosen players needs at least one player'
);
SELECT throws_ok(
  $$SELECT ext_set_record_visibility('00000000-0000-0000-0000-0000000e3003', 'selected',
      ARRAY['00000000-0000-0000-0000-0000000e1004'::uuid])$$,
  'P0001', 'Records can only be shared with players in this campaign',
  'Records cannot be shared with outsiders'
);
SELECT throws_ok(
  $$SELECT ext_set_record_visibility('00000000-0000-0000-0000-0000000e3009', 'players', NULL)$$,
  'P0001', 'This campaign is archived',
  'Records of archived campaigns cannot be shared'
);
SELECT results_eq(
  $$SELECT event_type FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-0000000e3001' ORDER BY created_at$$,
  $$VALUES ('created'), ('field_edited'), ('field_edited'), ('renamed'), ('visibility_changed')$$,
  'Creation, edits, the rename and sharing are logged'
);

-- Tags (the campaign tag list).
INSERT INTO ext_tags (id, channel_id, name) VALUES ('00000000-0000-0000-0000-0000000e4001', '00000000-0000-0000-0000-0000000e2001', 'Hollow Creek');
SELECT lives_ok(
  $$INSERT INTO ext_record_tags (record_id, tag_id) VALUES ('00000000-0000-0000-0000-0000000e3001', '00000000-0000-0000-0000-0000000e4001')$$,
  'GM tags a record'
);

-- ===== Sam: sees shown records =====================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1002","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT name FROM ext_records WHERE channel_id = '00000000-0000-0000-0000-0000000e2001' ORDER BY name$$,
  $$VALUES ('Bloody glove'), ('Hollow Creek morgue')$$,
  'Sam sees the record shown to all and the one shown to him'
);
SELECT results_eq(
  $$SELECT label FROM ext_record_fields WHERE record_id = '00000000-0000-0000-0000-0000000e3001' ORDER BY sort_order$$,
  $$VALUES ('Description'), ('Address / where')$$,
  'Sam reads only the shown fields'
);
SELECT is_empty(
  $$SELECT 1 FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-0000000e3001'$$,
  'Players cannot read record history'
);
SELECT is_empty(
  $$SELECT 1 FROM ext_record_shares$$,
  'Players cannot see who a record is shared with'
);
SELECT is_empty(
  $$SELECT 1 FROM ext_record_tags$$,
  'Players cannot see record tags'
);
SELECT throws_ok(
  $$INSERT INTO ext_records (channel_id, kind, name, created_by)
    VALUES ('00000000-0000-0000-0000-0000000e2001', 'clue', 'Mine', '00000000-0000-0000-0000-0000000e1002')$$,
  '42501', NULL,
  'Players cannot create records'
);
UPDATE ext_records SET name = 'Hacked' WHERE id = '00000000-0000-0000-0000-0000000e3001';
UPDATE ext_record_fields SET body = 'Hacked' WHERE record_id = '00000000-0000-0000-0000-0000000e3001';
DELETE FROM ext_records WHERE id = '00000000-0000-0000-0000-0000000e3001';
SELECT throws_ok(
  $$SELECT ext_set_record_visibility('00000000-0000-0000-0000-0000000e3003', 'players', NULL)$$,
  '42501', 'Only the GM can share records',
  'Players cannot share records'
);

-- ===== Jo: not chosen ==============================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1003","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT name FROM ext_records WHERE channel_id = '00000000-0000-0000-0000-0000000e2001'$$,
  $$VALUES ('Hollow Creek morgue')$$,
  'Jo sees only the record shown to everyone'
);
SELECT is_empty(
  $$SELECT 1 FROM ext_record_fields WHERE record_id = '00000000-0000-0000-0000-0000000e3002'$$,
  'Jo cannot read the fields of a clue she was not shown'
);

-- ===== Outsider ====================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1004","role":"authenticated"}', true);

SELECT is_empty(
  $$SELECT 1 FROM ext_records WHERE channel_id = '00000000-0000-0000-0000-0000000e2001'$$,
  'Someone outside the campaign sees no records'
);

-- ===== GM again: player writes had no effect; un-sharing works =====================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1001","role":"authenticated"}', true);

SELECT is(
  (SELECT name FROM ext_records WHERE id = '00000000-0000-0000-0000-0000000e3001'),
  'Hollow Creek morgue', 'A player could not rename or delete the record'
);
SELECT is(
  (SELECT body FROM ext_record_fields WHERE record_id = '00000000-0000-0000-0000-0000000e3001' AND field_key = 'description'),
  'Cold, tiled, smells of bleach.', 'A player could not change a field'
);
SELECT ext_set_record_visibility('00000000-0000-0000-0000-0000000e3002', 'gm', NULL);
SELECT is(
  (SELECT count(*)::int FROM ext_record_shares WHERE record_id = '00000000-0000-0000-0000-0000000e3002'),
  0, 'Making a record GM only removes its chosen players'
);
SELECT lives_ok(
  $$DELETE FROM ext_records WHERE id = '00000000-0000-0000-0000-0000000e3003'$$,
  'GM deletes a record'
);

SELECT * FROM finish();
ROLLBACK;
