-- Links between records and characters (Phase 2b step 3): GM-only table,
-- players read shown links whose two ends they can see, via ext_links_for.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(24);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lkgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ac1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lksam@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ac1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lkjo@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ac1004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lkout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000ac2001', 'Links', '00000000-0000-0000-0000-000000ac1001', 'ac200001'),
  ('00000000-0000-0000-0000-000000ac2002', 'Other campaign', '00000000-0000-0000-0000-000000ac1001', 'ac200002');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000ac2001', '00000000-0000-0000-0000-000000ac1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-000000ac2001', '00000000-0000-0000-0000-000000ac1002', 'Sam', now(), false),
  ('00000000-0000-0000-0000-000000ac2001', '00000000-0000-0000-0000-000000ac1003', 'Jo', now(), false);

-- Records: the morgue is shown to everyone, the glove to Sam only, the cult to nobody.
INSERT INTO ext_records (id, channel_id, kind, name, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ac3001', '00000000-0000-0000-0000-000000ac2001', 'location', 'Morgue', '00000000-0000-0000-0000-000000ac1001'),
  ('00000000-0000-0000-0000-000000ac3002', '00000000-0000-0000-0000-000000ac2001', 'clue', 'Bloody glove', '00000000-0000-0000-0000-000000ac1001'),
  ('00000000-0000-0000-0000-000000ac3003', '00000000-0000-0000-0000-000000ac2001', 'organisation', 'The Fellowship', '00000000-0000-0000-0000-000000ac1001'),
  ('00000000-0000-0000-0000-000000ac3009', '00000000-0000-0000-0000-000000ac2002', 'location', 'Elsewhere', '00000000-0000-0000-0000-000000ac1001');
SELECT set_config('ext.allow_record_visibility', 'on', true);
UPDATE ext_records SET visibility = 'players' WHERE id = '00000000-0000-0000-0000-000000ac3001';
UPDATE ext_records SET visibility = 'selected' WHERE id = '00000000-0000-0000-0000-000000ac3002';
SELECT set_config('ext.allow_record_visibility', '', true);
INSERT INTO ext_record_shares (record_id, user_id)
VALUES ('00000000-0000-0000-0000-000000ac3002', '00000000-0000-0000-0000-000000ac1002');

-- Characters: Kowalski is revealed, Hale is hidden.
INSERT INTO ext_characters (id, channel_id, kind, name, portrait_url, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ac4001', '00000000-0000-0000-0000-000000ac2001', 'npc', 'Kowalski', 'https://example.test/k.png', true, '00000000-0000-0000-0000-000000ac1001'),
  ('00000000-0000-0000-0000-000000ac4002', '00000000-0000-0000-0000-000000ac2001', 'npc', 'Dr Hale', NULL, false, '00000000-0000-0000-0000-000000ac1001');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- ===== GM: adding links ==========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ac1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ac1001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO ext_links (id, from_character_id, to_record_id, label, visibility, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac5001', '00000000-0000-0000-0000-000000ac4001', '00000000-0000-0000-0000-000000ac3001', 'works at', 'players',
            '00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000ac2001')$$,
  'GM links a character to a record'
);
SELECT lives_ok(
  $$INSERT INTO ext_links (id, from_record_id, to_record_id, label, visibility, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac5002', '00000000-0000-0000-0000-000000ac3002', '00000000-0000-0000-0000-000000ac3001', 'found at', 'players',
            '00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000ac2001')$$,
  'GM links two records'
);
-- Shown, but one end (the cult) is hidden from players.
SELECT lives_ok(
  $$INSERT INTO ext_links (id, from_character_id, to_record_id, label, visibility, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac5003', '00000000-0000-0000-0000-000000ac4001', '00000000-0000-0000-0000-000000ac3003', 'member of', 'players',
            '00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000ac2001')$$,
  'GM links to a hidden record'
);
-- GM only, between two visible ends.
SELECT lives_ok(
  $$INSERT INTO ext_links (id, from_record_id, to_character_id, label, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac5004', '00000000-0000-0000-0000-000000ac3001', '00000000-0000-0000-0000-000000ac4001', 'keeps a key for',
            '00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000ac2001')$$,
  'GM adds a GM-only link (the default)'
);
SELECT is(
  (SELECT visibility FROM ext_links WHERE id = '00000000-0000-0000-0000-000000ac5004'),
  'gm', 'New links are GM only unless shown'
);
SELECT is(
  (SELECT channel_id FROM ext_links WHERE id = '00000000-0000-0000-0000-000000ac5002'),
  '00000000-0000-0000-0000-000000ac2001'::uuid, 'The campaign comes from the ends'
);

SELECT throws_ok(
  $$INSERT INTO ext_links (from_record_id, to_record_id, label, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac3001', '00000000-0000-0000-0000-000000ac3009', 'near',
            '00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000ac2001')$$,
  'P0001', 'Both ends of a link must be in the same campaign',
  'Ends must be in the same campaign'
);
SELECT throws_ok(
  $$INSERT INTO ext_links (from_record_id, to_record_id, label, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac3001', '00000000-0000-0000-0000-000000ac3001', 'is',
            '00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000ac2001')$$,
  '23514', NULL,
  'A record cannot link to itself'
);
SELECT throws_ok(
  $$INSERT INTO ext_links (from_record_id, from_character_id, to_record_id, label, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac3002', '00000000-0000-0000-0000-000000ac4002', '00000000-0000-0000-0000-000000ac3001', 'x',
            '00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000ac2001')$$,
  '23514', NULL,
  'Each end is a character or a record, not both'
);
SELECT throws_ok(
  $$INSERT INTO ext_links (from_record_id, to_record_id, label, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac3002', '00000000-0000-0000-0000-000000ac3001', 'Found At',
            '00000000-0000-0000-0000-000000ac1001', '00000000-0000-0000-0000-000000ac2001')$$,
  '23505', NULL,
  'The same link with the same label cannot be added twice'
);

SELECT lives_ok(
  $$UPDATE ext_links SET label = 'deputy at' WHERE id = '00000000-0000-0000-0000-000000ac5001'$$,
  'GM edits a label'
);
SELECT throws_ok(
  $$UPDATE ext_links SET to_record_id = '00000000-0000-0000-0000-000000ac3002' WHERE id = '00000000-0000-0000-0000-000000ac5001'$$,
  'P0001', 'The ends of a link cannot change',
  'The ends of a link cannot be changed'
);

SELECT is(
  (SELECT count(*)::int FROM ext_links_for(p_record_id => '00000000-0000-0000-0000-000000ac3001')),
  3, 'GM sees every link of the morgue'
);
SELECT results_eq(
  $$SELECT label, outgoing, other_name, other_type, other_kind FROM ext_links_for(p_character_id => '00000000-0000-0000-0000-000000ac4001') ORDER BY label$$,
  $$VALUES ('deputy at', true, 'Morgue', 'record', 'location'),
           ('keeps a key for', false, 'Morgue', 'record', 'location'),
           ('member of', true, 'The Fellowship', 'record', 'organisation')$$,
  'Links show on both ends, with direction and the other end'
);
SELECT throws_ok(
  $$SELECT * FROM ext_links_for()$$,
  '22023', 'Give exactly one character or record',
  'ext_links_for needs exactly one subject'
);

-- ===== Sam: shown to them ========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ac1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ac1002","role":"authenticated"}', true);

SELECT is((SELECT count(*)::int FROM ext_links), 0, 'Players cannot read the links table');
SELECT results_eq(
  $$SELECT label, other_name FROM ext_links_for(p_record_id => '00000000-0000-0000-0000-000000ac3001') ORDER BY label$$,
  $$VALUES ('deputy at', 'Kowalski'), ('found at', 'Bloody glove')$$,
  'Sam sees shown links whose ends they can see (not GM-only ones)'
);
SELECT results_eq(
  $$SELECT label FROM ext_links_for(p_character_id => '00000000-0000-0000-0000-000000ac4001')$$,
  $$VALUES ('deputy at')$$,
  'A shown link to a hidden record stays hidden'
);
SELECT is(
  (SELECT count(*)::int FROM ext_links_for(p_record_id => '00000000-0000-0000-0000-000000ac3003')),
  0, 'Nothing about a record Sam cannot see'
);
SELECT throws_ok(
  $$INSERT INTO ext_links (from_record_id, to_record_id, label, created_by, channel_id)
    VALUES ('00000000-0000-0000-0000-000000ac3001', '00000000-0000-0000-0000-000000ac3002', 'next to',
            '00000000-0000-0000-0000-000000ac1002', '00000000-0000-0000-0000-000000ac2001')$$,
  '42501', NULL,
  'Players cannot add links'
);

-- ===== Jo: the glove is not shown to them ========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ac1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ac1003","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT label FROM ext_links_for(p_record_id => '00000000-0000-0000-0000-000000ac3001')$$,
  $$VALUES ('deputy at')$$,
  'Jo does not see the link to the glove'
);

-- ===== Outsider ==================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ac1004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ac1004","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM ext_links_for(p_record_id => '00000000-0000-0000-0000-000000ac3001')),
  0, 'Outsiders see no links'
);

-- ===== Archived campaigns and deletes ===========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ac1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ac1001","role":"authenticated"}', true);

RESET ROLE;
DELETE FROM ext_records WHERE id = '00000000-0000-0000-0000-000000ac3002';
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM ext_links WHERE id = '00000000-0000-0000-0000-000000ac5002'),
  0, 'Deleting a record removes its links'
);

RESET ROLE;
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-000000ac2001';
SET LOCAL ROLE authenticated;
WITH d AS (DELETE FROM ext_links WHERE id = '00000000-0000-0000-0000-000000ac5001' RETURNING 1)
SELECT is(count(*)::int, 0, 'Archived campaigns are read-only') FROM d;

SELECT * FROM finish();
ROLLBACK;
