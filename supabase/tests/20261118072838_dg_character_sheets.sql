-- Phase 2a step 4c: Delta Green character sheets and NPC stat blocks.
-- Access (PC sheet = Owner level, NPC stat block = GM only), validation,
-- derived attributes, change log, archived campaigns.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(37);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000f1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sheetgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000f1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sheetsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000f1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sheetjo@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000f1004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sheetout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-0000000f2001', 'Sheets', '00000000-0000-0000-0000-0000000f1001', '0f200001'),
  ('00000000-0000-0000-0000-0000000f2002', 'Sheets Archived', '00000000-0000-0000-0000-0000000f1001', '0f200002');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f1003', 'Jo', now(), false),
  ('00000000-0000-0000-0000-0000000f2002', '00000000-0000-0000-0000-0000000f1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000f2002', '00000000-0000-0000-0000-0000000f1002', 'Sam', now(), false);

-- Owners are assigned directly here (the role guard allows it with the flag).
SELECT set_config('ext.allow_role_change', 'on', true);
INSERT INTO ext_characters (id, channel_id, kind, name, revealed, created_by, owner_id, in_play)
VALUES
  ('00000000-0000-0000-0000-0000000f3001', '00000000-0000-0000-0000-0000000f2001', 'pc', 'Reyes', true, '00000000-0000-0000-0000-0000000f1001', '00000000-0000-0000-0000-0000000f1002', true),
  ('00000000-0000-0000-0000-0000000f3003', '00000000-0000-0000-0000-0000000f2001', 'npc', 'Dr Hale', true, '00000000-0000-0000-0000-0000000f1001', NULL, true),
  ('00000000-0000-0000-0000-0000000f3004', '00000000-0000-0000-0000-0000000f2002', 'pc', 'Archived PC', true, '00000000-0000-0000-0000-0000000f1001', '00000000-0000-0000-0000-0000000f1002', true);
SELECT set_config('ext.allow_role_change', 'off', true);

INSERT INTO dg_character_sheets (character_id, data)
VALUES ('00000000-0000-0000-0000-0000000f3004', '{"notes":"old"}');

UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-0000000f2002';

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== Rules maths =============================================================
SELECT results_eq(
  $$SELECT * FROM dg_derived_attributes(10, 11, 12, 3)$$,
  $$VALUES (11, 12, 60, 96, 48)$$,
  'HP = (STR+CON)/2 rounded up, WP = POW, SAN = POW x5, max SAN = 99 - Unnatural, BP = POW x4'
);

SELECT results_eq(
  $$SELECT * FROM dg_derived_attributes(NULL, 11, NULL, NULL)$$,
  $$VALUES (NULL::int, NULL::int, NULL::int, 99, NULL::int)$$,
  'missing statistics give no derived values; max SAN defaults to 99'
);

SELECT is(dg_breaking_point(52, 13), 39, 'a new Breaking Point is current SAN - POW');
SELECT is(dg_breaking_point(5, 13), 0, 'a Breaking Point never goes below 0');

-- ===== GM =====================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO dg_character_sheets (character_id, data) VALUES ('00000000-0000-0000-0000-0000000f3001',
    '{"stats":{"str":{"score":10},"con":{"score":11},"pow":{"score":12}},"skills":{"unnatural":{"key":"unnatural","value":3},"firearms":{"key":"firearms","value":40}},"san":{"current":60}}')$$,
  'the GM creates a sheet for a PC'
);

SELECT is(
  (SELECT channel_id FROM dg_character_sheets WHERE character_id = '00000000-0000-0000-0000-0000000f3001'),
  '00000000-0000-0000-0000-0000000f2001'::uuid,
  'the campaign is filled in from the character'
);

SELECT results_eq(
  $$SELECT hp_max_calc, wp_max_calc, san_start_calc, san_max_calc, breaking_point_start_calc
    FROM dg_get_sheet('00000000-0000-0000-0000-0000000f3001')$$,
  $$VALUES (11, 12, 60, 96, 48)$$,
  'the read function calculates the derived attributes from the sheet'
);

SELECT is(
  (SELECT details ->> 'action' FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000f3001' AND event_type = 'sheet_edited'),
  'created',
  'creating a sheet is logged'
);

SELECT lives_ok(
  $$INSERT INTO dg_character_sheets (character_id, data) VALUES ('00000000-0000-0000-0000-0000000f3003', '{"stats":{"str":{"score":14}},"attacks":"Pistol 40%"}')$$,
  'the GM adds a stat block to an NPC'
);

SELECT throws_ok(
  $$UPDATE dg_character_sheets SET data = '{"stats":{"pow":{"score":1000}}}' WHERE character_id = '00000000-0000-0000-0000-0000000f3003'$$,
  'P0001', 'Numbers on the sheet must be between 0 and 999 (stats.pow.score)',
  'numbers above 999 are refused'
);

SELECT throws_ok(
  $$UPDATE dg_character_sheets SET data = '{"hp":{"current":-1}}' WHERE character_id = '00000000-0000-0000-0000-0000000f3003'$$,
  'P0001', 'Numbers on the sheet must be between 0 and 999 (hp.current)',
  'negative numbers are refused'
);

SELECT throws_ok(
  format($$UPDATE dg_character_sheets SET data = jsonb_build_object('notes', %L) WHERE character_id = '00000000-0000-0000-0000-0000000f3003'$$, repeat('x', 4001)),
  'P0001', 'Text on the sheet is too long (notes; 4000 characters maximum)',
  'over-long text is refused'
);

SELECT throws_ok(
  $$INSERT INTO dg_character_sheets (character_id, data) VALUES ('00000000-0000-0000-0000-0000000f3999', '{}')$$,
  'P0001', 'Unknown character',
  'a sheet for an unknown character is refused'
);

SELECT throws_ok(
  $$UPDATE dg_character_sheets SET character_id = '00000000-0000-0000-0000-0000000f3001' WHERE character_id = '00000000-0000-0000-0000-0000000f3003'$$,
  NULL, NULL,
  'a sheet cannot move to another character'
);

-- ===== Owner (Sam) =============================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1002","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM dg_get_sheet('00000000-0000-0000-0000-0000000f3001')),
  1, 'the owner reads their PC''s sheet'
);

SELECT is(
  (SELECT count(*)::int FROM dg_character_sheets WHERE character_id = '00000000-0000-0000-0000-0000000f3003'),
  0, 'a player cannot read an NPC''s stat block'
);

SELECT lives_ok(
  $$UPDATE dg_character_sheets
    SET data = jsonb_set(jsonb_set(data, '{stats,pow,score}', '11'), '{bonds}', '[{"name":"Maya","score":12}]')
    WHERE character_id = '00000000-0000-0000-0000-0000000f3001'$$,
  'the owner edits their in-play PC''s sheet'
);

SELECT is(
  (SELECT updated_by FROM dg_character_sheets WHERE character_id = '00000000-0000-0000-0000-0000000f3001'),
  '00000000-0000-0000-0000-0000000f1002'::uuid,
  'the sheet records who saved it'
);

SELECT is(
  (SELECT count(*)::int FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000f3001' AND event_type = 'sheet_edited'),
  0, 'the owner cannot read the GM-only change log'
);

SELECT throws_ok(
  $$INSERT INTO dg_character_sheets (character_id, data) VALUES ('00000000-0000-0000-0000-0000000f3003', '{}')$$,
  '42501', NULL,
  'a player cannot create an NPC stat block'
);

SELECT results_eq(
  $$WITH u AS (UPDATE dg_character_sheets SET data = '{}' WHERE character_id = '00000000-0000-0000-0000-0000000f3003' RETURNING 1) SELECT count(*)::int FROM u$$,
  $$VALUES (0)$$,
  'a player cannot change an NPC stat block'
);

SELECT results_eq(
  $$WITH d AS (DELETE FROM dg_character_sheets WHERE character_id = '00000000-0000-0000-0000-0000000f3001' RETURNING 1) SELECT count(*)::int FROM d$$,
  $$VALUES (0)$$,
  'only the GM can remove a sheet'
);

-- ===== Other player (Jo) and outsider ==========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM dg_get_sheet('00000000-0000-0000-0000-0000000f3001')),
  0, 'another player cannot read an in-play PC''s sheet'
);

SELECT results_eq(
  $$WITH u AS (UPDATE dg_character_sheets SET data = '{}' WHERE character_id = '00000000-0000-0000-0000-0000000f3001' RETURNING 1) SELECT count(*)::int FROM u$$,
  $$VALUES (0)$$,
  'another player cannot change someone else''s sheet'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1004","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM dg_get_sheet('00000000-0000-0000-0000-0000000f3001')),
  0, 'an outsider sees no sheets'
);

-- ===== GM: change log, role changes ============================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1001","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT c ->> 'path', c ->> 'from', c ->> 'to'
    FROM ext_character_events e, jsonb_array_elements(e.details -> 'changes') c
    WHERE e.character_id = '00000000-0000-0000-0000-0000000f3001' AND e.details ->> 'action' = 'edited'
    ORDER BY 1$$,
  $$VALUES ('bonds.0.name'::text, NULL::text, 'Maya'::text), ('bonds.0.score', NULL, '12'), ('stats.pow.score', '12', '11')$$,
  'the GM sees exactly what the owner changed'
);

SELECT is(
  (SELECT visibility FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000f3001' AND details ->> 'action' = 'edited'),
  'gm', 'sheet changes are GM-only history'
);

SELECT lives_ok(
  $$UPDATE dg_character_sheets SET data = data WHERE character_id = '00000000-0000-0000-0000-0000000f3001'$$,
  'saving an unchanged sheet works'
);

SELECT is(
  (SELECT count(*)::int FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000f3001' AND event_type = 'sheet_edited'),
  2, 'an unchanged save adds no history entry'
);

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000f3001', 'pc', false, '00000000-0000-0000-0000-0000000f1002')$$,
  'the GM takes Reyes out of play'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM dg_get_sheet('00000000-0000-0000-0000-0000000f3001')),
  1, 'all players can read an out-of-play PC''s sheet'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1002","role":"authenticated"}', true);

SELECT results_eq(
  $$WITH u AS (UPDATE dg_character_sheets SET data = '{}' WHERE character_id = '00000000-0000-0000-0000-0000000f3001' RETURNING 1) SELECT count(*)::int FROM u$$,
  $$VALUES (0)$$,
  'the former owner can no longer edit the sheet once out of play'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000f3001', 'npc', true, NULL)$$,
  'the GM turns Reyes into an NPC'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM dg_get_sheet('00000000-0000-0000-0000-0000000f3001')),
  0, 'once an NPC, the sheet is GM-only'
);

-- ===== GM: archived campaign, removal ==========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1001","role":"authenticated"}', true);

SELECT results_eq(
  $$WITH u AS (UPDATE dg_character_sheets SET data = '{}' WHERE character_id = '00000000-0000-0000-0000-0000000f3004' RETURNING 1) SELECT count(*)::int FROM u$$,
  $$VALUES (0)$$,
  'sheets in an archived campaign are read-only, even for the GM'
);

SELECT lives_ok(
  $$DELETE FROM dg_character_sheets WHERE character_id = '00000000-0000-0000-0000-0000000f3003'$$,
  'the GM removes an NPC stat block'
);

SELECT is(
  (SELECT count(*)::int FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000f3003' AND details ->> 'action' = 'removed'),
  1, 'removing a stat block is logged'
);

SELECT * FROM finish();
ROLLBACK;
