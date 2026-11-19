-- Reserve characters and player-set statuses. Rewritten for
-- 20261119103000_ext_one_active_character: one active PC per player, at most
-- 3 in Reserve (Backup, Temporarily unavailable, Incapacitated, Missing),
-- posting follows the active PC (or the player when none is active).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(20);

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

-- Sam's open posting period in the Reserve campaign (NULL = posting as Sam).
CREATE FUNCTION pg_temp.sam_posting_as() RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT c.name FROM ext_posting_periods p JOIN ext_characters c ON c.id = p.character_id
  WHERE p.channel_id = '00000000-0000-0000-0000-0000000b2001'
    AND p.user_id = '00000000-0000-0000-0000-0000000b1002' AND p.ended_at IS NULL
$$;
CREATE FUNCTION pg_temp.sam_statuses() RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT string_agg(name || ':' || status, ',' ORDER BY name) FROM ext_characters
  WHERE channel_id = '00000000-0000-0000-0000-0000000b2001'
    AND owner_id = '00000000-0000-0000-0000-0000000b1002'
$$;
GRANT EXECUTE ON FUNCTION pg_temp.sam_posting_as(), pg_temp.sam_statuses() TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM =====================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1001","role":"authenticated"}', true);

SELECT ext_set_role('00000000-0000-0000-0000-0000000b3001', 'pc', true, '00000000-0000-0000-0000-0000000b1002');
SELECT ext_set_role('00000000-0000-0000-0000-0000000b3002', 'pc', true, '00000000-0000-0000-0000-0000000b1002');
SELECT ext_set_role('00000000-0000-0000-0000-0000000b3003', 'pc', true, '00000000-0000-0000-0000-0000000b1002');

SELECT is(
  pg_temp.sam_statuses(),
  'Alpha:backup,Bravo:backup,Charlie:active',
  'one active PC: each newly assigned active PC moves the previous one to Backup'
);

SELECT is(pg_temp.sam_posting_as(), 'Charlie', 'Sam posts as the active PC');

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000b3004', 'pc', true, '00000000-0000-0000-0000-0000000b1002', NULL, 'backup')$$,
  'a third Reserve PC is allowed'
);

SELECT is(
  (SELECT status FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000b3004'),
  'backup',
  'the role change set the status in the same step'
);

SELECT throws_ok(
  $$UPDATE ext_characters SET status = 'unavailable' WHERE id = '00000000-0000-0000-0000-0000000b3003'$$,
  'P0001', 'A player can have at most 3 reserve characters; retire one first',
  'a fourth Reserve PC is refused'
);

SELECT ok(
  ext_is_reserve_status('missing') AND ext_is_reserve_status('incapacitated')
  AND NOT ext_is_reserve_status('insane') AND NOT ext_is_reserve_status('deceased')
  AND NOT ext_is_reserve_status('retired') AND NOT ext_is_reserve_status('active'),
  'Missing and Incapacitated are Reserve; Insane, Deceased and Retired count toward nothing'
);

UPDATE ext_characters SET status = 'deceased' WHERE id = '00000000-0000-0000-0000-0000000b3001';

SELECT lives_ok(
  $$UPDATE ext_characters SET status = 'unavailable' WHERE id = '00000000-0000-0000-0000-0000000b3003'$$,
  'with one PC Deceased there is room in Reserve again'
);

SELECT is(pg_temp.sam_posting_as(), NULL, 'with no active PC, Sam posts as himself');

-- ===== Player =================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1002","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3002', 'active')$$,
  'Sam makes a Reserve PC active'
);

SELECT is(pg_temp.sam_posting_as(), 'Bravo', 'Sam now posts as that PC');

SELECT lives_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3003', 'active')$$,
  'Sam makes another PC active'
);

SELECT is(
  pg_temp.sam_statuses(),
  'Alpha:deceased,Bravo:backup,Charlie:active,Delta:backup',
  'the previously active PC moves to Backup by itself'
);

SELECT lives_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3003', 'incapacitated')$$,
  'Sam marks the active PC Incapacitated'
);

SELECT is(pg_temp.sam_posting_as(), NULL, 'Sam posts as himself until he makes a PC active');

SELECT is(
  (SELECT actor_id FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000b3003' AND event_type = 'status_changed'
     AND details ->> 'to' = 'incapacitated'),
  '00000000-0000-0000-0000-0000000b1002'::uuid,
  'the status change is logged with Sam as the one who made it'
);

SELECT throws_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3002', 'deceased')$$,
  '42501', 'Only the GM can set or change this status',
  'a player cannot set a permanent status'
);

UPDATE ext_characters SET status = 'active' WHERE id = '00000000-0000-0000-0000-0000000b3002';
RESET ROLE;
SELECT is(
  (SELECT status FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000b3002'),
  'backup',
  'a direct update by a player changes nothing (only the function is allowed)'
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3009', 'backup')$$,
  'P0001', 'This campaign is archived',
  'archived campaigns are read-only'
);

-- ===== Another player ===========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1003","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000b3002', 'active')$$,
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
