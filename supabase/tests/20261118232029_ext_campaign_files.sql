-- Campaign files: GM-only management, per-file visibility (GM only / all
-- players / chosen players), versions, history, and the private bucket's
-- storage policies.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(26);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'filesgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'filessam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'filesjo@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d1004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'filesout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code, is_archived)
VALUES
  ('00000000-0000-0000-0000-0000000d2001', 'Files', '00000000-0000-0000-0000-0000000d1001', '0d200001', false),
  ('00000000-0000-0000-0000-0000000d2002', 'Other', '00000000-0000-0000-0000-0000000d1001', '0d200002', false),
  ('00000000-0000-0000-0000-0000000d2003', 'Archived', '00000000-0000-0000-0000-0000000d1001', '0d200003', true);

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1003', 'Jo', now(), false),
  ('00000000-0000-0000-0000-0000000d2003', '00000000-0000-0000-0000-0000000d1001', 'GM', now(), false);

-- Objects as Storage would record them after the GM's uploads.
INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
VALUES
  ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2001/a.pdf', '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1001', '{"mimetype":"application/pdf","size":1000}'),
  ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2001/b.png', '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1001', '{"mimetype":"image/png","size":2000}'),
  ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2001/c.pdf', '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1001', '{"mimetype":"application/pdf","size":3000}'),
  ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2001/d.pdf', '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1001', '{"mimetype":"application/pdf","size":4000}'),
  ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2001/e.txt', '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1001', '{"mimetype":"text/plain","size":10}'),
  ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2001/f.pdf', '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1001', '{"mimetype":"application/pdf","size":10}'),
  ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2002/g.pdf', '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1001', '{"mimetype":"application/pdf","size":10}'),
  ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2003/h.pdf', '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1001', '{"mimetype":"application/pdf","size":10}');

SELECT ok((SELECT NOT public FROM storage.buckets WHERE id = 'ext-campaign-files'), 'The campaign files bucket is private');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM ========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Map of Riverside', '', 'Maps', 'players', NULL,
      '00000000-0000-0000-0000-0000000d2001/a.pdf', 'riverside.pdf')$$,
  'GM adds a file for every player'
);
SELECT lives_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Autopsy photo', 'Found at the scene', 'Case files', 'selected',
      ARRAY['00000000-0000-0000-0000-0000000d1002'::uuid], '00000000-0000-0000-0000-0000000d2001/b.png', 'photo.png')$$,
  'GM adds a file for one chosen player'
);
SELECT lives_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Scenario notes', '', '', 'gm', NULL,
      '00000000-0000-0000-0000-0000000d2001/c.pdf', 'notes.pdf')$$,
  'GM adds a GM-only file'
);

SELECT throws_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Text', '', '', 'players', NULL,
      '00000000-0000-0000-0000-0000000d2001/e.txt', 'e.txt')$$,
  'P0001', 'Only PDF and image files (JPG, PNG, WebP, GIF) can be added',
  'Other file types are refused'
);
SELECT throws_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Nobody', '', '', 'selected', '{}',
      '00000000-0000-0000-0000-0000000d2001/f.pdf', 'f.pdf')$$,
  'P0001', 'Choose at least one player to share the file with',
  'Sharing with chosen players needs at least one player'
);
SELECT throws_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Outsider', '', '', 'selected',
      ARRAY['00000000-0000-0000-0000-0000000d1004'::uuid], '00000000-0000-0000-0000-0000000d2001/f.pdf', 'f.pdf')$$,
  'P0001', 'Files can only be shared with players in this campaign',
  'Files cannot be shared with people outside the campaign'
);
SELECT throws_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Wrong place', '', '', 'players', NULL,
      '00000000-0000-0000-0000-0000000d2002/g.pdf', 'g.pdf')$$,
  'P0001', 'The uploaded file is not in this campaign''s storage',
  'An upload from another campaign cannot be registered here'
);
SELECT throws_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Again', '', '', 'players', NULL,
      '00000000-0000-0000-0000-0000000d2001/a.pdf', 'a.pdf')$$,
  'P0001', 'That upload is already in use',
  'One upload cannot belong to two files'
);
SELECT throws_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2003', 'Late', '', '', 'players', NULL,
      '00000000-0000-0000-0000-0000000d2003/h.pdf', 'h.pdf')$$,
  'P0001', 'This campaign is archived',
  'Archived campaigns take no new files'
);

SELECT is(
  ext_replace_campaign_file((SELECT id FROM ext_campaign_files WHERE title = 'Map of Riverside'),
    '00000000-0000-0000-0000-0000000d2001/d.pdf', 'riverside-v2.pdf'),
  2, 'Replacing a file adds version 2'
);
SELECT is(
  (SELECT count(*)::int FROM ext_campaign_file_versions v JOIN ext_campaign_files f ON f.id = v.file_id WHERE f.title = 'Map of Riverside'),
  2, 'The earlier version is kept'
);

-- ===== Sam: the chosen player ====================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1002","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT title FROM ext_campaign_files ORDER BY title$$,
  $$VALUES ('Autopsy photo'::text), ('Map of Riverside'::text)$$,
  'Sam sees the file for everyone and the one shared with him, not the GM-only one'
);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'ext-campaign-files' AND name = '00000000-0000-0000-0000-0000000d2001/b.png'),
  1, 'Sam can open the stored file shared with him'
);
SELECT is_empty(
  $$SELECT 1 FROM storage.objects WHERE bucket_id = 'ext-campaign-files' AND name = '00000000-0000-0000-0000-0000000d2001/c.pdf'$$,
  'Sam cannot open the GM-only stored file'
);
SELECT is_empty($$SELECT 1 FROM ext_campaign_file_shares$$, 'Players cannot see who files are shared with');
SELECT is_empty($$SELECT 1 FROM ext_campaign_file_events$$, 'Players cannot see the file history');
SELECT throws_ok(
  $$SELECT ext_add_campaign_file('00000000-0000-0000-0000-0000000d2001', 'Mine', '', '', 'players', NULL,
      '00000000-0000-0000-0000-0000000d2001/f.pdf', 'f.pdf')$$,
  '42501', 'Only the GM can manage campaign files',
  'Players cannot add files'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES ('ext-campaign-files', '00000000-0000-0000-0000-0000000d2001/sam.pdf', '00000000-0000-0000-0000-0000000d1002', '{"mimetype":"application/pdf","size":10}')$$,
  '42501', NULL,
  'Players cannot upload to the campaign files bucket'
);

-- ===== Jo: a player the photo was not shared with ================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1003","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT title FROM ext_campaign_files$$,
  $$VALUES ('Map of Riverside'::text)$$,
  'Jo sees only the file for everyone'
);
SELECT is_empty(
  $$SELECT 1 FROM storage.objects WHERE bucket_id = 'ext-campaign-files' AND name = '00000000-0000-0000-0000-0000000d2001/b.png'$$,
  'Jo cannot open the photo shared only with Sam'
);

-- ===== Outsider ==================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1004","role":"authenticated"}', true);

SELECT is_empty($$SELECT 1 FROM ext_campaign_files$$, 'People outside the campaign see no files');

-- ===== GM: edit sharing, then delete =============================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1001","role":"authenticated"}', true);

SELECT ext_update_campaign_file((SELECT id FROM ext_campaign_files WHERE title = 'Autopsy photo'),
  'Autopsy photo (cropped)', 'Found at the scene', 'Case files', 'selected', ARRAY['00000000-0000-0000-0000-0000000d1003'::uuid]);

SELECT is(
  (SELECT details FROM ext_campaign_file_events WHERE kind = 'edited'),
  jsonb_build_object(
    'changes', jsonb_build_array(jsonb_build_object('field', 'title', 'from', 'Autopsy photo', 'to', 'Autopsy photo (cropped)')),
    'added', jsonb_build_array('00000000-0000-0000-0000-0000000d1003'),
    'removed', jsonb_build_array('00000000-0000-0000-0000-0000000d1002')),
  'Editing logs the title change and who gained and lost access'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1002","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT title FROM ext_campaign_files$$,
  $$VALUES ('Map of Riverside'::text)$$,
  'Sam loses access when the photo is shared with Jo instead'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1001","role":"authenticated"}', true);
SELECT is(
  (SELECT array_length(ext_delete_campaign_file((SELECT id FROM ext_campaign_files WHERE title = 'Map of Riverside')), 1)),
  2, 'Deleting a file returns both stored versions for removal'
);
SELECT is_empty($$SELECT 1 FROM ext_campaign_files WHERE title = 'Map of Riverside'$$, 'The deleted file is gone');

SELECT * FROM finish();
ROLLBACK;
