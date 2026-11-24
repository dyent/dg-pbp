-- Link history on both ends, and reversing links (GM only).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(17);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000ad1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lhgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000ad1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lhsam@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000ad2001', 'Link history', '00000000-0000-0000-0000-000000ad1001', 'ad200001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000ad2001', '00000000-0000-0000-0000-000000ad1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-000000ad2001', '00000000-0000-0000-0000-000000ad1002', 'Sam', now(), false);

INSERT INTO ext_records (id, channel_id, kind, name, created_by)
VALUES
  ('00000000-0000-0000-0000-000000ad3001', '00000000-0000-0000-0000-000000ad2001', 'organisation', 'The Fellowship', '00000000-0000-0000-0000-000000ad1001'),
  ('00000000-0000-0000-0000-000000ad3002', '00000000-0000-0000-0000-000000ad2001', 'location', 'Morgue', '00000000-0000-0000-0000-000000ad1001');

INSERT INTO ext_characters (id, channel_id, kind, name, revealed, created_by)
VALUES ('00000000-0000-0000-0000-000000ad4001', '00000000-0000-0000-0000-000000ad2001', 'npc', 'Dr Hale', true, '00000000-0000-0000-0000-000000ad1001');

INSERT INTO ext_records (id, channel_id, kind, name, created_by)
VALUES ('00000000-0000-0000-0000-000000ad3003', '00000000-0000-0000-0000-000000ad2001', 'location', 'Motel', '00000000-0000-0000-0000-000000ad1001');
INSERT INTO ext_links (id, from_record_id, to_character_id, label, created_by, channel_id)
VALUES ('00000000-0000-0000-0000-000000ad5005', '00000000-0000-0000-0000-000000ad3003', '00000000-0000-0000-0000-000000ad4001', 'stays at',
        '00000000-0000-0000-0000-000000ad1001', '00000000-0000-0000-0000-000000ad2001');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1001","role":"authenticated"}', true);

-- The wrong way round: "The Fellowship — works for → Dr Hale".
INSERT INTO ext_links (id, from_record_id, to_character_id, label, created_by, channel_id)
VALUES ('00000000-0000-0000-0000-000000ad5001', '00000000-0000-0000-0000-000000ad3001', '00000000-0000-0000-0000-000000ad4001', 'works for',
        '00000000-0000-0000-0000-000000ad1001', '00000000-0000-0000-0000-000000ad2001');

-- ===== Adding writes to both ends ==================================================
SELECT is(
  (SELECT details FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-000000ad3001' AND event_type = 'link_added'),
  '{"from": "The Fellowship", "to": "Dr Hale", "label": "works for", "visibility": "gm"}'::jsonb,
  'Adding a link writes the record history, with names'
);
SELECT is(
  (SELECT count(*)::int FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-000000ad4001' AND event_type = 'link_added' AND visibility = 'gm'
     AND actor_id = '00000000-0000-0000-0000-000000ad1001'),
  1,
  'Adding a link writes the character history (GM only, with the GM as actor)'
);

-- ===== Reversing ===================================================================
SELECT lives_ok(
  $$SELECT ext_reverse_link('00000000-0000-0000-0000-000000ad5001')$$,
  'GM reverses a link'
);
SELECT ok(
  (SELECT from_character_id = '00000000-0000-0000-0000-000000ad4001' AND to_record_id = '00000000-0000-0000-0000-000000ad3001'
          AND from_record_id IS NULL AND to_character_id IS NULL AND label = 'works for'
   FROM ext_links WHERE id = '00000000-0000-0000-0000-000000ad5001'),
  'The ends are swapped; the label and id stay'
);
SELECT is(
  (SELECT details FROM ext_character_events WHERE character_id = '00000000-0000-0000-0000-000000ad4001' AND event_type = 'link_reversed'),
  '{"from": "Dr Hale", "to": "The Fellowship", "label": "works for", "visibility": "gm"}'::jsonb,
  'Reversing is written to the history with the new direction'
);
SELECT is(
  (SELECT count(*)::int FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-000000ad3001' AND event_type = 'link_reversed'),
  1,
  'Reversing is written to the other end too'
);
SELECT throws_ok(
  $$UPDATE ext_links SET to_record_id = '00000000-0000-0000-0000-000000ad3002' WHERE id = '00000000-0000-0000-0000-000000ad5001'$$,
  'P0001', 'The ends of a link cannot change',
  'Any other change of ends is still refused'
);

-- Reversing onto an existing link with the same label is refused.
INSERT INTO ext_links (id, from_record_id, to_character_id, label, created_by, channel_id)
VALUES ('00000000-0000-0000-0000-000000ad5002', '00000000-0000-0000-0000-000000ad3001', '00000000-0000-0000-0000-000000ad4001', 'works for',
        '00000000-0000-0000-0000-000000ad1001', '00000000-0000-0000-0000-000000ad2001');
SELECT throws_ok(
  $$SELECT ext_reverse_link('00000000-0000-0000-0000-000000ad5002')$$,
  '23505', NULL,
  'Reversing into a duplicate link is refused'
);
DELETE FROM ext_links WHERE id = '00000000-0000-0000-0000-000000ad5002';

-- ===== Relabelling, showing, removing =================================================
UPDATE ext_links SET label = 'is paid by' WHERE id = '00000000-0000-0000-0000-000000ad5001';
SELECT is(
  (SELECT details->>'old_label' || ' > ' || (details->>'label') FROM ext_record_events
   WHERE record_id = '00000000-0000-0000-0000-000000ad3001' AND event_type = 'link_changed'),
  'works for > is paid by',
  'Relabelling records the old and new label'
);
UPDATE ext_links SET visibility = 'players' WHERE id = '00000000-0000-0000-0000-000000ad5001';
SELECT is(
  (SELECT count(*)::int FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-000000ad4001' AND event_type = 'link_changed'
     AND details->>'old_visibility' = 'gm' AND details->>'visibility' = 'players'),
  1,
  'Showing a link records the change of visibility'
);
UPDATE ext_links SET visibility = 'players' WHERE id = '00000000-0000-0000-0000-000000ad5001';
SELECT is(
  (SELECT count(*)::int FROM ext_character_events WHERE character_id = '00000000-0000-0000-0000-000000ad4001' AND event_type = 'link_changed'),
  2,
  'An update that changes nothing writes nothing'
);
DELETE FROM ext_links WHERE id = '00000000-0000-0000-0000-000000ad5001';
SELECT is(
  (SELECT count(*)::int FROM ext_record_events WHERE record_id = '00000000-0000-0000-0000-000000ad3001' AND event_type = 'link_removed'),
  2,
  'Removing a link writes the history (here: the duplicate and the original)'
);

-- ===== Deleting an end: only the survivor gets the entry ==============================
INSERT INTO ext_links (id, from_record_id, to_character_id, label, created_by, channel_id)
VALUES ('00000000-0000-0000-0000-000000ad5003', '00000000-0000-0000-0000-000000ad3002', '00000000-0000-0000-0000-000000ad4001', 'stored in',
        '00000000-0000-0000-0000-000000ad1001', '00000000-0000-0000-0000-000000ad2001');
SELECT lives_ok(
  $$DELETE FROM ext_records WHERE id = '00000000-0000-0000-0000-000000ad3002'$$,
  'Deleting a linked record still works'
);
SELECT is(
  (SELECT details->>'from' FROM ext_character_events
   WHERE character_id = '00000000-0000-0000-0000-000000ad4001' AND event_type = 'link_removed' AND details->>'label' = 'stored in'),
  NULL,
  'The survivor gets a removal entry; the deleted end has no name'
);

-- ===== Players ========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1002","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT ext_reverse_link('00000000-0000-0000-0000-000000ad5005')$$,
  'P0002', 'Link not found',
  'A player cannot reverse links'
);
SELECT is(
  (SELECT count(*)::int FROM ext_character_events WHERE event_type LIKE 'link_%'),
  0,
  'Players read no link history'
);

-- ===== Archived campaigns ===============================================================
RESET ROLE;
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-000000ad2001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000ad1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ad1001","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT ext_reverse_link('00000000-0000-0000-0000-000000ad5005')$$,
  'P0001', 'This campaign is archived',
  'Links in an archived campaign cannot be reversed'
);

SELECT * FROM finish();
ROLLBACK;
