-- One NPC list: "Speak as" roster entries become NPC characters, and deleting
-- an NPC character removes its roster entry.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(8);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mergegm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000c1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mergesam@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-0000000c2001', 'Merge', '00000000-0000-0000-0000-0000000c1001', '0c200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c1002', 'Sam', now(), false);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1001","role":"authenticated"}', true);

-- As upstream's "Speak as NPC" does when the GM types a new name.
INSERT INTO channel_npcs (id, channel_id, name, avatar_url)
VALUES ('00000000-0000-0000-0000-0000000c3001', '00000000-0000-0000-0000-0000000c2001', 'Night Clerk', 'https://example.com/clerk.png');
-- The roster trigger runs at commit; run it now.
SET CONSTRAINTS ALL IMMEDIATE;

SELECT is(
  (SELECT kind || '|' || name || '|' || portrait_url || '|' || revealed::text FROM ext_characters
   WHERE npc_id = '00000000-0000-0000-0000-0000000c3001'),
  'npc|Night Clerk|https://example.com/clerk.png|false',
  'a new "Speak as" name becomes an NPC character, hidden from players'
);

SELECT is(
  (SELECT created_by FROM ext_characters WHERE npc_id = '00000000-0000-0000-0000-0000000c3001'),
  '00000000-0000-0000-0000-0000000c1001'::uuid,
  'the GM is recorded as its creator'
);

SET CONSTRAINTS ALL DEFERRED;
INSERT INTO ext_characters (id, channel_id, kind, name, created_by)
VALUES ('00000000-0000-0000-0000-0000000c4001', '00000000-0000-0000-0000-0000000c2001', 'npc', 'Dr Hale', '00000000-0000-0000-0000-0000000c1001');
SET CONSTRAINTS ALL IMMEDIATE;

SELECT is(
  (SELECT count(*)::int FROM ext_characters WHERE channel_id = '00000000-0000-0000-0000-0000000c2001' AND name = 'Dr Hale'),
  1,
  'an NPC made in the Characters panel is not duplicated by its own roster entry'
);

SELECT ok(
  EXISTS (SELECT 1 FROM channel_npcs n JOIN ext_characters c ON c.npc_id = n.id
          WHERE c.id = '00000000-0000-0000-0000-0000000c4001'),
  'it still has its "Speak as" entry'
);

SELECT lives_ok(
  $$DELETE FROM ext_characters WHERE npc_id = '00000000-0000-0000-0000-0000000c3001'$$,
  'the GM deletes the NPC character'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM channel_npcs WHERE id = '00000000-0000-0000-0000-0000000c3001'),
  'its "Speak as" entry is removed with it'
);

-- ===== Player ===============================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1002","role":"authenticated"}', true);

SELECT throws_ok(
  $$INSERT INTO channel_npcs (channel_id, name, avatar_url)
    VALUES ('00000000-0000-0000-0000-0000000c2001', 'Sneaky', '')$$,
  '42501', NULL,
  'a player cannot add "Speak as" names, so cannot create NPCs that way'
);

SELECT is(
  (SELECT count(*)::int FROM ext_list_revealed_characters('00000000-0000-0000-0000-0000000c2001')),
  0,
  'players do not see the NPCs until revealed'
);

SELECT * FROM finish();
ROLLBACK;
