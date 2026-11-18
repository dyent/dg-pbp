-- Reserve characters: the limit of 3 counts active PCs only, players set the
-- temporary statuses of their own PCs, posting follows status changes.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(16);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000b1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ressam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000b1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resjo@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-0000000b2001', 'Reserve', '00000000-0000-0000-0000-0000000b1001', '0b200001'),
  ('00000000-0000-0000-0000-0000000b2002', 'Reserve Archived', '00000000-0000-0000-0000-0000000b1001', '0b200002');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1003', 'Jo', now(), false),
  ('00000000-0000-0000-0000-0000000b2002', '00000000-0000-0000-0000-0000000b1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000b2002', '00000000-0000-0000-0000-0000000b1002', 'Sam', now(), false);

INSERT INTO ext_characters (id, channel_id, kind, name, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000b3001', '00000000-0000-0000-0000-0000000b2001', 'pc', 'Alpha', true, '00000000-0000-0000-0000-0000000b1001'),
  ('00000000-0000-0000-0000-0000000b3002', '00000000-0000-0000-0000-0000000b2001', 'pc', 'Bravo', true, '00000000-0000-0000-0000-0000000b1001'),
  ('00000000-0000-0000-0000-0000000b3003', '00000000-0000-0000-0000-0000000b2001', 'pc', 'Charlie', true, '00000000-0000-0000-0000-0000000b1001'),
  ('00000000-0000-0000-0000-0000000b3004', '00000000-0000-0000-0000-0000000b2001', 'pc', 'Delta', true, '00000000-0000-0000-0000-0000000b1001'),
  ('00000000-0000-0000-0000-0000000b3009', '00000000-0000-0000-0000-0000000b2002', 'pc', 'Archived', true, '00000000-0000-0000-0000-0000000b1001');

SELECT set_config('ext.allow_role_change', 'on', true);
UPDATE ext_characters SET owner_id = '00000000-0000-0000-0000-0000000b1002'
WHERE id = '00000000-0000-0000-0000-0000000b3009';
SELECT set_config('ext.allow_role_change', 'off', true);
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-0000000b2002';

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM =====================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1001","role":"authenticated"}', true);

SELECT ext_set_role('00000000-0000-0000-0000-0000000b3001', 'pc', true, '00000000-0000-0000-0000-0000000b1002');
SELECT ext_set_role('00000000-0000-0000-0000-0000000b3002', 'pc', true, '00000000-0000-0000-0000-0000000b1002');
SELECT ext_set_role('00000000-0000-0000-0000-0000000b3003', 'pc', true, '00000000-0000-0000-0000-0000000b1002');

SELECT throws_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000b3004', 'pc', true, '00000000-0000-0000-0000-0000000b1002')$$,
  'P0001', 'A player can have at most 3 active characters at once; move one to Reserve first',
  'a fourth active PC is refused'
);

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000b3004', 'pc', true, '00000000-0000-0000-0000-0000000b1002', NULL, 'backup')$$,
  'a fourth PC can join as a backup (Reserve), which does not count'
);

SELECT is(
  (SELECT status FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000b3004'),
  'backup',
  'the role change set the status in the same step'
);

SELECT is(
  (SELECT character_id FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000b1002' AND ended_at IS NULL),
  '00000000-0000-0000-0000-0000000b3001'::uuid,
  'Sam posts as Alpha, the first PC assigned'
);

-- ===== Player =================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1002","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3001', 'incapacitated')$$,
  'Sam marks their own PC Incapacitated'
);

SELECT isnt(
  (SELECT character_id FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000b1002' AND ended_at IS NULL),
  '00000000-0000-0000-0000-0000000b3001'::uuid,
  'Sam stops posting as Alpha and switches to another active PC'
);

SELECT is(
  (SELECT actor_id FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000b3001' AND event_type = 'status_changed'),
  '00000000-0000-0000-0000-0000000b1002'::uuid,
  'the status change is logged with Sam as the one who made it'
);

SELECT lives_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3004', 'active')$$,
  'Sam brings the backup into play now that a place is free'
);

SELECT throws_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3001', 'active')$$,
  'P0001', 'A player can have at most 3 active characters at once; move one to Reserve first',
  'a player cannot go over 3 active PCs either'
);

SELECT throws_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3001', 'deceased')$$,
  '42501', 'Only the GM can set or change this status',
  'a player cannot set a permanent status'
);

UPDATE ext_characters SET status = 'backup' WHERE id = '00000000-0000-0000-0000-0000000b3002';
RESET ROLE;
SELECT is(
  (SELECT status FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000b3002'),
  'active',
  'a direct update by a player changes nothing (only the function is allowed)'
);
SET LOCAL ROLE authenticated;

-- ===== GM sets a permanent status ===============================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$UPDATE ext_characters SET status = 'missing' WHERE id = '00000000-0000-0000-0000-0000000b3003'$$,
  'the GM marks Charlie Missing'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1002","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3003', 'active')$$,
  '42501', 'Only the GM can set or change this status',
  'a player cannot undo a status the GM set'
);

SELECT throws_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3009', 'backup')$$,
  'P0001', 'This campaign is archived',
  'archived campaigns are read-only'
);

-- ===== Another player ===========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1003","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3002', 'backup')$$,
  '42501', 'You can only change the status of a character you play',
  'another player cannot change Sam''s PC'
);

RESET ROLE;
SELECT ok(
  has_function_privilege('authenticated', 'public.ext_set_my_status(uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.ext_set_my_status(uuid, text)', 'EXECUTE'),
  'signed-in users can call ext_set_my_status, anonymous visitors cannot'
);

SELECT * FROM finish();
ROLLBACK;
