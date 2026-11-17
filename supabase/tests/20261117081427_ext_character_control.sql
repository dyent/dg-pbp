-- Fork Phase 2a step 2: character stables, posting periods, give / take / post-as /
-- convert-to-NPC. Covers permissions (GM, controlling player, other
-- player, outsider, blocked member), the 3-character cap, active-only switching,
-- backdated first period, membership name/portrait sync, automatic re-switch
-- on take-back, conversion (new and reused NPC identity), archived campaigns,
-- event logging and visibility.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(45);

-- ---- Fixtures (as the database owner) --------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000da001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000da002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acp1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000da003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acp2@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000da004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acout@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000da005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acblocked@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code, is_archived)
VALUES
  ('00000000-0000-0000-0000-0000000db001', 'Stables', '00000000-0000-0000-0000-0000000da001', '0db00001', false),
  ('00000000-0000-0000-0000-0000000db002', 'Stables Archived', '00000000-0000-0000-0000-0000000da001', '0db00002', false);

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000db001', '00000000-0000-0000-0000-0000000da001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000db001', '00000000-0000-0000-0000-0000000da002', 'Sam', '2026-01-01 00:00:00+00', false),
  ('00000000-0000-0000-0000-0000000db001', '00000000-0000-0000-0000-0000000da003', 'Jo', now(), false),
  ('00000000-0000-0000-0000-0000000db001', '00000000-0000-0000-0000-0000000da005', 'Blocked', now(), true),
  ('00000000-0000-0000-0000-0000000db002', '00000000-0000-0000-0000-0000000da001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000db002', '00000000-0000-0000-0000-0000000da002', 'Sam', now(), false);

INSERT INTO ext_characters (id, channel_id, kind, name, portrait_url, status, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000dc001', '00000000-0000-0000-0000-0000000db001', 'pc', 'Reyes', 'https://example.com/reyes.png', 'active', true, '00000000-0000-0000-0000-0000000da001'),
  ('00000000-0000-0000-0000-0000000dc002', '00000000-0000-0000-0000-0000000db001', 'pc', 'Okafor', NULL, 'active', true, '00000000-0000-0000-0000-0000000da001'),
  ('00000000-0000-0000-0000-0000000dc003', '00000000-0000-0000-0000-0000000db001', 'pc', 'Vance', NULL, 'active', false, '00000000-0000-0000-0000-0000000da001'),
  ('00000000-0000-0000-0000-0000000dc004', '00000000-0000-0000-0000-0000000db001', 'pc', 'Byrne', NULL, 'active', false, '00000000-0000-0000-0000-0000000da001'),
  ('00000000-0000-0000-0000-0000000dc005', '00000000-0000-0000-0000-0000000db001', 'npc', 'Dr Hale', NULL, 'active', false, '00000000-0000-0000-0000-0000000da001'),
  ('00000000-0000-0000-0000-0000000dc009', '00000000-0000-0000-0000-0000000db002', 'pc', 'Archived', NULL, 'active', false, '00000000-0000-0000-0000-0000000da001');

-- An NPC identity that already matches a character's name (reused on conversion).
INSERT INTO channel_npcs (id, channel_id, name, avatar_url)
VALUES ('00000000-0000-0000-0000-0000000dd004', '00000000-0000-0000-0000-0000000db001', 'Byrne', '');

UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-0000000db002';

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM gives characters =================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000da001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000da001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc001', '00000000-0000-0000-0000-0000000da002')$$,
  'the GM gives Reyes to Sam'
);

SELECT is(
  (SELECT character_id FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000da002' AND ended_at IS NULL),
  '00000000-0000-0000-0000-0000000dc001'::uuid,
  'Sam starts posting as their first character'
);

SELECT is(
  (SELECT started_at FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000da002' AND ended_at IS NULL),
  '2026-01-01 00:00:00+00'::timestamptz,
  'the first posting period starts when the player joined'
);

SELECT is(
  (SELECT character_name || '|' || character_avatar_url FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-0000000db001' AND user_id = '00000000-0000-0000-0000-0000000da002'),
  'Reyes|https://example.com/reyes.png',
  'the character''s name and portrait are copied to the player''s membership'
);

SELECT is(
  (SELECT count(*) FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000dc001' AND event_type IN ('given', 'posting_started')),
  2::bigint,
  'giving and starting to post are both logged'
);

SELECT is(
  (SELECT visibility FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000dc001' AND event_type = 'given'),
  'players',
  'events about a revealed PC are shared with the players'
);

SELECT lives_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc002', '00000000-0000-0000-0000-0000000da002')$$,
  'the GM gives Sam a second character'
);

SELECT is(
  (SELECT character_id FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000da002' AND ended_at IS NULL),
  '00000000-0000-0000-0000-0000000dc001'::uuid,
  'a second character does not change who the player is posting as'
);

SELECT lives_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc003', '00000000-0000-0000-0000-0000000da002')$$,
  'the GM gives Sam a third character'
);

SELECT is(
  (SELECT visibility FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000dc003' AND event_type = 'given'),
  'gm',
  'events about an unrevealed PC stay GM-only'
);

SELECT throws_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc004', '00000000-0000-0000-0000-0000000da002')$$,
  'P0001', 'A player can control at most 3 characters at once',
  'a fourth character is refused'
);

SELECT throws_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc001', '00000000-0000-0000-0000-0000000da003')$$,
  'P0001', 'This character already belongs to a player',
  'a character cannot belong to two players'
);

SELECT throws_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc005', '00000000-0000-0000-0000-0000000da003')$$,
  'P0001', 'Only player characters can be given to players',
  'an NPC cannot be given to a player'
);

SELECT throws_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc004', '00000000-0000-0000-0000-0000000da005')$$,
  'P0001', 'That player is not an active member of this campaign',
  'a blocked member cannot be given a character'
);

SELECT throws_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc004', '00000000-0000-0000-0000-0000000da004')$$,
  'P0001', 'That player is not an active member of this campaign',
  'an outsider cannot be given a character'
);

SELECT throws_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc009', '00000000-0000-0000-0000-0000000da002')$$,
  'P0001', 'This campaign is archived',
  'an archived campaign rejects changes'
);

SELECT throws_ok(
  $$INSERT INTO ext_character_controllers (channel_id, character_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000db001', '00000000-0000-0000-0000-0000000dc004', '00000000-0000-0000-0000-0000000da003')$$,
  '42501', NULL,
  'even the GM cannot write stables directly, only through the functions'
);

-- ===== The controlling player switches ======================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000da002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000da002","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_post_as('00000000-0000-0000-0000-0000000dc002')$$,
  'Sam switches to posting as Okafor'
);

SELECT is(
  (SELECT count(*) FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000da002' AND ended_at IS NULL),
  1::bigint,
  'a player has exactly one open posting period after switching'
);

SELECT ok(
  (SELECT ended_at IS NOT NULL FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000da002' AND character_id = '00000000-0000-0000-0000-0000000dc001'),
  'the previous posting period is closed'
);

SELECT is(
  (SELECT character_name FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-0000000db001' AND user_id = '00000000-0000-0000-0000-0000000da002'),
  'Okafor',
  'switching updates the membership name'
);

SELECT ok(
  (SELECT character_avatar_url IS NULL FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-0000000db001' AND user_id = '00000000-0000-0000-0000-0000000da002'),
  'switching to a character with no portrait clears the old portrait'
);

SELECT lives_ok(
  $$SELECT ext_post_as('00000000-0000-0000-0000-0000000dc002')$$,
  'switching to the current character is harmless'
);

SELECT is(
  (SELECT count(*) FROM ext_posting_periods WHERE user_id = '00000000-0000-0000-0000-0000000da002'),
  2::bigint,
  'switching to the current character creates no new period'
);

SELECT throws_ok(
  $$SELECT ext_post_as('00000000-0000-0000-0000-0000000dc004')$$,
  '42501', NULL,
  'a player cannot post as a character they do not control'
);

SELECT throws_ok(
  $$SELECT ext_give_character('00000000-0000-0000-0000-0000000dc004', '00000000-0000-0000-0000-0000000da002')$$,
  '42501', NULL,
  'a player cannot give characters'
);

SELECT throws_ok(
  $$SELECT ext_take_character('00000000-0000-0000-0000-0000000dc002')$$,
  '42501', NULL,
  'a player cannot take characters back'
);

SELECT throws_ok(
  $$SELECT ext_convert_to_npc('00000000-0000-0000-0000-0000000dc002')$$,
  '42501', NULL,
  'a player cannot convert characters'
);

-- ===== Sidelined characters cannot be switched to ===============================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000da001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000da001","role":"authenticated"}', true);
UPDATE ext_characters SET status = 'unavailable' WHERE id = '00000000-0000-0000-0000-0000000dc003';

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000da002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000da002","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_post_as('00000000-0000-0000-0000-0000000dc003')$$,
  'P0001', 'This character is not currently active',
  'a player cannot switch to a sidelined character'
);

-- ===== Other player and outsider ============================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000da003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000da003","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_post_as('00000000-0000-0000-0000-0000000dc002')$$,
  '42501', NULL,
  'a player cannot post as another player''s character'
);

SELECT is(
  (SELECT count(*) FROM ext_character_controllers WHERE channel_id = '00000000-0000-0000-0000-0000000db001'),
  3::bigint,
  'other members can see who controls which character'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000da004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000da004","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_character_controllers) + (SELECT count(*) FROM ext_posting_periods),
  0::bigint,
  'an outsider sees no stables or posting periods'
);

-- ===== GM takes a character back ==========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000da001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000da001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_take_character('00000000-0000-0000-0000-0000000dc002', 'Killed in action')$$,
  'the GM takes back the character Sam is posting as'
);

SELECT is(
  (SELECT character_id FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000da002' AND ended_at IS NULL),
  '00000000-0000-0000-0000-0000000dc001'::uuid,
  'Sam is switched to their remaining active character (not the sidelined one)'
);

SELECT is(
  (SELECT end_note FROM ext_character_controllers
   WHERE character_id = '00000000-0000-0000-0000-0000000dc002'),
  'Killed in action',
  'the take-back note is stored on the stable record'
);

SELECT is(
  (SELECT note FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000dc002' AND event_type = 'taken'),
  'Killed in action',
  'the take-back is logged with its note'
);

SELECT throws_ok(
  $$SELECT ext_take_character('00000000-0000-0000-0000-0000000dc002')$$,
  'P0001', 'This character does not belong to a player',
  'taking back a character nobody controls is refused'
);

-- ===== Conversion to NPC ====================================================
SELECT lives_ok(
  $$SELECT ext_convert_to_npc('00000000-0000-0000-0000-0000000dc001')$$,
  'the GM converts Reyes into an NPC'
);

SELECT is(
  (SELECT kind || '|' || (converted_to_npc_at IS NOT NULL)::text FROM ext_characters
   WHERE id = '00000000-0000-0000-0000-0000000dc001'),
  'npc|true',
  'the character is now an NPC with a conversion date'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM ext_characters c
    JOIN channel_npcs n ON n.id = c.npc_id
    WHERE c.id = '00000000-0000-0000-0000-0000000dc001'
      AND n.name = 'Reyes' AND n.avatar_url = 'https://example.com/reyes.png'
  ),
  'an NPC posting identity with the same name and portrait is created and linked'
);

SELECT is(
  (SELECT count(*) FROM ext_posting_periods
   WHERE user_id = '00000000-0000-0000-0000-0000000da002' AND ended_at IS NULL),
  0::bigint,
  'with no other active character, Sam is no longer posting as anyone'
);

SELECT is(
  (SELECT character_name FROM channel_members
   WHERE channel_id = '00000000-0000-0000-0000-0000000db001' AND user_id = '00000000-0000-0000-0000-0000000da002'),
  (SELECT COALESCE(LEFT(display_name, 20), 'Player') FROM profiles WHERE id = '00000000-0000-0000-0000-0000000da002'),
  'Sam''s membership falls back to their account name (or "Player" if they have none)'
);

SELECT is(
  ext_convert_to_npc('00000000-0000-0000-0000-0000000dc004'),
  '00000000-0000-0000-0000-0000000dd004'::uuid,
  'conversion reuses an existing NPC identity with the same name'
);

SELECT throws_ok(
  $$SELECT ext_convert_to_npc('00000000-0000-0000-0000-0000000dc001')$$,
  'P0001', 'Only player characters can be converted to NPCs',
  'an NPC cannot be converted again'
);

SELECT throws_ok(
  $$UPDATE ext_characters SET kind = 'pc' WHERE id = '00000000-0000-0000-0000-0000000dc001'$$,
  'P0001', NULL,
  'the kind lock is back on after a conversion'
);

SELECT * FROM finish();
ROLLBACK;
