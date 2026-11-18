-- Quick changes to current HP, WP and SAN (dg_set_pool): same access rules,
-- validation and change log as a full sheet save.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'poolgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000c1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'poolsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000c1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pooljo@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-0000000c2001', 'Pools', '00000000-0000-0000-0000-0000000c1001', '0c200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c1003', 'Jo', now(), false);

SELECT set_config('ext.allow_role_change', 'on', true);
INSERT INTO ext_characters (id, channel_id, kind, name, revealed, created_by, owner_id, in_play)
VALUES
  ('00000000-0000-0000-0000-0000000c3001', '00000000-0000-0000-0000-0000000c2001', 'pc', 'Reyes', true, '00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-0000000c1002', true),
  ('00000000-0000-0000-0000-0000000c3002', '00000000-0000-0000-0000-0000000c2001', 'npc', 'Dr Hale', true, '00000000-0000-0000-0000-0000000c1001', NULL, true);
SELECT set_config('ext.allow_role_change', 'off', true);

INSERT INTO dg_character_sheets (character_id, data)
VALUES
  ('00000000-0000-0000-0000-0000000c3001', '{"format":"agent","hp":{"current":10,"maxOverride":12}}'),
  ('00000000-0000-0000-0000-0000000c3002', '{"format":"npc","hp":{"current":8}}');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== The PC's player ===========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1002","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT dg_set_pool('00000000-0000-0000-0000-0000000c3001', 'hp', 7)$$,
  'Sam lowers Reyes''s current HP'
);

SELECT is(
  (SELECT data -> 'hp' FROM dg_character_sheets WHERE character_id = '00000000-0000-0000-0000-0000000c3001'),
  '{"current":7,"maxOverride":12}'::jsonb,
  'only the current value changes; the maximum override is kept'
);

SELECT lives_ok(
  $$SELECT dg_set_pool('00000000-0000-0000-0000-0000000c3001', 'san', 55)$$,
  'SAN can be set even when the sheet had no SAN entry yet'
);

SELECT throws_like(
  $$SELECT dg_set_pool('00000000-0000-0000-0000-0000000c3001', 'hp', 1000)$$,
  '%between 0 and 999%',
  'the usual sheet validation applies'
);

SELECT throws_ok(
  $$SELECT dg_set_pool('00000000-0000-0000-0000-0000000c3001', 'str', 5)$$,
  'P0001', 'Only HP, WP and SAN can be changed this way',
  'only the three pools can be changed this way'
);

SELECT throws_ok(
  $$SELECT dg_set_pool('00000000-0000-0000-0000-0000000c3002', 'hp', 1)$$,
  '42501', 'You can''t change this sheet',
  'a player cannot change an NPC stat block'
);

-- ===== Another player ===========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1003","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT dg_set_pool('00000000-0000-0000-0000-0000000c3001', 'hp', 1)$$,
  '42501', 'You can''t change this sheet',
  'another player cannot change Sam''s sheet'
);

-- ===== GM ======================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT dg_set_pool('00000000-0000-0000-0000-0000000c3002', 'hp', 3)$$,
  'the GM changes an NPC''s HP'
);

SELECT is(
  (SELECT details -> 'changes' FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000c3001' AND event_type = 'sheet_edited'
     AND details -> 'changes' @> '[{"path":"hp.current"}]'),
  '[{"path":"hp.current","from":"10","to":"7"}]'::jsonb,
  'the GM''s change log records the quick change'
);

SELECT * FROM finish();
ROLLBACK;
