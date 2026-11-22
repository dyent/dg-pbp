-- cspell:words recalias
-- Campaign records, step 2: GM-only aliases and alias tags, record notes
-- (GM / author / everyone), and the Activity search for records.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(28);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000ab1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ragm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ab1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rasam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ab1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rajo@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000ab2001', 'Record activity', '00000000-0000-0000-0000-000000ab1001', 'ab200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab1003', 'Jo', now(), false);

-- The morgue is shown to every player; the cult is GM only.
INSERT INTO ext_records (id, channel_id, kind, name, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ab3001', '00000000-0000-0000-0000-000000ab2001', 'location', 'Morgue', '00000000-0000-0000-0000-000000ab1001'),
  ('00000000-0000-0000-0000-000000ab3002', '00000000-0000-0000-0000-000000ab2001', 'organisation', 'The Fellowship', '00000000-0000-0000-0000-000000ab1001');
SELECT set_config('ext.allow_record_visibility', 'on', true);
UPDATE ext_records SET visibility = 'players' WHERE id = '00000000-0000-0000-0000-000000ab3001';
SELECT set_config('ext.allow_record_visibility', '', true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM: aliases and alias tags ================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ab1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ab1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_set_record_aliases('00000000-0000-0000-0000-000000ab3002', ARRAY[' The Hollow ', 'the hollow', '', 'Choir'])$$,
  'GM sets aliases'
);
SELECT results_eq(
  $$SELECT alias FROM ext_record_aliases WHERE record_id = '00000000-0000-0000-0000-000000ab3002' ORDER BY sort_order$$,
  $$VALUES ('The Hollow'), ('Choir')$$,
  'Aliases are trimmed, blanks and repeats dropped, order kept'
);
SELECT is(
  (SELECT details->'to' FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-000000ab3002' AND event_type = 'aliases_changed'),
  '["The Hollow", "Choir"]'::jsonb,
  'The alias change is logged'
);
SELECT lives_ok(
  $$SELECT ext_set_record_aliases('00000000-0000-0000-0000-000000ab3002', ARRAY['The Hollow', 'Choir'])$$,
  'Saving the same aliases again is fine'
);
SELECT is(
  (SELECT count(*)::int FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-000000ab3002' AND event_type = 'aliases_changed'),
  1, 'and logs nothing'
);
SELECT throws_ok(
  $$SELECT ext_set_record_aliases('00000000-0000-0000-0000-000000ab3002', ARRAY['a','b','c','d','e','f','g','h','i','j','k'])$$,
  'P0001', 'A record can have at most 10 aliases',
  'At most 10 aliases'
);
SELECT throws_ok(
  $$SELECT ext_set_record_aliases('00000000-0000-0000-0000-000000ab3002', ARRAY[repeat('x', 41)])$$,
  'P0001', 'Aliases can be at most 40 characters',
  'Aliases are at most 40 characters'
);

SELECT isnt(ext_record_alias_tag('00000000-0000-0000-0000-000000ab3002', 'the hollow'), NULL, 'GM gets an alias tag id');
SELECT is(
  ext_record_alias_tag('00000000-0000-0000-0000-000000ab3002', ' The Hollow '),
  ext_record_alias_tag('00000000-0000-0000-0000-000000ab3002', 'THE HOLLOW'),
  'The same alias always gets the same id'
);
SELECT throws_ok(
  $$SELECT ext_record_alias_tag('00000000-0000-0000-0000-000000ab3002', 'Cult')$$,
  '22023', 'That is not one of this record''s aliases',
  'Only the record''s own aliases can be tagged'
);

-- Posts (inserted as the owner, as the app would): a name tag, an alias tag,
-- a plain mention and a whisper to Jo.
RESET ROLE;
INSERT INTO messages (id, channel_id, sender_id, type, content, created_at)
VALUES
  ('00000000-0000-0000-0000-000000ab4001', '00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab1001', 'regular',
   'You reach the [Morgue](rec:00000000-0000-0000-0000-000000ab3001).', now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-000000ab4003', '00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab1002', 'regular',
   'Back to the morgue, then.', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-000000ab4004', '00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab1002', 'regular',
   'Unrelated chatter.', now());
INSERT INTO messages (id, channel_id, sender_id, type, content, created_at)
SELECT '00000000-0000-0000-0000-000000ab4002', '00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab1001', 'regular',
  'Graffiti: [The Hollow](recalias:' || id || ') was here.', now() - interval '2 minutes'
FROM ext_record_alias_tags;
INSERT INTO messages (id, channel_id, sender_id, type, content, whisper_to, created_at)
VALUES ('00000000-0000-0000-0000-000000ab4005', '00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab1001', 'regular',
  'Psst, the Morgue key is under the mat.', '00000000-0000-0000-0000-000000ab1003', now());
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$SELECT id::text FROM ext_record_posts('00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab3001', ARRAY['Morgue'])$$,
  $$VALUES ('00000000-0000-0000-0000-000000ab4005'), ('00000000-0000-0000-0000-000000ab4003'), ('00000000-0000-0000-0000-000000ab4001')$$,
  'GM: the morgue''s Activity finds the tag and the mentions, newest first'
);
SELECT results_eq(
  $$SELECT id::text FROM ext_record_posts('00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab3002', '{}')$$,
  $$VALUES ('00000000-0000-0000-0000-000000ab4002')$$,
  'GM: the cult''s Activity finds its alias tag'
);
SELECT is(
  (SELECT string_agg(DISTINCT kind, ',') FROM ext_record_posts('00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab3001', ARRAY['Morgue'])),
  'mentioned', 'Every hit is a mention'
);

-- GM notes.
SELECT lives_ok(
  $$SELECT ext_add_record_note('00000000-0000-0000-0000-000000ab3001', 'Pete takes bribes', 'gm', NULL)$$,
  'GM adds a GM-only note'
);
SELECT throws_ok(
  $$SELECT ext_add_record_note('00000000-0000-0000-0000-000000ab3001', 'x', 'author', NULL)$$,
  'P0001', 'GM notes are GM only or for everyone',
  'GM notes are GM only or everyone'
);

-- ===== Sam ======================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ab1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ab1002","role":"authenticated"}', true);

SELECT is((SELECT count(*)::int FROM ext_record_aliases), 0, 'Players cannot read aliases');
SELECT is((SELECT count(*)::int FROM ext_record_alias_tags), 0, 'Players cannot read alias tags');
SELECT throws_ok(
  $$SELECT ext_set_record_aliases('00000000-0000-0000-0000-000000ab3001', ARRAY['Slab'])$$,
  '42501', 'Only the GM can change aliases',
  'Players cannot set aliases'
);
SELECT throws_ok(
  $$SELECT ext_record_alias_tag('00000000-0000-0000-0000-000000ab3002', 'The Hollow')$$,
  '42501', 'Only the GM can tag by alias',
  'Players cannot create alias tags'
);
SELECT results_eq(
  $$SELECT id::text FROM ext_record_posts('00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab3001', ARRAY['Morgue'])$$,
  $$VALUES ('00000000-0000-0000-0000-000000ab4003'), ('00000000-0000-0000-0000-000000ab4001')$$,
  'Sam''s Activity leaves out the whisper to Jo'
);
SELECT is(
  (SELECT count(*)::int FROM ext_record_posts('00000000-0000-0000-0000-000000ab2001', '00000000-0000-0000-0000-000000ab3002', '{}')),
  0, 'A player''s search does not connect the alias tag to the record'
);

SELECT lives_ok(
  $$SELECT ext_add_record_note('00000000-0000-0000-0000-000000ab3001', 'Smells of bleach', 'author', NULL)$$,
  'Sam adds a note for himself and the GM'
);
SELECT lives_ok(
  $$SELECT ext_add_record_note('00000000-0000-0000-0000-000000ab3001', 'Back door is unlocked', 'everyone', NULL)$$,
  'Sam adds a note for everyone'
);
SELECT throws_ok(
  $$SELECT ext_add_record_note('00000000-0000-0000-0000-000000ab3002', 'Hello', 'author', NULL)$$,
  '42501', 'You can only add notes to records you can see',
  'Players cannot add notes to hidden records'
);
SELECT results_eq(
  $$SELECT body FROM ext_record_notes ORDER BY created_at$$,
  $$VALUES ('Smells of bleach'), ('Back door is unlocked')$$,
  'Sam reads his own notes, not the GM''s'
);

-- ===== Jo =======================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ab1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ab1003","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT body FROM ext_record_notes$$,
  $$VALUES ('Back door is unlocked')$$,
  'Jo reads only the note shared with everyone'
);
SELECT throws_ok(
  $$SELECT ext_update_record_note((SELECT id FROM ext_record_notes LIMIT 1), 'Mine now', 'everyone', NULL)$$,
  '42501', 'You can only edit your own notes',
  'Jo cannot edit Sam''s note'
);
SELECT throws_ok(
  $$SELECT ext_delete_record_note((SELECT id FROM ext_record_notes LIMIT 1))$$,
  '42501', 'You can only delete your own notes',
  'Jo cannot delete Sam''s note'
);

SELECT * FROM finish();
ROLLBACK;
