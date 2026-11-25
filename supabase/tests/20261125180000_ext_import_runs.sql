-- Import runs and suggestions: GM only to read, written by the server function.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(14);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000c1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imsam@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-0000000c2001', 'Imports', '00000000-0000-0000-0000-0000000c1001', 'c2000001');
INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c1002', 'Sam', now(), false);

INSERT INTO ext_sources (id, channel_id, title, object_path, file_name, size_bytes, created_by)
VALUES ('00000000-0000-0000-0000-0000000c3001', '00000000-0000-0000-0000-0000000c2001', 'Op', '00000000-0000-0000-0000-0000000c2001/op.pdf', 'op.pdf', 10, '00000000-0000-0000-0000-0000000c1001');

INSERT INTO ext_import_runs (id, channel_id, source_id, first_page, last_page, status, created_by, created_at)
VALUES
  ('00000000-0000-0000-0000-0000000c4001', '00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c3001', 12, 19, 'done', '00000000-0000-0000-0000-0000000c1001', now()),
  ('00000000-0000-0000-0000-0000000c4002', '00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c3001', 1, 2, 'running', '00000000-0000-0000-0000-0000000c1001', now()),
  ('00000000-0000-0000-0000-0000000c4003', '00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c3001', 3, 4, 'running', '00000000-0000-0000-0000-0000000c1001', now() - interval '20 minutes');
INSERT INTO ext_import_suggestions (run_id, channel_id, kind, name, page, details)
VALUES ('00000000-0000-0000-0000-0000000c4001', '00000000-0000-0000-0000-0000000c2001', 'npc', 'Dr Hale', 14, '{"description":"The coroner."}');

SELECT throws_ok(
  $$INSERT INTO ext_import_runs (channel_id, source_id, first_page, last_page) VALUES ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c3001', 1, 31)$$,
  '23514', NULL, 'A run covers at most 30 pages'
);
SELECT throws_ok(
  $$INSERT INTO ext_import_runs (channel_id, source_id, first_page, last_page) VALUES ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c3001', 5, 4)$$,
  '23514', NULL, 'The range must run forwards'
);
SELECT throws_ok(
  $$INSERT INTO ext_import_suggestions (run_id, channel_id, kind, name) VALUES ('00000000-0000-0000-0000-0000000c4001', '00000000-0000-0000-0000-0000000c2001', 'spell', 'x')$$,
  '23514', NULL, 'Only known kinds of suggestion'
);

SET LOCAL ROLE authenticated;

-- ===== GM =========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1001","role":"authenticated"}', true);

SELECT is((SELECT count(*)::int FROM ext_import_runs), 3, 'GM reads the runs');
SELECT is((SELECT name FROM ext_import_suggestions), 'Dr Hale', 'GM reads the suggestions');
SELECT throws_ok(
  $$INSERT INTO ext_import_runs (channel_id, source_id, first_page, last_page) VALUES ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000c3001', 1, 2)$$,
  '42501', NULL, 'GM cannot write runs directly (the server function does)'
);
SELECT throws_ok(
  $$UPDATE ext_import_suggestions SET status = 'approved'$$,
  '42501', NULL, 'or change suggestions directly'
);
SELECT throws_ok(
  $$SELECT ext_delete_import_run('00000000-0000-0000-0000-0000000c4002')$$,
  'P0001', 'This import is still running', 'A run in progress cannot be deleted'
);
SELECT lives_ok($$SELECT ext_delete_import_run('00000000-0000-0000-0000-0000000c4003')$$, 'A run stuck for over 15 minutes can be');
SELECT lives_ok($$SELECT ext_delete_import_run('00000000-0000-0000-0000-0000000c4001')$$, 'GM deletes a finished run');
SELECT is((SELECT count(*)::int FROM ext_import_suggestions), 0, 'and its suggestions go with it');

-- ===== Player ======================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1002","role":"authenticated"}', true);

SELECT is_empty($$SELECT 1 FROM ext_import_runs$$, 'Players see no runs');
SELECT is_empty($$SELECT 1 FROM ext_import_suggestions$$, 'or suggestions');
SELECT throws_ok(
  $$SELECT ext_delete_import_run('00000000-0000-0000-0000-0000000c4002')$$,
  '42501', 'Only the GM can manage imports', 'Players cannot delete runs'
);

SELECT * FROM finish();
ROLLBACK;
