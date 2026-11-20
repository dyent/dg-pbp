-- Step 5c: inline NPC tags. Tag labels (name + portrait for campaign members
-- only) and tagged posts in the Activity search (every tag counts as
-- a mention; speaker lines were dropped by migration 20261120140000).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'taggm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tagsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tagout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-0000000e2001', 'Tags', '00000000-0000-0000-0000-0000000e1001', '0e200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1002', 'Sam', now(), false);

INSERT INTO ext_characters (id, channel_id, kind, name, portrait_url, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000e3001', '00000000-0000-0000-0000-0000000e2001', 'npc', 'Dr Hale', 'https://example.test/hale.png', true, '00000000-0000-0000-0000-0000000e1001'),
  ('00000000-0000-0000-0000-0000000e3002', '00000000-0000-0000-0000-0000000e2001', 'npc', 'Kowalski', NULL, false, '00000000-0000-0000-0000-0000000e1001'),
  ('00000000-0000-0000-0000-0000000e3003', '00000000-0000-0000-0000-0000000e2001', 'pc', 'Reyes', NULL, true, '00000000-0000-0000-0000-0000000e1001');

INSERT INTO messages (id, channel_id, sender_id, type, content, created_at)
VALUES
  ('00000000-0000-0000-0000-0000000e4001', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001', 'regular',
   E'Hale looks up.\n[Dr Hale](npc:00000000-0000-0000-0000-0000000e3001) The body was moved.\nShe glances at [Kowalski](npc:00000000-0000-0000-0000-0000000e3002).',
   now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-0000000e4002', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1002', 'regular',
   '[Dr Hale](npc:00000000-0000-0000-0000-0000000e3001) is lying.',
   now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000e4003', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001', 'regular',
   'Nothing to see here.',
   now() - interval '1 minute');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

CREATE FUNCTION pg_temp.posts(p_character UUID) RETURNS TEXT LANGUAGE sql AS $$
  SELECT string_agg(right(id::text, 1) || ':' || kind, ',' ORDER BY created_at)
  FROM ext_character_posts('00000000-0000-0000-0000-0000000e2001', p_character, NULL, '{}')
$$;
GRANT EXECUTE ON FUNCTION pg_temp.posts(UUID) TO authenticated;

CREATE FUNCTION pg_temp.labels() RETURNS TEXT LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(name || '|' || COALESCE(portrait_url, '-'), ',' ORDER BY name), '')
  FROM ext_npc_tag_labels('00000000-0000-0000-0000-0000000e2001', ARRAY[
    '00000000-0000-0000-0000-0000000e3001',
    '00000000-0000-0000-0000-0000000e3002',
    '00000000-0000-0000-0000-0000000e3003']::uuid[])
$$;
GRANT EXECUTE ON FUNCTION pg_temp.labels() TO authenticated;

-- ===== GM =====================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1001","role":"authenticated"}', true);

SELECT is(pg_temp.posts('00000000-0000-0000-0000-0000000e3001'), '1:mentioned,2:mentioned',
  'every tag is a mention, at the start of a line or not, by the GM or a player');
SELECT is(pg_temp.posts('00000000-0000-0000-0000-0000000e3002'), '1:mentioned',
  'a tag in the middle of a line is a mention');
SELECT is(pg_temp.labels(), 'Dr Hale|https://example.test/hale.png,Kowalski|-',
  'the GM gets the labels of tagged NPCs, never of PCs');

-- ===== Player =================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1002","role":"authenticated"}', true);

SELECT is(pg_temp.labels(), 'Dr Hale|https://example.test/hale.png,Kowalski|-',
  'a player gets the name and portrait of a tagged hidden NPC');
SELECT is((SELECT count(*)::int FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000e3002'), 0,
  'but still cannot read the hidden NPC itself');
SELECT is(pg_temp.posts('00000000-0000-0000-0000-0000000e3001'), '1:mentioned,2:mentioned',
  'players see the same tagged posts in Activity');

-- ===== Outsider ===============================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1003","role":"authenticated"}', true);

SELECT is(pg_temp.labels(), '', 'someone outside the campaign gets no labels');
SELECT is(pg_temp.posts('00000000-0000-0000-0000-0000000e3001'), NULL, 'and no posts');

-- ===== Anonymous ==============================================================
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM ext_npc_tag_labels('00000000-0000-0000-0000-0000000e2001', ARRAY['00000000-0000-0000-0000-0000000e3001']::uuid[])$$,
  '42501', NULL, 'signed-out visitors cannot call the label lookup');

SELECT * FROM finish();
ROLLBACK;
