-- Every NPC gets a "Speak as NPC" roster entry (channel_npcs), kept in step
-- with its name and portrait.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'npcidgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000a1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'npcidsam@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-0000000a2001', 'NPC identities', '00000000-0000-0000-0000-0000000a1001', '0a200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000a2001', '00000000-0000-0000-0000-0000000a1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000a2001', '00000000-0000-0000-0000-0000000a1002', 'Sam', now(), false);

-- A roster entry the GM made earlier with upstream's own NPC roster.
INSERT INTO channel_npcs (id, channel_id, name, avatar_url)
VALUES ('00000000-0000-0000-0000-0000000a3001', '00000000-0000-0000-0000-0000000a2001', 'Witness', '');

-- Checked before the test-wide grants below.
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.ext__link_npc_identity(uuid)', 'EXECUTE'),
  'the internal linking helper cannot be called from the app'
);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1001","role":"authenticated"}', true);

INSERT INTO ext_characters (id, channel_id, kind, name, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000a4001', '00000000-0000-0000-0000-0000000a2001', 'npc', 'Agent Smith', '00000000-0000-0000-0000-0000000a1001'),
  ('00000000-0000-0000-0000-0000000a4002', '00000000-0000-0000-0000-0000000a2001', 'npc', 'Witness', '00000000-0000-0000-0000-0000000a1001'),
  ('00000000-0000-0000-0000-0000000a4003', '00000000-0000-0000-0000-0000000a2001', 'pc', 'Reyes', '00000000-0000-0000-0000-0000000a1001');

SELECT is(
  (SELECT n.name FROM ext_characters c JOIN channel_npcs n ON n.id = c.npc_id
   WHERE c.id = '00000000-0000-0000-0000-0000000a4001'),
  'Agent Smith',
  'a new NPC gets a Speak as roster entry'
);

SELECT is(
  (SELECT npc_id FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000a4002'),
  '00000000-0000-0000-0000-0000000a3001'::uuid,
  'an unused roster entry with the same name is reused'
);

SELECT is(
  (SELECT count(*)::int FROM channel_npcs WHERE channel_id = '00000000-0000-0000-0000-0000000a2001' AND name = 'Witness'),
  1,
  'no duplicate roster entry is made'
);

SELECT ok(
  (SELECT npc_id IS NULL FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000a4003'),
  'a PC gets no NPC roster entry'
);

UPDATE ext_characters SET name = 'Mr Smith' WHERE id = '00000000-0000-0000-0000-0000000a4001';
SELECT is(
  (SELECT n.name FROM ext_characters c JOIN channel_npcs n ON n.id = c.npc_id
   WHERE c.id = '00000000-0000-0000-0000-0000000a4001'),
  'Mr Smith',
  'renaming the NPC renames its roster entry'
);

UPDATE ext_characters SET portrait_url = 'https://example.com/smith.png' WHERE id = '00000000-0000-0000-0000-0000000a4001';
SELECT is(
  (SELECT n.avatar_url FROM ext_characters c JOIN channel_npcs n ON n.id = c.npc_id
   WHERE c.id = '00000000-0000-0000-0000-0000000a4001'),
  'https://example.com/smith.png',
  'a new portrait updates the roster entry'
);

SELECT lives_ok(
  $$UPDATE ext_characters SET name = 'Witness' WHERE id = '00000000-0000-0000-0000-0000000a4001'$$,
  'renaming an NPC to a name another roster entry uses still works'
);

SELECT is(
  (SELECT n.name FROM ext_characters c JOIN channel_npcs n ON n.id = c.npc_id
   WHERE c.id = '00000000-0000-0000-0000-0000000a4001'),
  'Mr Smith',
  '...and its roster entry keeps the old name rather than clashing'
);

SELECT * FROM finish();
ROLLBACK;
