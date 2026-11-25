-- Files on records (GM attaches; players see what they may see), clue
-- checklists and handout attachments from imports.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(17);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rfgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rfsam@test.com', '', now(), '{}', '{}', now(), now());
INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-0000000e2001', 'Files', '00000000-0000-0000-0000-0000000e1001', 'e2000001'),
  ('00000000-0000-0000-0000-0000000e2002', 'Other', '00000000-0000-0000-0000-0000000e1001', 'e2000002');
INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1002', 'Sam', now(), false);

-- The glove is shown to everyone; the cult is hidden.
INSERT INTO ext_records (id, channel_id, kind, name, created_by) VALUES
  ('00000000-0000-0000-0000-0000000e3001', '00000000-0000-0000-0000-0000000e2001', 'clue', 'Muddy glove', '00000000-0000-0000-0000-0000000e1001'),
  ('00000000-0000-0000-0000-0000000e3002', '00000000-0000-0000-0000-0000000e2001', 'organisation', 'Quarry Brethren', '00000000-0000-0000-0000-0000000e1001');
SELECT set_config('ext.allow_record_visibility', 'on', true);
UPDATE ext_records SET visibility = 'players' WHERE id = '00000000-0000-0000-0000-0000000e3001';
SELECT set_config('ext.allow_record_visibility', '', true);

-- The letter is shared with everyone, the map is GM only, one file is elsewhere.
INSERT INTO ext_campaign_files (id, channel_id, title, visibility, created_by) VALUES
  ('00000000-0000-0000-0000-0000000e4001', '00000000-0000-0000-0000-0000000e2001', 'Ortiz letter', 'players', '00000000-0000-0000-0000-0000000e1001'),
  ('00000000-0000-0000-0000-0000000e4002', '00000000-0000-0000-0000-0000000e2001', 'Quarry map', 'gm', '00000000-0000-0000-0000-0000000e1001'),
  ('00000000-0000-0000-0000-0000000e4003', '00000000-0000-0000-0000-0000000e2002', 'Elsewhere', 'gm', '00000000-0000-0000-0000-0000000e1001');

INSERT INTO ext_sources (id, channel_id, title, object_path, file_name, size_bytes, created_by)
VALUES ('00000000-0000-0000-0000-0000000e5001', '00000000-0000-0000-0000-0000000e2001', 'Silent Creek', '00000000-0000-0000-0000-0000000e2001/op.pdf', 'op.pdf', 10, '00000000-0000-0000-0000-0000000e1001');
INSERT INTO ext_import_runs (id, channel_id, source_id, first_page, last_page, status, created_by)
VALUES ('00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e5001', 1, 3, 'done', '00000000-0000-0000-0000-0000000e1001');
INSERT INTO ext_import_suggestions (id, run_id, channel_id, kind, name, page, details) VALUES
  ('00000000-0000-0000-0000-0000000e7001', '00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e2001', 'clue', 'Quarry stamp', 2,
   '{"summary":"A stamp on the glove.","checklist":["The glove came from the quarry company","Someone at the quarry knew a hiker"]}'),
  ('00000000-0000-0000-0000-0000000e7002', '00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e2001', 'clue', 'Glove again', 2,
   '{"checklist":["the glove came from the quarry company","Hale handled the glove"]}'),
  ('00000000-0000-0000-0000-0000000e7003', '00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e2001', 'handout', 'Ortiz letter', 3,
   '{"handout":{"firstPage":3,"lastPage":3},"relatedTo":"muddy glove"}'),
  ('00000000-0000-0000-0000-0000000e7004', '00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e2001', 'handout', 'Loose page', 3,
   '{"handout":{"firstPage":3,"lastPage":3},"relatedTo":"Nothing by this name"}');

SET LOCAL ROLE authenticated;

-- ===== GM ==========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO ext_record_files (record_id, file_id, channel_id, created_by) VALUES
    ('00000000-0000-0000-0000-0000000e3001', '00000000-0000-0000-0000-0000000e4002', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001'),
    ('00000000-0000-0000-0000-0000000e3002', '00000000-0000-0000-0000-0000000e4001', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001')$$,
  'GM attaches files to records'
);
SELECT throws_ok(
  $$INSERT INTO ext_record_files (record_id, file_id, channel_id, created_by) VALUES
    ('00000000-0000-0000-0000-0000000e3001', '00000000-0000-0000-0000-0000000e4003', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001')$$,
  'P0001', 'The file and the record must be in the same campaign',
  'A file from another campaign cannot be attached'
);
SELECT throws_ok(
  $$INSERT INTO ext_record_files (record_id, file_id, channel_id, created_by) VALUES
    ('00000000-0000-0000-0000-0000000e3001', '00000000-0000-0000-0000-0000000e4002', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1001')$$,
  '23505', NULL, 'The same file is attached once'
);
SELECT is((SELECT count(*)::int FROM ext_record_files_for('00000000-0000-0000-0000-0000000e3001')), 1, 'GM sees the GM-only map on the glove');

-- Clue checklists from imports
SELECT lives_ok($$SELECT ext_approve_suggestion('00000000-0000-0000-0000-0000000e7001')$$, 'Approving a clue');
SELECT is(
  (SELECT string_agg(p.body, ' | ' ORDER BY p.sort_order) FROM ext_clue_points p JOIN ext_records r ON r.id = p.record_id WHERE r.name = 'Quarry stamp'),
  'The glove came from the quarry company | Someone at the quarry knew a hiker',
  'creates its GM checklist'
);
SELECT is(
  ext_merge_suggestion('00000000-0000-0000-0000-0000000e7002', p_record_id => (SELECT id FROM ext_records WHERE name = 'Quarry stamp')),
  1, 'Merging a clue adds only checklist points that are new'
);
SELECT is(
  (SELECT count(*)::int FROM ext_clue_points p JOIN ext_records r ON r.id = p.record_id WHERE r.name = 'Quarry stamp'), 3,
  'so the clue has three points'
);

-- Handouts attach to the record they belong to
SELECT is(
  ext_finish_handout_suggestion('00000000-0000-0000-0000-0000000e7003', '00000000-0000-0000-0000-0000000e4001'),
  'Muddy glove', 'A handout attaches to its record (any case) and says which'
);
SELECT ok(
  EXISTS (SELECT 1 FROM ext_record_files WHERE record_id = '00000000-0000-0000-0000-0000000e3001' AND file_id = '00000000-0000-0000-0000-0000000e4001'),
  'the letter is now on the glove'
);
SELECT is(
  ext_finish_handout_suggestion('00000000-0000-0000-0000-0000000e7004', '00000000-0000-0000-0000-0000000e4002'),
  NULL, 'With no record of that name it attaches nowhere'
);
SELECT is(
  (SELECT details->>'attachedTo' FROM ext_import_suggestions WHERE id = '00000000-0000-0000-0000-0000000e7003'),
  'Muddy glove', 'The suggestion remembers where its file went'
);

-- ===== Player ======================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1002","role":"authenticated"}', true);

SELECT is(
  (SELECT string_agg(title, ',') FROM ext_record_files_for('00000000-0000-0000-0000-0000000e3001')),
  'Ortiz letter', 'Sam sees the shared letter on the shown glove, not the GM-only map'
);
SELECT is(
  (SELECT count(*)::int FROM ext_record_files_for('00000000-0000-0000-0000-0000000e3002')), 0,
  'and nothing on a hidden record, even a shared file'
);
SELECT is_empty($$SELECT 1 FROM ext_record_files$$, 'Players cannot read the attachments table');
SELECT throws_ok(
  $$INSERT INTO ext_record_files (record_id, file_id, channel_id, created_by) VALUES
    ('00000000-0000-0000-0000-0000000e3002', '00000000-0000-0000-0000-0000000e4002', '00000000-0000-0000-0000-0000000e2001', '00000000-0000-0000-0000-0000000e1002')$$,
  '42501', NULL, 'Players cannot attach files'
);

-- ===== Archived ====================================================================
RESET ROLE;
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-0000000e2001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1001","role":"authenticated"}', true);
WITH d AS (DELETE FROM ext_record_files RETURNING 1)
SELECT is(count(*)::int, 0, 'Nothing can be detached in an archived campaign') FROM d;

SELECT * FROM finish();
ROLLBACK;
