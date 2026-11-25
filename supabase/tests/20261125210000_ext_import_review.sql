-- Reviewing import suggestions: approve, merge, reject, handouts; source vs canon.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(26);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rvgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rvsam@test.com', '', now(), '{}', '{}', now(), now());
INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-0000000d2001', 'Review', '00000000-0000-0000-0000-0000000d1001', 'd2000001'),
  ('00000000-0000-0000-0000-0000000d2002', 'Elsewhere', '00000000-0000-0000-0000-0000000d1001', 'd2000002');
INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d1002', 'Sam', now(), false);

INSERT INTO ext_sources (id, channel_id, title, object_path, file_name, size_bytes, created_by)
VALUES ('00000000-0000-0000-0000-0000000d3001', '00000000-0000-0000-0000-0000000d2001', 'Silent Creek', '00000000-0000-0000-0000-0000000d2001/op.pdf', 'op.pdf', 10, '00000000-0000-0000-0000-0000000d1001');
INSERT INTO ext_import_runs (id, channel_id, source_id, first_page, last_page, status, created_by)
VALUES ('00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d3001', 1, 12, 'done', '00000000-0000-0000-0000-0000000d1001');

INSERT INTO ext_import_suggestions (id, run_id, channel_id, kind, name, page, details) VALUES
  ('00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', 'npc', 'Dr Ada Hale', 2,
   '{"summary":"The county coroner.","pages":[2,11],"fields":[{"key":"appearance","label":"Appearance","value":"Grey wool suit."},{"key":"secrets","label":"Secrets","value":"In the cult."},{"key":"stats","label":"Statistics (from the book)","value":"STR 9 CON 10"}]}'),
  ('00000000-0000-0000-0000-0000000d5002', '00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', 'location', 'County morgue', 2,
   '{"summary":"Basement of the clinic.","fields":[{"key":"address","label":"Address / where","value":"Pine Street"}]}'),
  ('00000000-0000-0000-0000-0000000d5003', '00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', 'link', 'works at', 2,
   '{"link":{"from":"Dr Ada Hale","to":"County morgue","label":"works at"}}'),
  ('00000000-0000-0000-0000-0000000d5004', '00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', 'link', 'guards', 2,
   '{"link":{"from":"Deputy Kowalski","to":"County morgue","label":"guards"}}'),
  ('00000000-0000-0000-0000-0000000d5005', '00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', 'npc', 'Hale', 11,
   '{"fields":[{"key":"appearance","label":"Appearance","value":"Tall."},{"key":"personality","label":"Personality","value":"Calm."}]}'),
  ('00000000-0000-0000-0000-0000000d5006', '00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', 'handout', 'Letter', 3,
   '{"handout":{"firstPage":3,"lastPage":3}}'),
  ('00000000-0000-0000-0000-0000000d5007', '00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d2001', 'clue', 'Muddy glove', 2, '{}');

-- An NPC the GM already wrote, to merge into.
INSERT INTO ext_characters (id, channel_id, kind, name, revealed, created_by)
VALUES ('00000000-0000-0000-0000-0000000d6001', '00000000-0000-0000-0000-0000000d2001', 'npc', 'Old Hale', false, '00000000-0000-0000-0000-0000000d1001');
UPDATE ext_character_fields SET body = 'My own words.' WHERE character_id = '00000000-0000-0000-0000-0000000d6001' AND field_key = 'appearance';

INSERT INTO ext_campaign_files (id, channel_id, title, created_by) VALUES
  ('00000000-0000-0000-0000-0000000d7001', '00000000-0000-0000-0000-0000000d2001', 'Letter', '00000000-0000-0000-0000-0000000d1001'),
  ('00000000-0000-0000-0000-0000000d7002', '00000000-0000-0000-0000-0000000d2002', 'Other', '00000000-0000-0000-0000-0000000d1001');

SELECT lives_ok(
  $$INSERT INTO ext_import_runs (channel_id, source_id, first_page, last_page) VALUES ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d3001', 1, 30)$$,
  'A run may now cover up to 30 pages'
);
SELECT throws_ok(
  $$INSERT INTO ext_import_runs (channel_id, source_id, first_page, last_page) VALUES ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d3001', 1, 31)$$,
  '23514', NULL, 'but not more'
);

SET LOCAL ROLE authenticated;

-- ===== Player: no access ===========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1002","role":"authenticated"}', true);
SELECT throws_ok($$SELECT ext_approve_suggestion('00000000-0000-0000-0000-0000000d5001')$$, '42501', 'Only the GM can review imports', 'Players cannot approve');
SELECT throws_ok($$SELECT ext_set_suggestion_rejected('00000000-0000-0000-0000-0000000d5001', true)$$, '42501', 'Only the GM can review imports', 'or reject');

-- ===== GM ==========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1001","role":"authenticated"}', true);

-- Approving an NPC
SELECT is(
  (ext_approve_suggestion('00000000-0000-0000-0000-0000000d5001'))->>'type', 'character', 'Approving an NPC suggestion creates a character'
);
SELECT ok(
  (SELECT kind = 'npc' AND NOT revealed AND provenance = 'source' FROM ext_characters WHERE name = 'Dr Ada Hale'),
  'a hidden NPC labelled source'
);
SELECT is(
  (SELECT f.body || '|' || f.provenance FROM ext_character_fields f JOIN ext_characters c ON c.id = f.character_id WHERE c.name = 'Dr Ada Hale' AND f.field_key = 'appearance'),
  'Grey wool suit.|source', 'standard fields are filled and labelled source'
);
SELECT is(
  (SELECT f.body FROM ext_character_fields f JOIN ext_characters c ON c.id = f.character_id WHERE c.name = 'Dr Ada Hale' AND f.field_key = 'background'),
  'The county coroner.', 'the summary fills the background'
);
SELECT is(
  (SELECT f.visibility || '|' || f.body FROM ext_character_fields f JOIN ext_characters c ON c.id = f.character_id WHERE c.name = 'Dr Ada Hale' AND f.label = 'Statistics (from the book)'),
  'gm|STR 9 CON 10', 'other keys become GM-only extra fields'
);
SELECT is(
  (SELECT f.body FROM ext_character_fields f JOIN ext_characters c ON c.id = f.character_id WHERE c.name = 'Dr Ada Hale' AND f.label = 'From the book'),
  'Silent Creek, p. 2, 11', 'a GM-only field says where it came from'
);
SELECT is(
  (SELECT status || '|' || (details->'created'->>'type') FROM ext_import_suggestions WHERE id = '00000000-0000-0000-0000-0000000d5001'),
  'approved|character', 'the suggestion is marked approved, with what it created'
);
SELECT throws_ok($$SELECT ext_approve_suggestion('00000000-0000-0000-0000-0000000d5001')$$, 'P0001', 'This suggestion has already been dealt with', 'It cannot be approved twice');

-- Editing a source field makes it canon
UPDATE ext_character_fields SET body = 'Charcoal suit.'
  WHERE field_key = 'appearance' AND character_id = (SELECT id FROM ext_characters WHERE name = 'Dr Ada Hale');
SELECT is(
  (SELECT provenance FROM ext_character_fields WHERE field_key = 'appearance' AND character_id = (SELECT id FROM ext_characters WHERE name = 'Dr Ada Hale')),
  'canon', 'Editing a source field makes it canon'
);

-- A record, edited before approval
SELECT lives_ok(
  $$SELECT ext_approve_suggestion('00000000-0000-0000-0000-0000000d5002', 'The morgue', '[{"key":"address","label":"Address / where","value":"12 Pine Street"}]')$$,
  'GM approves a record with an edited name and fields'
);
SELECT is(
  (SELECT r.provenance || '|' || r.visibility || '|' || f.body FROM ext_records r JOIN ext_record_fields f ON f.record_id = r.id AND f.field_key = 'address' WHERE r.name = 'The morgue'),
  'source|gm|12 Pine Street', 'a GM-only record labelled source, with the edited text'
);

-- Links need both ends; the record was renamed, so the link can't find "County morgue"
SELECT throws_ok($$SELECT ext_approve_suggestion('00000000-0000-0000-0000-0000000d5003')$$, 'P0001', 'Add or approve "County morgue" first', 'A link waits for both ends');
RESET ROLE;
UPDATE ext_records SET name = 'County morgue' WHERE name = 'The morgue';
SET LOCAL ROLE authenticated;
SELECT is((ext_approve_suggestion('00000000-0000-0000-0000-0000000d5003'))->>'type', 'link', 'With both ends there, the link is made');
SELECT ok(
  (SELECT label = 'works at' AND visibility = 'gm' FROM ext_links WHERE from_character_id = (SELECT id FROM ext_characters WHERE name = 'Dr Ada Hale')),
  'a GM-only link from the NPC to the record'
);
SELECT throws_ok($$SELECT ext_approve_suggestion('00000000-0000-0000-0000-0000000d5004')$$, 'P0001', 'Add or approve "Deputy Kowalski" first', 'A missing end is named');

-- Merging into the GM's own NPC fills only empty fields
SELECT is(ext_merge_suggestion('00000000-0000-0000-0000-0000000d5005', p_character_id => '00000000-0000-0000-0000-0000000d6001'), 1, 'Merging fills one empty field');
SELECT is(
  (SELECT string_agg(field_key || '=' || body, ';' ORDER BY field_key) FROM ext_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000d6001' AND field_key IN ('appearance', 'personality')),
  'appearance=My own words.;personality=Calm.', 'and never overwrites the GM''s words'
);
SELECT throws_ok(
  $$SELECT ext_merge_suggestion('00000000-0000-0000-0000-0000000d5007', p_record_id => (SELECT id FROM ext_records WHERE name = 'County morgue'))$$,
  'P0001', 'Choose a record of the same kind to merge into', 'A clue cannot merge into a location'
);

-- Rejecting and taking it back
SELECT lives_ok($$SELECT ext_set_suggestion_rejected('00000000-0000-0000-0000-0000000d5007', true)$$, 'GM rejects a suggestion');
SELECT lives_ok($$SELECT ext_set_suggestion_rejected('00000000-0000-0000-0000-0000000d5007', false)$$, 'and takes it back');

-- Handouts
SELECT throws_ok(
  $$SELECT ext_finish_handout_suggestion('00000000-0000-0000-0000-0000000d5006', '00000000-0000-0000-0000-0000000d7002')$$,
  'P0001', 'That file is not in this campaign', 'A handout must point at this campaign''s file'
);
SELECT lives_ok(
  $$SELECT ext_finish_handout_suggestion('00000000-0000-0000-0000-0000000d5006', '00000000-0000-0000-0000-0000000d7001')$$,
  'GM records the handout''s new file'
);

SELECT * FROM finish();
ROLLBACK;
