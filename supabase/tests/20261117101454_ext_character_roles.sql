-- Fork Phase 2a step 4a: roles (PC in play / out of play / NPC), owner
-- visibility and the Private marker, owner editing with logging, headings,
-- posting hand-over, NPC tags, delete guard, archived campaigns.
-- (Replaces the step-2 stable tests; those functions were retired.)
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(63);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000e4001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rolegm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e4002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rolesam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e4003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rolejo@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e4004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roleout@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e4005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roleblocked@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-0000000e5001', 'Roles', '00000000-0000-0000-0000-0000000e4001', '0e500001'),
  ('00000000-0000-0000-0000-0000000e5002', 'Roles Archived', '00000000-0000-0000-0000-0000000e4001', '0e500002'),
  ('00000000-0000-0000-0000-0000000e5003', 'Roles Other', '00000000-0000-0000-0000-0000000e4001', '0e500003');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000e5001', '00000000-0000-0000-0000-0000000e4001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000e5001', '00000000-0000-0000-0000-0000000e4002', 'Sam', '2026-01-01 00:00:00+00', false),
  ('00000000-0000-0000-0000-0000000e5001', '00000000-0000-0000-0000-0000000e4003', 'Jo', now(), false),
  ('00000000-0000-0000-0000-0000000e5001', '00000000-0000-0000-0000-0000000e4005', 'Blocked', now(), true),
  ('00000000-0000-0000-0000-0000000e5002', '00000000-0000-0000-0000-0000000e4001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000e5002', '00000000-0000-0000-0000-0000000e4002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-0000000e5003', '00000000-0000-0000-0000-0000000e4001', 'GM', now(), false);

INSERT INTO ext_characters (id, channel_id, kind, name, portrait_url, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e5001', 'pc', 'Reyes', 'https://example.com/reyes.png', true, '00000000-0000-0000-0000-0000000e4001'),
  ('00000000-0000-0000-0000-0000000e6002', '00000000-0000-0000-0000-0000000e5001', 'pc', 'Okafor', NULL, true, '00000000-0000-0000-0000-0000000e4001'),
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e5001', 'pc', 'Vance', NULL, false, '00000000-0000-0000-0000-0000000e4001'),
  ('00000000-0000-0000-0000-0000000e6004', '00000000-0000-0000-0000-0000000e5001', 'pc', 'Byrne', NULL, false, '00000000-0000-0000-0000-0000000e4001'),
  ('00000000-0000-0000-0000-0000000e6005', '00000000-0000-0000-0000-0000000e5001', 'pc', 'Moss', NULL, false, '00000000-0000-0000-0000-0000000e4001'),
  ('00000000-0000-0000-0000-0000000e6006', '00000000-0000-0000-0000-0000000e5001', 'npc', 'Dr Hale', NULL, true, '00000000-0000-0000-0000-0000000e4001'),
  ('00000000-0000-0000-0000-0000000e6009', '00000000-0000-0000-0000-0000000e5002', 'pc', 'Archived PC', NULL, false, '00000000-0000-0000-0000-0000000e4001');

INSERT INTO ext_tags (id, channel_id, name)
VALUES ('00000000-0000-0000-0000-0000000e7009', '00000000-0000-0000-0000-0000000e5003', 'Elsewhere');

UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-0000000e5002';

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM assigns PCs ========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6001', 'pc', true, '00000000-0000-0000-0000-0000000e4002')$$,
  'the GM puts Reyes in play for Sam'
);

SELECT is(
  (SELECT owner_id FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000e6001'),
  '00000000-0000-0000-0000-0000000e4002'::uuid,
  'Sam owns Reyes'
);

SELECT is(
  (SELECT started_at FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000e4002' AND ended_at IS NULL
     AND character_id = '00000000-0000-0000-0000-0000000e6001'),
  '2026-01-01 00:00:00+00'::timestamptz,
  'Sam starts posting as Reyes, backdated to when Sam joined'
);

SELECT is(
  (SELECT character_name FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-0000000e5001' AND user_id = '00000000-0000-0000-0000-0000000e4002'),
  'Reyes',
  'Sam''s membership shows Reyes'
);

SELECT results_eq(
  $$SELECT visibility, count(*)::int FROM ext_character_fields
    WHERE character_id = '00000000-0000-0000-0000-0000000e6001'
    GROUP BY visibility ORDER BY visibility$$,
  $$VALUES ('gm'::text, 1), ('owner'::text, 2), ('players'::text, 6)$$,
  'a PC starts with 6 Everyone, 2 Owner and 1 GM-only field'
);

SELECT ok(
  (SELECT private FROM ext_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'secrets'),
  'a PC''s Secrets field is Private by default'
);

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6002', 'pc', true, '00000000-0000-0000-0000-0000000e4002')$$,
  'the GM gives Sam a second PC'
);

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6003', 'pc', true, '00000000-0000-0000-0000-0000000e4002')$$,
  'the GM gives Sam a third PC (unrevealed)'
);

-- Updated by 20261119103000_ext_one_active_character: one active PC per player.
SELECT is(
  (SELECT string_agg(name || ':' || status, ',' ORDER BY name) FROM ext_characters
   WHERE owner_id = '00000000-0000-0000-0000-0000000e4002'),
  'Okafor:backup,Reyes:backup,Vance:active',
  'one active PC per player: each newly given PC moves the previous one to Backup'
);

-- Reyes back to active for the owner tests below (Vance steps back to Backup).
UPDATE ext_characters SET status = 'active' WHERE id = '00000000-0000-0000-0000-0000000e6001';

SELECT throws_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6004', 'pc', true, '00000000-0000-0000-0000-0000000e4005')$$,
  'P0001', 'That player is not an active member of this campaign',
  'a blocked member cannot own a PC'
);

SELECT throws_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6004', 'pc', true, '00000000-0000-0000-0000-0000000e4004')$$,
  'P0001', 'That player is not an active member of this campaign',
  'an outsider cannot own a PC'
);

SELECT throws_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6004', 'monster', true, NULL)$$,
  'P0001', 'Role must be a player character or an NPC',
  'an unknown role is refused'
);

SELECT throws_ok(
  $$UPDATE ext_characters SET owner_id = '00000000-0000-0000-0000-0000000e4003' WHERE id = '00000000-0000-0000-0000-0000000e6004'$$,
  'P0001', NULL,
  'the owner cannot be changed directly'
);

SELECT throws_ok(
  $$INSERT INTO ext_characters (channel_id, kind, name, owner_id, created_by)
    VALUES ('00000000-0000-0000-0000-0000000e5001', 'pc', 'Sneaky', '00000000-0000-0000-0000-0000000e4003', '00000000-0000-0000-0000-0000000e4001')$$,
  'P0001', NULL,
  'a new character cannot be created with an owner'
);

SELECT ok(
  EXISTS (SELECT 1 FROM ext_character_events
          WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND event_type = 'role_changed'
            AND details -> 'to' ->> 'owner_id' = '00000000-0000-0000-0000-0000000e4002'),
  'role changes are logged'
);

SELECT is(
  (SELECT visibility FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000e6003' AND event_type = 'role_changed'),
  'owner',
  'events about an unrevealed PC are shared with its owner only'
);

UPDATE ext_characters SET status_visible = false WHERE id = '00000000-0000-0000-0000-0000000e6001';

-- ===== The owner (Sam) ======================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4002","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_list_revealed_characters('00000000-0000-0000-0000-0000000e5001')),
  4::bigint,
  'the owner sees revealed characters plus their own unrevealed PC'
);

SELECT ok(
  (SELECT is_mine FROM ext_list_revealed_characters('00000000-0000-0000-0000-0000000e5001')
   WHERE id = '00000000-0000-0000-0000-0000000e6003'),
  'the owner''s own PC is flagged as theirs'
);

SELECT is(
  (SELECT status FROM ext_list_revealed_characters('00000000-0000-0000-0000-0000000e5001')
   WHERE id = '00000000-0000-0000-0000-0000000e6001'),
  'active',
  'the owner always sees their PC''s status'
);

SELECT is(
  (SELECT count(*) FROM ext_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000e6001'),
  8::bigint,
  'the owner reads Everyone and Owner fields, not GM-only'
);

SELECT is(
  (SELECT count(*) FROM ext_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000e6003'),
  8::bigint,
  'the owner reads their unrevealed PC''s fields too'
);

SELECT lives_ok(
  $$UPDATE ext_character_fields SET body = 'FBI special agent'
    WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'occupation'$$,
  'the owner edits an Everyone field'
);

SELECT is(
  (SELECT body FROM ext_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'occupation'),
  'FBI special agent',
  'the owner''s edit is saved'
);

SELECT lives_ok(
  $$INSERT INTO ext_character_fields (character_id, channel_id, label, body, visibility, sort_order)
    VALUES ('00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e5001', 'Cover identity', 'Insurance assessor', 'owner', 100)$$,
  'the owner adds a custom Owner field'
);

SELECT lives_ok(
  $$INSERT INTO ext_character_fields (character_id, channel_id, label, item_type, visibility, sort_order)
    VALUES ('00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e5001', 'Contacts', 'heading', 'owner', 110)$$,
  'the owner adds a section heading'
);

SELECT lives_ok(
  $$INSERT INTO ext_character_fields (character_id, channel_id, label, body, visibility, sort_order)
    VALUES ('00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e5001', 'Scratch', 'temp', 'players', 120)$$,
  'the owner adds a custom Everyone field'
);

SELECT throws_ok(
  $$INSERT INTO ext_character_fields (character_id, channel_id, label, body, item_type, visibility)
    VALUES ('00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e5001', 'Bad heading', 'text', 'heading', 'owner')$$,
  '23514', NULL,
  'a heading cannot carry text'
);

SELECT throws_ok(
  $$INSERT INTO ext_character_fields (character_id, channel_id, label, body, visibility)
    VALUES ('00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e5001', 'Sneaky', 'x', 'gm')$$,
  '42501', NULL,
  'the owner cannot add GM-only fields'
);

SELECT throws_ok(
  $$UPDATE ext_character_fields SET visibility = 'gm'
    WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'occupation'$$,
  '42501', NULL,
  'the owner cannot hide a field from the GM view by making it GM-only'
);

DELETE FROM ext_character_fields
WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'appearance';

SELECT ok(
  EXISTS (SELECT 1 FROM ext_character_fields
          WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'appearance'),
  'the owner cannot delete a standard field'
);

DELETE FROM ext_character_fields
WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND label = 'Scratch';

SELECT ok(
  NOT EXISTS (SELECT 1 FROM ext_character_fields
              WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND label = 'Scratch'),
  'the owner deletes their own custom field'
);

SELECT lives_ok(
  $$SELECT ext_update_my_character('00000000-0000-0000-0000-0000000e6001', 'Reyes Jr', 'https://example.com/reyes.png')$$,
  'the owner renames their PC'
);

SELECT is(
  (SELECT character_name FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-0000000e5001' AND user_id = '00000000-0000-0000-0000-0000000e4002'),
  'Reyes Jr',
  'renaming the character Sam is posting as updates Sam''s membership name'
);

SELECT lives_ok(
  $$SELECT ext_set_my_status('00000000-0000-0000-0000-0000000e6002', 'active')$$,
  'the owner switches to posting as their second PC by making it active'
);

SELECT throws_ok(
  $$SELECT ext_post_as('00000000-0000-0000-0000-0000000e6004')$$,
  '42501', NULL,
  'the owner cannot post as a PC that is not theirs'
);

SELECT throws_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6001', 'npc', true, NULL)$$,
  '42501', NULL,
  'a player cannot change roles'
);

UPDATE ext_character_fields SET body = 'hijacked'
WHERE character_id = '00000000-0000-0000-0000-0000000e6004' AND field_key = 'occupation';

SELECT is(
  (SELECT count(*) FROM ext_character_fields WHERE body = 'hijacked'),
  0::bigint,
  'the owner cannot edit someone else''s PC'
);

-- ===== Another player (Jo) ==================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000e6001'),
  6::bigint,
  'another player reads only the Everyone fields of an in-play PC'
);

SELECT is(
  (SELECT count(*) FROM ext_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000e6003'),
  0::bigint,
  'another player reads nothing of an unrevealed PC'
);

SELECT is(
  (SELECT count(*) FROM ext_list_revealed_characters('00000000-0000-0000-0000-0000000e5001')),
  3::bigint,
  'another player sees only revealed characters'
);

SELECT is(
  (SELECT status FROM ext_list_revealed_characters('00000000-0000-0000-0000-0000000e5001')
   WHERE id = '00000000-0000-0000-0000-0000000e6001'),
  NULL::text,
  'another player does not see a hidden status'
);

SELECT throws_ok(
  $$SELECT ext_update_my_character('00000000-0000-0000-0000-0000000e6001', 'Hijacked', NULL)$$,
  '42501', NULL,
  'another player cannot rename someone else''s PC'
);

-- ===== Out of play ==========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4001","role":"authenticated"}', true);

UPDATE ext_characters SET status = 'unavailable' WHERE id = '00000000-0000-0000-0000-0000000e6003';
SELECT ext_set_role('00000000-0000-0000-0000-0000000e6002', 'pc', false, '00000000-0000-0000-0000-0000000e4002');

SELECT is(
  (SELECT count(*) FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000e4002' AND ended_at IS NULL),
  0::bigint,
  'taking the active PC out of play leaves Sam posting as himself (his other PCs are in Reserve)'
);

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6001', 'pc', false, '00000000-0000-0000-0000-0000000e4002', 'Killed in action')$$,
  'the GM takes Reyes out of play'
);

SELECT is(
  (SELECT count(*) FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000e4002' AND ended_at IS NULL),
  0::bigint,
  'with no other active PC in play, Sam is no longer posting as anyone'
);

-- (Every entry in this transaction shares one timestamp, so match the note
-- itself rather than "the latest" entry.)
SELECT is(
  (SELECT count(*)::int FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND event_type = 'role_changed'
     AND note = 'Killed in action'),
  1,
  'the role change note is kept in history'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000e6001'),
  9::bigint,
  'once out of play, other players read its non-Private Owner fields too'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM ext_character_fields
              WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'secrets'),
  'Private fields stay hidden from other players after the PC leaves play'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4002","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000e6001'),
  10::bigint,
  'the former owner still reads everything they could, including Private fields'
);

UPDATE ext_character_fields SET body = 'edited after death'
WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'occupation';

SELECT is(
  (SELECT body FROM ext_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000e6001' AND field_key = 'occupation'),
  'FBI special agent',
  'the former owner can no longer edit an out-of-play PC'
);

-- ===== Conversion to NPC ====================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6002', 'npc', true, NULL)$$,
  'the GM turns Okafor into an NPC'
);

SELECT is(
  (SELECT kind || '|' || (owner_id IS NULL)::text || '|' || (converted_to_npc_at IS NOT NULL)::text
   FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000e6002'),
  'npc|true|true',
  'the NPC has no owner and a conversion date'
);

SELECT is(
  (SELECT count(*) FROM ext_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000e6002' AND visibility = 'owner'),
  0::bigint,
  'a former PC''s Owner fields become GM-only'
);

SELECT ok(
  EXISTS (SELECT 1 FROM ext_characters c JOIN channel_npcs n ON n.id = c.npc_id
          WHERE c.id = '00000000-0000-0000-0000-0000000e6002' AND n.name = 'Okafor'),
  'an NPC posting identity is linked'
);

SELECT throws_ok(
  $$INSERT INTO ext_character_fields (character_id, channel_id, label, body, visibility)
    VALUES ('00000000-0000-0000-0000-0000000e6002', '00000000-0000-0000-0000-0000000e5001', 'Owner note', 'x', 'owner')$$,
  'P0001', 'NPCs have no owner: use Everyone or GM only',
  'NPCs cannot have Owner fields'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4002","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000e6002'),
  6::bigint,
  'the former owner now sees only the NPC''s Everyone fields'
);

SELECT is(
  (SELECT count(*) FROM ext_tags) + (SELECT count(*) FROM ext_character_tags),
  0::bigint,
  'players cannot see NPC tags'
);

-- ===== Tags, delete guard, archived =========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e4001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e4001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO ext_tags (id, channel_id, name) VALUES ('00000000-0000-0000-0000-0000000e7001', '00000000-0000-0000-0000-0000000e5001', 'Witness');
    INSERT INTO ext_character_tags (character_id, tag_id) VALUES ('00000000-0000-0000-0000-0000000e6006', '00000000-0000-0000-0000-0000000e7001')$$,
  'the GM creates a tag and tags an NPC'
);

SELECT throws_ok(
  $$INSERT INTO ext_tags (channel_id, name) VALUES ('00000000-0000-0000-0000-0000000e5001', 'witness')$$,
  '23505', NULL,
  'tag names are unique per campaign, ignoring case'
);

SELECT throws_ok(
  $$INSERT INTO ext_character_tags (character_id, tag_id) VALUES ('00000000-0000-0000-0000-0000000e6006', '00000000-0000-0000-0000-0000000e7009')$$,
  '42501', NULL,
  'a tag from another campaign cannot be attached'
);

SELECT throws_ok(
  $$DELETE FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000e6001'$$,
  'P0001', NULL,
  'a character that has posted cannot be deleted'
);

SELECT lives_ok(
  $$DELETE FROM ext_characters WHERE id = '00000000-0000-0000-0000-0000000e6005'$$,
  'a character that never posted can be deleted'
);

SELECT throws_ok(
  $$SELECT ext_set_role('00000000-0000-0000-0000-0000000e6009', 'pc', true, '00000000-0000-0000-0000-0000000e4002')$$,
  'P0001', 'This campaign is archived',
  'an archived campaign rejects role changes'
);

SELECT * FROM finish();
ROLLBACK;
