-- Hidden PCs with no owner stay hidden from players (fix 2026-11-23).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000ae1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'upgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ae1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'upsam@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000ae2001', 'Unowned PCs', '00000000-0000-0000-0000-000000ae1001', 'ae200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae1002', 'Sam', now(), false);

-- A hidden PC nobody owns yet, a hidden retired one, and a revealed one.
-- (Creating one already out of play needs the role-change switch, as ext_set_role uses.)
SELECT set_config('ext.allow_role_change', 'on', true);
INSERT INTO ext_characters (id, channel_id, kind, name, revealed, in_play, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ae3001', '00000000-0000-0000-0000-000000ae2001', 'pc', 'Unassigned', false, true, '00000000-0000-0000-0000-000000ae1001'),
  ('00000000-0000-0000-0000-000000ae3002', '00000000-0000-0000-0000-000000ae2001', 'pc', 'Old agent', false, false, '00000000-0000-0000-0000-000000ae1001'),
  ('00000000-0000-0000-0000-000000ae3003', '00000000-0000-0000-0000-000000ae2001', 'pc', 'Known agent', true, true, '00000000-0000-0000-0000-000000ae1001');
SELECT set_config('ext.allow_role_change', '', true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ae1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ae1002","role":"authenticated"}', true);

SELECT is(ext_can_read_entry('00000000-0000-0000-0000-000000ae3001', 'players', false), false,
  'A hidden, unowned PC is not readable by players');
SELECT is(
  (SELECT count(*)::int FROM ext_character_fields WHERE character_id = '00000000-0000-0000-0000-000000ae3001'),
  0, 'and none of its fields are');
SELECT is(ext_can_read_entry('00000000-0000-0000-0000-000000ae3002', 'owner', false), false,
  'A hidden, unowned retired PC keeps its owner fields (and sheet) hidden');
SELECT is(ext_can_read_entry('00000000-0000-0000-0000-000000ae3003', 'players', false), true,
  'A revealed PC is still readable');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ae1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ae1001","role":"authenticated"}', true);
SELECT is(ext_can_read_entry('00000000-0000-0000-0000-000000ae3001', 'gm', false), true,
  'The GM still reads everything');

SELECT * FROM finish();
ROLLBACK;
