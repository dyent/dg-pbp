-- Source library: GM only, PDF only, nothing for players or outsiders.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(22);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000af1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'srcgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000af1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'srcsam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000af1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'srcout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000af2001', 'Sources', '00000000-0000-0000-0000-000000af1001', 'af200001'),
  ('00000000-0000-0000-0000-000000af2002', 'Other', '00000000-0000-0000-0000-000000af1003', 'af200002');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000af2001', '00000000-0000-0000-0000-000000af1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-000000af2001', '00000000-0000-0000-0000-000000af1002', 'Sam', now(), false);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES
  ('ext-sources', '00000000-0000-0000-0000-000000af2001/op.pdf', '00000000-0000-0000-0000-000000af1001', '{"mimetype":"application/pdf","size":5000}'),
  ('ext-sources', '00000000-0000-0000-0000-000000af2001/fake.pdf', '00000000-0000-0000-0000-000000af1001', '{"mimetype":"image/png","size":10}'),
  ('ext-sources', '00000000-0000-0000-0000-000000af2002/theirs.pdf', '00000000-0000-0000-0000-000000af1003', '{"mimetype":"application/pdf","size":10}');

SET LOCAL ROLE authenticated;

-- ===== GM =========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000af1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000af1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ext_add_source('00000000-0000-0000-0000-000000af2001', '  Last Things Last  ', '00000000-0000-0000-0000-000000af2001/op.pdf', 'last-things-last.pdf')$$,
  'GM registers an uploaded PDF'
);
SELECT is(
  (SELECT title || '|' || file_name || '|' || size_bytes FROM ext_sources WHERE object_path = '00000000-0000-0000-0000-000000af2001/op.pdf'),
  'Last Things Last|last-things-last.pdf|5000',
  'Title is trimmed; the size comes from Storage'
);
SELECT throws_ok(
  $$SELECT ext_add_source('00000000-0000-0000-0000-000000af2001', 'Again', '00000000-0000-0000-0000-000000af2001/op.pdf', 'x.pdf')$$,
  'P0001', 'That upload is already in use',
  'An upload is registered once'
);
SELECT throws_ok(
  $$SELECT ext_add_source('00000000-0000-0000-0000-000000af2001', 'Fake', '00000000-0000-0000-0000-000000af2001/fake.pdf', 'fake.pdf')$$,
  'P0001', 'Sources must be PDF files',
  'Only PDFs'
);
SELECT throws_ok(
  $$SELECT ext_add_source('00000000-0000-0000-0000-000000af2001', 'Missing', '00000000-0000-0000-0000-000000af2001/none.pdf', 'none.pdf')$$,
  'P0001', 'The uploaded file could not be found',
  'The upload must exist'
);
SELECT throws_ok(
  $$SELECT ext_add_source('00000000-0000-0000-0000-000000af2001', 'Theirs', '00000000-0000-0000-0000-000000af2002/theirs.pdf', 'theirs.pdf')$$,
  'P0001', 'The uploaded file is not in this campaign''s storage',
  'Another campaign''s upload cannot be registered'
);
SELECT lives_ok(
  $$SELECT ext_rename_source((SELECT id FROM ext_sources WHERE file_name = 'last-things-last.pdf'), 'Last Things Last (2nd ed.)')$$,
  'GM renames a source'
);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'ext-sources' AND name = '00000000-0000-0000-0000-000000af2001/op.pdf'),
  1, 'GM can open the stored PDF'
);
SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES ('ext-sources', '00000000-0000-0000-0000-000000af2001/new.pdf', '00000000-0000-0000-0000-000000af1001', '{"mimetype":"application/pdf","size":1}')$$,
  'GM can upload to the campaign''s sources'
);
SELECT throws_ok(
  $$SELECT ext_add_source('00000000-0000-0000-0000-000000af2001', '   ', '00000000-0000-0000-0000-000000af2001/new.pdf', 'x.pdf')$$,
  '23514', NULL,
  'A title is needed'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES ('ext-sources', '00000000-0000-0000-0000-000000af2002/mine.pdf', '00000000-0000-0000-0000-000000af1001', '{"mimetype":"application/pdf","size":1}')$$,
  '42501', NULL,
  'GM cannot upload into another campaign''s sources'
);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'ext-sources' AND name LIKE '00000000-0000-0000-0000-000000af2002/%'),
  0, 'GM cannot see another campaign''s PDFs'
);

-- ===== Player =======================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000af1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000af1002","role":"authenticated"}', true);

SELECT is_empty($$SELECT 1 FROM ext_sources$$, 'Players see no sources, not even titles');
SELECT is_empty(
  $$SELECT 1 FROM storage.objects WHERE bucket_id = 'ext-sources'$$,
  'Players cannot open source PDFs'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES ('ext-sources', '00000000-0000-0000-0000-000000af2001/sam.pdf', '00000000-0000-0000-0000-000000af1002', '{"mimetype":"application/pdf","size":1}')$$,
  '42501', NULL,
  'Players cannot upload sources'
);
SELECT throws_ok(
  $$SELECT ext_add_source('00000000-0000-0000-0000-000000af2001', 'Mine', '00000000-0000-0000-0000-000000af2001/new.pdf', 'new.pdf')$$,
  '42501', 'Only the GM can manage sources',
  'Players cannot register sources'
);
SELECT throws_ok(
  $$SELECT ext_delete_source((SELECT id FROM ext_sources LIMIT 1))$$,
  '42501', 'Only the GM can manage sources',
  'Players cannot delete sources'
);

-- ===== Outsider =====================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000af1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000af1003","role":"authenticated"}', true);
SELECT is_empty(
  $$SELECT 1 FROM ext_sources WHERE channel_id = '00000000-0000-0000-0000-000000af2001'$$,
  'An outsider sees nothing'
);

-- ===== Archived campaign, then deleting =============================================
RESET ROLE;
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-000000af2001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000af1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000af1001","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_rename_source((SELECT id FROM ext_sources WHERE file_name = 'last-things-last.pdf'), 'Nope')$$,
  'P0001', 'This campaign is archived',
  'Nothing changes in an archived campaign'
);
SELECT is(
  (SELECT count(*)::int FROM ext_sources WHERE channel_id = '00000000-0000-0000-0000-000000af2001'),
  1, 'but the GM can still read its sources'
);

RESET ROLE;
UPDATE channels SET is_archived = false WHERE id = '00000000-0000-0000-0000-000000af2001';
SET LOCAL ROLE authenticated;
SELECT is(
  ext_delete_source((SELECT id FROM ext_sources WHERE file_name = 'last-things-last.pdf')),
  '00000000-0000-0000-0000-000000af2001/op.pdf',
  'Deleting returns the stored PDF''s path for the app to remove'
);
SELECT is_empty($$SELECT 1 FROM ext_sources WHERE channel_id = '00000000-0000-0000-0000-000000af2001'$$, 'and the source is gone');

SELECT * FROM finish();
ROLLBACK;
