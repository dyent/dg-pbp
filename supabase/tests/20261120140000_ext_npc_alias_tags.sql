-- Step 5c follow-up: tagging NPCs by a GM-only alias. Only the GM can create or
-- read alias tags; only the GM's Activity search finds posts that use them.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(11);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000f1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aliasgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000f1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aliassam@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-0000000f2001', 'Aliases', '00000000-0000-0000-0000-0000000f1001', '0f200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f1002', 'Sam', now(), false);

INSERT INTO ext_characters (id, channel_id, kind, name, aliases, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000f3001', '00000000-0000-0000-0000-0000000f2001', 'npc', 'Dr Hale', '{The Stranger}', true, '00000000-0000-0000-0000-0000000f1001'),
  ('00000000-0000-0000-0000-0000000f3002', '00000000-0000-0000-0000-0000000f2001', 'pc', 'Reyes', '{Rey}', true, '00000000-0000-0000-0000-0000000f1001');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM =====================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1001","role":"authenticated"}', true);

SELECT isnt(ext_npc_alias_tag('00000000-0000-0000-0000-0000000f3001', 'the stranger'), NULL,
  'the GM gets an alias tag id for one of the NPC''s aliases');
SELECT is(
  ext_npc_alias_tag('00000000-0000-0000-0000-0000000f3001', ' The Stranger '),
  ext_npc_alias_tag('00000000-0000-0000-0000-0000000f3001', 'THE STRANGER'),
  'the same alias always gets the same id');
SELECT is((SELECT count(*)::int FROM ext_npc_alias_tags WHERE character_id = '00000000-0000-0000-0000-0000000f3001'), 1, 'one row per alias');
SELECT throws_ok($$SELECT ext_npc_alias_tag('00000000-0000-0000-0000-0000000f3001', 'Doc')$$,
  '22023', 'That is not one of this NPC''s aliases', 'only the NPC''s own aliases can be tagged');
SELECT throws_ok($$SELECT ext_npc_alias_tag('00000000-0000-0000-0000-0000000f3002', 'Rey')$$,
  '22023', NULL, 'PCs cannot be tagged by alias');

-- A post using the alias tag (inserted as the owner, as the app would).
RESET ROLE;
INSERT INTO messages (id, channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-0000000f4001', '00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f1001', 'regular',
  'A figure: [The Stranger](npcalias:' || id || ') nods.', now()
FROM ext_npc_alias_tags WHERE character_id = '00000000-0000-0000-0000-0000000f3001';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT string_agg(kind, ',') FROM ext_character_posts('00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f3001', NULL, '{}')),
  'mentioned', 'the GM''s Activity finds the alias tag as a mention');

-- ===== Player =================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f1002","role":"authenticated"}', true);

SELECT is((SELECT count(*)::int FROM ext_npc_alias_tags), 0, 'players cannot read alias tags');
SELECT throws_ok($$SELECT ext_npc_alias_tag('00000000-0000-0000-0000-0000000f3001', 'The Stranger')$$,
  '42501', 'Only the GM can tag by alias', 'players cannot create alias tags');
SELECT is(
  (SELECT count(*)::int FROM ext_character_posts('00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f3001', NULL, '{}')),
  0, 'a player''s Activity does not connect the alias to the NPC');
SELECT is(
  (SELECT count(*)::int FROM messages WHERE id = '00000000-0000-0000-0000-0000000f4001'), 1,
  'but the player can read the post itself');

-- ===== Anonymous ==============================================================
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM ext_npc_alias_tags$$, '42501', NULL, 'signed-out visitors cannot read alias tags');

SELECT * FROM finish();
ROLLBACK;
