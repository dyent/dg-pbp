-- DG Phase 2a step 1: characters, per-field visibility, automatic history.
-- Covers: GM-only table access, the player projection, per-field and per-event
-- visibility, reveal/hide, status visibility, guards (immutable columns, kind,
-- locked Handler notes, URL scheme, aliases), archived read-only, blocked and
-- outside users, cascades.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(44);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000d6001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dghandler@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d6002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dgplayer1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d6003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dgplayer2@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000d6004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dgoutsider@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code, is_archived)
VALUES
  ('00000000-0000-0000-0000-0000000d7001', 'DG Campaign', '00000000-0000-0000-0000-0000000d6001', '0d700001', false),
  ('00000000-0000-0000-0000-0000000d7002', 'DG Archived', '00000000-0000-0000-0000-0000000d6001', '0d700002', true);

INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-0000000d7001', '00000000-0000-0000-0000-0000000d6001', 'Handler'),
  ('00000000-0000-0000-0000-0000000d7001', '00000000-0000-0000-0000-0000000d6002', 'Reyes'),
  ('00000000-0000-0000-0000-0000000d7001', '00000000-0000-0000-0000-0000000d6003', 'Okafor'),
  ('00000000-0000-0000-0000-0000000d7002', '00000000-0000-0000-0000-0000000d6001', 'Handler');

-- A character in the archived campaign, created before it was archived.
INSERT INTO dg_characters (id, channel_id, kind, name, created_by)
VALUES ('00000000-0000-0000-0000-0000000d8009', '00000000-0000-0000-0000-0000000d7002', 'npc', 'Old Contact', '00000000-0000-0000-0000-0000000d6001');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ===== Handler creates characters ===========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO dg_characters (id, channel_id, kind, name, revealed, created_by)
    VALUES ('00000000-0000-0000-0000-0000000d8001', '00000000-0000-0000-0000-0000000d7001', 'agent', 'Agent Reyes', true, '00000000-0000-0000-0000-0000000d6001')$$,
  'the Handler creates a revealed agent'
);

SELECT lives_ok(
  $$INSERT INTO dg_characters (id, channel_id, kind, name, aliases, created_by)
    VALUES ('00000000-0000-0000-0000-0000000d8002', '00000000-0000-0000-0000-0000000d7001', 'npc', 'Dr Margaret Hale', ARRAY['Hale', 'the coroner'], '00000000-0000-0000-0000-0000000d6001')$$,
  'the Handler creates a hidden NPC with aliases'
);

SELECT is(
  (SELECT count(*) FROM dg_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000d8001'),
  9::bigint,
  'a new character gets the nine standard profile fields'
);

SELECT is(
  (SELECT count(*) FROM dg_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND visibility = 'agents'),
  6::bigint,
  'an agent starts with six agent-visible descriptive fields'
);

SELECT is(
  (SELECT count(*) FROM dg_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND visibility = 'agents'),
  0::bigint,
  'an NPC starts with every field Handler-only'
);

SELECT is(
  (SELECT count(*) FROM dg_character_events
   WHERE channel_id = '00000000-0000-0000-0000-0000000d7001' AND event_type = 'created'),
  2::bigint,
  'creating characters logs a created event for each'
);

SELECT is(
  (SELECT channel_id FROM dg_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND field_key = 'occupation'),
  '00000000-0000-0000-0000-0000000d7001'::uuid,
  'fields carry their character''s campaign'
);

SELECT lives_ok(
  $$INSERT INTO dg_character_fields (character_id, channel_id, label, body, visibility)
    VALUES ('00000000-0000-0000-0000-0000000d8002', '00000000-0000-0000-0000-0000000d7002', 'Cover identity', 'Insurance assessor', 'handler')$$,
  'the Handler adds a custom field'
);

SELECT is(
  (SELECT channel_id FROM dg_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND label = 'Cover identity'),
  '00000000-0000-0000-0000-0000000d7001'::uuid,
  'a client-supplied campaign on a field is replaced by the character''s campaign'
);

-- ===== Guards ===============================================================
SELECT throws_ok(
  $$UPDATE dg_character_fields SET visibility = 'agents'
    WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND field_key = 'handler_notes'$$,
  '23514', NULL,
  'Handler notes can never be made agent-visible'
);

SELECT throws_ok(
  $$UPDATE dg_characters SET status = 'eaten' WHERE id = '00000000-0000-0000-0000-0000000d8001'$$,
  '23514', NULL,
  'an unknown status is rejected'
);

SELECT throws_ok(
  $$UPDATE dg_characters SET kind = 'npc' WHERE id = '00000000-0000-0000-0000-0000000d8001'$$,
  'P0001', NULL,
  'kind cannot be changed directly'
);

SELECT throws_ok(
  $$UPDATE dg_characters SET channel_id = '00000000-0000-0000-0000-0000000d7002' WHERE id = '00000000-0000-0000-0000-0000000d8001'$$,
  'P0001', NULL,
  'a character cannot move to another campaign'
);

SELECT throws_ok(
  $$UPDATE dg_characters SET portrait_url = 'javascript:alert(1)' WHERE id = '00000000-0000-0000-0000-0000000d8001'$$,
  'P0001', NULL,
  'a non-http portrait URL is rejected'
);

SELECT throws_ok(
  $$UPDATE dg_characters SET aliases = ARRAY[' padded '] WHERE id = '00000000-0000-0000-0000-0000000d8002'$$,
  'P0001', NULL,
  'aliases with surrounding spaces are rejected'
);

SELECT throws_ok(
  $$UPDATE dg_character_fields SET character_id = '00000000-0000-0000-0000-0000000d8002'
    WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND field_key = 'occupation'$$,
  'P0001', NULL,
  'a field cannot move to another character'
);

-- ===== Player view: before reveal ===========================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6002","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM dg_characters),
  0::bigint,
  'a player cannot read the characters table directly'
);

SELECT is(
  (SELECT count(*) FROM dg_list_revealed_characters('00000000-0000-0000-0000-0000000d7001')),
  1::bigint,
  'a player sees only the revealed agent, not the hidden NPC'
);

SELECT is(
  (SELECT count(*) FROM dg_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000d8001'),
  6::bigint,
  'a player reads only the agent-visible fields of a revealed agent'
);

SELECT is(
  (SELECT count(*) FROM dg_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000d8002'),
  0::bigint,
  'a player reads no fields of a hidden NPC'
);

SELECT throws_ok(
  $$INSERT INTO dg_characters (channel_id, kind, name, created_by)
    VALUES ('00000000-0000-0000-0000-0000000d7001', 'agent', 'Self-made', '00000000-0000-0000-0000-0000000d6002')$$,
  '42501', NULL,
  'a player cannot create characters'
);

UPDATE dg_character_fields SET body = 'hacked'
WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND field_key = 'occupation';

SELECT is(
  (SELECT count(*) FROM dg_character_fields
   WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND body = 'hacked'),
  0::bigint,
  'a player cannot edit profile fields'
);

SELECT throws_ok(
  $$INSERT INTO dg_character_events (character_id, channel_id, event_type, note, visibility, actor_id)
    VALUES ('00000000-0000-0000-0000-0000000d8001', '00000000-0000-0000-0000-0000000d7001', 'note', 'fake', 'agents', '00000000-0000-0000-0000-0000000d6002')$$,
  '42501', NULL,
  'a player cannot add log entries'
);

-- ===== Handler reveals, toggles fields, changes status ======================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6001","role":"authenticated"}', true);

UPDATE dg_characters SET revealed = true, status_visible = false
WHERE id = '00000000-0000-0000-0000-0000000d8002';
UPDATE dg_character_fields SET visibility = 'agents', body = 'Tall, tired, smells of formaldehyde'
WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND field_key = 'appearance';
UPDATE dg_characters SET status = 'deceased' WHERE id = '00000000-0000-0000-0000-0000000d8002';
UPDATE dg_characters SET status = 'unavailable' WHERE id = '00000000-0000-0000-0000-0000000d8001';

SELECT is(
  (SELECT count(*) FROM dg_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND event_type = 'revealed'),
  1::bigint,
  'revealing a character is logged'
);

SELECT is(
  (SELECT details FROM dg_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND event_type = 'field_visibility_changed'),
  jsonb_build_object(
    'field_id', (SELECT id FROM dg_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND field_key = 'appearance'),
    'label', 'Appearance', 'from', 'handler', 'to', 'agents'),
  'changing a field''s visibility is logged with from/to'
);

SELECT is(
  (SELECT details FROM dg_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND event_type = 'status_changed'),
  '{"from": "active", "to": "deceased"}'::jsonb,
  'a status change is logged with from/to'
);

SELECT is(
  (SELECT visibility FROM dg_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND event_type = 'status_changed'),
  'handler',
  'a status change stays Handler-only when the status is hidden'
);

SELECT is(
  (SELECT visibility FROM dg_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND event_type = 'status_changed'),
  'agents',
  'a revealed agent''s visible status change is shared with the agents'
);

SELECT lives_ok(
  $$INSERT INTO dg_character_events (character_id, channel_id, event_type, note, visibility, actor_id)
    VALUES ('00000000-0000-0000-0000-0000000d8002', '00000000-0000-0000-0000-0000000d7001', 'note', 'Agents bribed her for the autopsy file', 'handler', '00000000-0000-0000-0000-0000000d6001')$$,
  'the Handler adds a log note'
);

SELECT throws_ok(
  $$UPDATE dg_character_events SET details = '{"from":"active","to":"alive"}'
    WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND event_type = 'status_changed'$$,
  'P0001', NULL,
  'automatic history entries cannot be rewritten'
);

SELECT lives_ok(
  $$UPDATE dg_character_events SET visibility = 'agents'
    WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND event_type = 'created'$$,
  'the Handler may change an entry''s visibility'
);

DELETE FROM dg_character_events
WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND event_type = 'created';

SELECT is(
  (SELECT count(*) FROM dg_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000d8002' AND event_type = 'created'),
  1::bigint,
  'automatic history entries cannot be deleted'
);

-- ===== Player view: after reveal ============================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6002","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM dg_list_revealed_characters('00000000-0000-0000-0000-0000000d7001')),
  2::bigint,
  'a player sees the NPC once revealed'
);

SELECT is(
  (SELECT status FROM dg_list_revealed_characters('00000000-0000-0000-0000-0000000d7001')
   WHERE id = '00000000-0000-0000-0000-0000000d8002'),
  NULL::text,
  'a hidden status is returned as NULL to players'
);

SELECT is(
  (SELECT count(*) FROM dg_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000d8002'),
  1::bigint,
  'a player reads exactly the one field the Handler shared'
);

SELECT is(
  (SELECT count(*) FROM dg_character_events WHERE character_id = '00000000-0000-0000-0000-0000000d8002'),
  0::bigint,
  'a player sees none of the NPC''s Handler-only history'
);

SELECT is(
  (SELECT count(*) FROM dg_character_events
   WHERE character_id = '00000000-0000-0000-0000-0000000d8001' AND event_type = 'status_changed'),
  1::bigint,
  'a player sees the shared status change of an agent'
);

-- ===== Hiding again =========================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6001","role":"authenticated"}', true);
UPDATE dg_characters SET revealed = false WHERE id = '00000000-0000-0000-0000-0000000d8002';

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6002","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM dg_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000d8002'),
  0::bigint,
  'hiding a character hides its shared fields again'
);

-- ===== Archived campaign ====================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6001","role":"authenticated"}', true);

SELECT throws_ok(
  $$INSERT INTO dg_characters (channel_id, kind, name, created_by)
    VALUES ('00000000-0000-0000-0000-0000000d7002', 'npc', 'Late Addition', '00000000-0000-0000-0000-0000000d6001')$$,
  '42501', NULL,
  'an archived campaign rejects new characters'
);

UPDATE dg_characters SET name = 'Renamed' WHERE id = '00000000-0000-0000-0000-0000000d8009';

SELECT is(
  (SELECT name FROM dg_characters WHERE id = '00000000-0000-0000-0000-0000000d8009'),
  'Old Contact',
  'an archived campaign''s characters are read-only'
);

-- ===== Blocked member and outsider ==========================================
RESET ROLE;
UPDATE channel_members SET is_blocked = true
WHERE channel_id = '00000000-0000-0000-0000-0000000d7001' AND user_id = '00000000-0000-0000-0000-0000000d6003';
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM dg_list_revealed_characters('00000000-0000-0000-0000-0000000d7001')),
  0::bigint,
  'a blocked member sees no characters'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d6004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d6004","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM dg_list_revealed_characters('00000000-0000-0000-0000-0000000d7001')),
  0::bigint,
  'an outsider sees no characters'
);

SELECT is(
  (SELECT count(*) FROM dg_character_fields WHERE channel_id = '00000000-0000-0000-0000-0000000d7001'),
  0::bigint,
  'an outsider reads no fields'
);

-- ===== Cascades =============================================================
RESET ROLE;
DELETE FROM dg_characters WHERE id = '00000000-0000-0000-0000-0000000d8002';

SELECT is(
  (SELECT count(*) FROM dg_character_fields WHERE character_id = '00000000-0000-0000-0000-0000000d8002')
  + (SELECT count(*) FROM dg_character_events WHERE character_id = '00000000-0000-0000-0000-0000000d8002'),
  0::bigint,
  'deleting a character removes its fields and history'
);

SELECT * FROM finish();
ROLLBACK;
