-- Notes that tag a character or record show in its Activity, with the note's
-- own read rules (ext_tagged_notes runs with the caller's rights).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(14);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000ae1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tngm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ae1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tnsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ae1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tnjo@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ae1004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tnout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000ae2001', 'Tagged notes', '00000000-0000-0000-0000-000000ae1001', 'ae200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae1003', 'Jo', now(), false);

-- Hale is revealed, Moss hidden; Reyes is Sam's PC.
INSERT INTO ext_characters (id, channel_id, kind, name, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ae4001', '00000000-0000-0000-0000-000000ae2001', 'npc', 'Dr Hale', true, '00000000-0000-0000-0000-000000ae1001'),
  ('00000000-0000-0000-0000-000000ae4002', '00000000-0000-0000-0000-000000ae2001', 'npc', 'Moss', false, '00000000-0000-0000-0000-000000ae1001');
INSERT INTO ext_characters (id, channel_id, kind, name, revealed, created_by)
VALUES ('00000000-0000-0000-0000-000000ae4003', '00000000-0000-0000-0000-000000ae2001', 'pc', 'Agent Reyes', true, '00000000-0000-0000-0000-000000ae1001');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ae1001', true);
SELECT ext_set_role('00000000-0000-0000-0000-000000ae4003', 'pc', true, '00000000-0000-0000-0000-000000ae1002');

-- The morgue is shown to everyone, the cult to nobody.
INSERT INTO ext_records (id, channel_id, kind, name, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ae3001', '00000000-0000-0000-0000-000000ae2001', 'location', 'Morgue', '00000000-0000-0000-0000-000000ae1001'),
  ('00000000-0000-0000-0000-000000ae3002', '00000000-0000-0000-0000-000000ae2001', 'organisation', 'The Fellowship', '00000000-0000-0000-0000-000000ae1001');
SELECT set_config('ext.allow_record_visibility', 'on', true);
UPDATE ext_records SET visibility = 'players' WHERE id = '00000000-0000-0000-0000-000000ae3001';
SELECT set_config('ext.allow_record_visibility', '', true);

INSERT INTO ext_npc_alias_tags (id, channel_id, character_id, alias)
VALUES ('00000000-0000-0000-0000-000000ae6001', '00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae4001', 'The Doctor');

INSERT INTO ext_record_notes (id, channel_id, record_id, author_id, body, visibility, created_at)
VALUES
  ('00000000-0000-0000-0000-000000ae5001', '00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae3001', '00000000-0000-0000-0000-000000ae1001',
   'GM secret: [Dr Hale](npc:00000000-0000-0000-0000-000000ae4001) has a key.', 'gm', now() - interval '6 minutes'),
  ('00000000-0000-0000-0000-000000ae5002', '00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae3001', '00000000-0000-0000-0000-000000ae1001',
   '[Dr Hale](npc:00000000-0000-0000-0000-000000ae4001) works nights here.', 'everyone', now() - interval '5 minutes'),
  ('00000000-0000-0000-0000-000000ae5004', '00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae3002', '00000000-0000-0000-0000-000000ae1001',
   'Funds [Dr Hale](npc:00000000-0000-0000-0000-000000ae4001).', 'everyone', now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-000000ae5006', '00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae3001', '00000000-0000-0000-0000-000000ae1001',
   'Seen: [The Doctor](npcalias:00000000-0000-0000-0000-000000ae6001).', 'everyone', now() - interval '1 minute');
INSERT INTO ext_character_notes (id, channel_id, character_id, author_id, body, visibility, created_at)
VALUES
  ('00000000-0000-0000-0000-000000ae5003', '00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae4003', '00000000-0000-0000-0000-000000ae1002',
   'Ask [Dr Hale](npc:00000000-0000-0000-0000-000000ae4001) about the [Morgue](rec:00000000-0000-0000-0000-000000ae3001).', 'author', now() - interval '4 minutes'),
  ('00000000-0000-0000-0000-000000ae5005', '00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae4001', '00000000-0000-0000-0000-000000ae1001',
   'Note on [Dr Hale](npc:00000000-0000-0000-0000-000000ae4001) himself.', 'everyone', now() - interval '2 minutes'),
  -- Written by Sam on Moss, who is hidden now.
  ('00000000-0000-0000-0000-000000ae5007', '00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae4002', '00000000-0000-0000-0000-000000ae1002',
   'Moss knows [Dr Hale](npc:00000000-0000-0000-0000-000000ae4001).', 'author', now());

SET LOCAL ROLE authenticated;

-- ===== GM =========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ae1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ae1001","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT id FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4001')$$,
  $$VALUES ('00000000-0000-0000-0000-000000ae5007'::uuid), ('00000000-0000-0000-0000-000000ae5006'::uuid), ('00000000-0000-0000-0000-000000ae5004'::uuid),
           ('00000000-0000-0000-0000-000000ae5003'::uuid), ('00000000-0000-0000-0000-000000ae5002'::uuid), ('00000000-0000-0000-0000-000000ae5001'::uuid)$$,
  'GM: every note elsewhere that tags Hale, by name or alias, newest first; not his own notes'
);
SELECT is(
  (SELECT about_type || ' ' || about_name || ' ' || about_kind FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4001')
   WHERE id = '00000000-0000-0000-0000-000000ae5004'),
  'record The Fellowship organisation',
  'Each note says what it was written on'
);
SELECT is(
  (SELECT about_name || ' ' || about_kind FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4001')
   WHERE id = '00000000-0000-0000-0000-000000ae5003'),
  'Agent Reyes pc',
  'A note on a character names it too'
);
SELECT results_eq(
  $$SELECT id FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_record_id => '00000000-0000-0000-0000-000000ae3001')$$,
  $$VALUES ('00000000-0000-0000-0000-000000ae5003'::uuid)$$,
  'Records work the same way'
);
SELECT is(
  (SELECT count(*)::int FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4002')),
  0,
  'Nothing for a character no note tags'
);
SELECT is(
  (SELECT count(*)::int FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001')),
  0,
  'Giving neither returns nothing'
);
SELECT is(
  (SELECT count(*)::int FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', '00000000-0000-0000-0000-000000ae4001', '00000000-0000-0000-0000-000000ae3001')),
  0,
  'Giving both returns nothing'
);

-- ===== Sam (owns Reyes) =============================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ae1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ae1002","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT id FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4001')$$,
  $$VALUES ('00000000-0000-0000-0000-000000ae5007'::uuid), ('00000000-0000-0000-0000-000000ae5003'::uuid), ('00000000-0000-0000-0000-000000ae5002'::uuid)$$,
  'Sam: own notes and Everyone notes on things Sam can see; no GM notes, no hidden records, no alias matches'
);
SELECT is(
  (SELECT about_name FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4001')
   WHERE id = '00000000-0000-0000-0000-000000ae5007'),
  NULL,
  'A hidden character is not named, even on Sam''s own note'
);
SELECT is(
  (SELECT about_name FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4001')
   WHERE id = '00000000-0000-0000-0000-000000ae5002'),
  'Morgue',
  'A record Sam can see is named'
);
SELECT is(
  (SELECT count(*)::int FROM ext_visible_end_label(NULL, '00000000-0000-0000-0000-000000ae3002')),
  0,
  'ext_visible_end_label hides a record Sam cannot see'
);

-- ===== Jo (another player) ===========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ae1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ae1003","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT id FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4001')$$,
  $$VALUES ('00000000-0000-0000-0000-000000ae5002'::uuid)$$,
  'Jo: only the Everyone note on a record Jo can see'
);
SELECT is(
  (SELECT count(*)::int FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_record_id => '00000000-0000-0000-0000-000000ae3001')),
  0,
  'Jo does not get Sam''s private note that tags the morgue'
);

-- ===== Outsider ======================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ae1004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ae1004","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM ext_tagged_notes('00000000-0000-0000-0000-000000ae2001', p_character_id => '00000000-0000-0000-0000-000000ae4001')),
  0,
  'An outsider gets nothing'
);

SELECT * FROM finish();
ROLLBACK;
