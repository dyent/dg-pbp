-- Step 5b: character notes (who sees and changes them) and the posts search
-- (uses the caller's own access: whispers and private rooms stay hidden).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(26);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actjo@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d1004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-0000000d2001', 'Activity', '00000000-0000-0000-0000-0000000d1001', '0d200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1002', 'Sam', '2026-01-01', false),
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1003', 'Jo', now(), false);

INSERT INTO sub_channels (id, channel_id, name, visibility)
VALUES ('00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d2001', 'Secret room', 'gm');

INSERT INTO ext_characters (id, channel_id, kind, name, aliases, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000d3001', '00000000-0000-0000-0000-0000000d2001', 'npc', 'Dr. Hale', '{The Doctor}', true, '00000000-0000-0000-0000-0000000d1001'),
  ('00000000-0000-0000-0000-0000000d3002', '00000000-0000-0000-0000-0000000d2001', 'npc', 'Hidden', '{}', false, '00000000-0000-0000-0000-0000000d1001'),
  ('00000000-0000-0000-0000-0000000d3003', '00000000-0000-0000-0000-0000000d2001', 'pc', 'Reyes', '{}', true, '00000000-0000-0000-0000-0000000d1001');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1001', true);
SELECT ext_set_role('00000000-0000-0000-0000-0000000d3003', 'pc', true, '00000000-0000-0000-0000-0000000d1002');

INSERT INTO messages (id, channel_id, sender_id, type, content, npc_name, sub_channel_id, whisper_to, created_at)
VALUES
  ('00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1001', 'npc', 'The body was moved.', 'Dr. Hale', NULL, NULL, now() - interval '5 minutes'),
  ('00000000-0000-0000-0000-0000000d4002', '00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1002', 'regular', 'I ask dr. hale about the autopsy.', NULL, NULL, NULL, now() - interval '4 minutes'),
  ('00000000-0000-0000-0000-0000000d4003', '00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1001', 'regular', 'Dr. Hale is the cult leader.', NULL, '00000000-0000-0000-0000-0000000d5001', NULL, now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-0000000d4004', '00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1001', 'regular', 'Psst Sam: Dr. Hale lied.', NULL, NULL, '00000000-0000-0000-0000-0000000d1002', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000d4005', '00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1003', 'regular', 'The Doctor waves. Dr Haleson too.', NULL, NULL, NULL, now() - interval '1 minute');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- Posts as a given user, as an id list in time order.
CREATE FUNCTION pg_temp.posts(p_character UUID, p_npc TEXT, p_terms TEXT[]) RETURNS TEXT LANGUAGE sql AS $$
  SELECT string_agg(right(id::text, 1) || ':' || kind, ',' ORDER BY created_at)
  FROM ext_character_posts('00000000-0000-0000-0000-0000000d2001', p_character, p_npc, p_terms)
$$;
GRANT EXECUTE ON FUNCTION pg_temp.posts(UUID, TEXT, TEXT[]) TO authenticated;

-- ===== GM =====================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1001","role":"authenticated"}', true);

SELECT is(
  pg_temp.posts('00000000-0000-0000-0000-0000000d3001', 'Dr. Hale', '{Dr. Hale,The Doctor}'),
  '1:spoke,2:mentioned,3:mentioned,4:mentioned,5:mentioned',
  'the GM finds what the NPC said and every mention, including aliases and whispers'
);

SELECT is(
  pg_temp.posts('00000000-0000-0000-0000-0000000d3001', 'Dr. Hale', '{Dr. Hale}'),
  '1:spoke,2:mentioned,3:mentioned,4:mentioned',
  'names match as whole words, ignoring case: "Dr Haleson" is not "Dr. Hale"'
);

SELECT is(
  pg_temp.posts('00000000-0000-0000-0000-0000000d3003', NULL, '{Reyes}'),
  '2:posted',
  'a PC''s own posts are found from its posting periods'
);

SELECT is(
  (SELECT count(*)::int FROM ext_character_posts('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d3001', 'Dr. Hale', '{Dr. Hale}', NULL, 2)),
  2,
  'the number of posts returned can be limited'
);

SELECT is(
  (SELECT count(*)::int FROM ext_character_posts('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d3001', 'Dr. Hale', '{Dr. Hale}',
     (SELECT created_at FROM messages WHERE id = '00000000-0000-0000-0000-0000000d4003'))),
  2,
  'older posts are loaded with a "before" time'
);

SELECT throws_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3001', 'Lied about the body', 'author')$$,
  'P0001', 'GM notes are GM only or for everyone',
  'GM notes cannot be "writer and GM"'
);

SELECT lives_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3001', 'Secretly the cult leader', 'gm', 10144)$$,
  'the GM adds a GM-only note with an in-game date'
);

SELECT lives_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3001', 'Runs the county morgue', 'everyone')$$,
  'the GM adds a note for everyone'
);

SELECT lives_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3002', 'Not yet met', 'gm')$$,
  'the GM adds a note to an unrevealed NPC'
);

SELECT is(
  (SELECT author_character_name FROM ext_character_notes WHERE body = 'Runs the county morgue'),
  NULL,
  'GM notes carry no character label'
);

-- ===== Sam (player) ===========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1002","role":"authenticated"}', true);

SELECT is(
  pg_temp.posts('00000000-0000-0000-0000-0000000d3001', 'Dr. Hale', '{Dr. Hale}'),
  '1:spoke,2:mentioned,4:mentioned',
  'a player only finds posts they could read (whisper to them yes, GM-only room no)'
);

SELECT lives_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3001', 'Nervous about the autopsy', 'author', 10140)$$,
  'Sam adds a private note'
);

SELECT is(
  (SELECT author_character_name || '|' || visibility || '|' || in_game_day FROM ext_character_notes WHERE body = 'Nervous about the autopsy'),
  'Reyes|author|10140',
  'the note is labelled with the PC Sam is posting as'
);

SELECT lives_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3001', 'Has a limp', 'everyone')$$,
  'Sam adds a note for everyone'
);

SELECT throws_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3001', 'Hidden from Sam?', 'gm')$$,
  'P0001', 'Your notes are for you and the GM, or for everyone',
  'a player cannot write GM-only notes'
);

SELECT throws_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3002', 'Who is this?', 'author')$$,
  '42501', 'You can only add notes to characters you can see',
  'a player cannot add notes to an unrevealed NPC'
);

SELECT throws_ok(
  $$SELECT ext_add_character_note('00000000-0000-0000-0000-0000000d3001', '   ', 'author')$$,
  'P0001', 'A note must be 1 to 2000 characters',
  'empty notes are refused'
);

SELECT results_eq(
  $$SELECT body FROM ext_character_notes ORDER BY body$$,
  $$VALUES ('Has a limp'::text), ('Nervous about the autopsy'::text), ('Runs the county morgue'::text)$$,
  'Sam reads his own notes and everyone notes, not GM-only ones'
);

SELECT lives_ok(
  $$SELECT ext_update_character_note((SELECT id FROM ext_character_notes WHERE body = 'Has a limp'), 'Has a limp (left leg)', 'everyone', NULL)$$,
  'Sam edits his own note'
);

SELECT throws_ok(
  $$SELECT ext_update_character_note((SELECT id FROM ext_character_notes WHERE body = 'Runs the county morgue'), 'Edited', 'everyone', NULL)$$,
  '42501', 'You can only edit your own notes',
  'a player cannot edit the GM''s note'
);

UPDATE ext_character_notes SET body = 'tampered' WHERE body = 'Has a limp (left leg)';
SELECT is(
  (SELECT count(*)::int FROM ext_character_notes WHERE body = 'tampered'),
  0,
  'notes cannot be changed directly'
);

-- ===== Jo (another player) ====================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1003","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT body FROM ext_character_notes ORDER BY body$$,
  $$VALUES ('Has a limp (left leg)'::text), ('Runs the county morgue'::text)$$,
  'another player reads only notes shared with everyone'
);

SELECT throws_ok(
  $$SELECT ext_delete_character_note((SELECT id FROM ext_character_notes WHERE body = 'Has a limp (left leg)'))$$,
  '42501', 'You can only delete your own notes',
  'another player cannot delete Sam''s note'
);

-- ===== Outsider ===============================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1004","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM ext_character_notes) + (SELECT count(*)::int FROM ext_character_posts('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d3001', 'Dr. Hale', '{Dr. Hale}')),
  0,
  'an outsider sees no notes and no posts'
);

-- ===== GM deletes any note ====================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_delete_character_note((SELECT id FROM ext_character_notes WHERE body = 'Nervous about the autopsy'))$$,
  'the GM deletes a player''s note'
);

RESET ROLE;
SELECT ok(
  NOT has_function_privilege('anon', 'public.ext_add_character_note(uuid, text, text, integer)', 'EXECUTE')
  AND NOT has_table_privilege('anon', 'public.ext_character_notes', 'SELECT'),
  'anonymous visitors cannot read or add notes'
);

SELECT * FROM finish();
ROLLBACK;
