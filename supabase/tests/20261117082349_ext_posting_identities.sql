-- Fork Phase 2a step 3: ext_posting_identities projection — members and the GM
-- see each posting period with the character's name/portrait; blocked members and
-- outsiders see nothing; the table is published for realtime.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000de001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pigm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000de002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pip1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000de003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pip2@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000de004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'piout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-0000000df001', 'Identities', '00000000-0000-0000-0000-0000000de001', '0df00001');

INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000df001', '00000000-0000-0000-0000-0000000de001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000df001', '00000000-0000-0000-0000-0000000de002', 'Sam', '2026-01-01 00:00:00+00', false),
  ('00000000-0000-0000-0000-0000000df001', '00000000-0000-0000-0000-0000000de003', 'Jo', now(), true);

INSERT INTO ext_characters (id, channel_id, kind, name, portrait_url, revealed, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000df101', '00000000-0000-0000-0000-0000000df001', 'pc', 'Reyes', 'https://example.com/reyes.png', true, '00000000-0000-0000-0000-0000000de001'),
  ('00000000-0000-0000-0000-0000000df102', '00000000-0000-0000-0000-0000000df001', 'pc', 'Okafor', NULL, true, '00000000-0000-0000-0000-0000000de001');

INSERT INTO ext_posting_periods (channel_id, user_id, character_id, started_at, ended_at)
VALUES
  ('00000000-0000-0000-0000-0000000df001', '00000000-0000-0000-0000-0000000de002', '00000000-0000-0000-0000-0000000df101', '2026-01-01 00:00:00+00', '2026-03-01 00:00:00+00'),
  ('00000000-0000-0000-0000-0000000df001', '00000000-0000-0000-0000-0000000de002', '00000000-0000-0000-0000-0000000df102', '2026-03-01 00:00:00+00', NULL);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

-- A member (Sam) reads both periods, in order, with names and portraits.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000de002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000de002","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT name, portrait_url, ended_at IS NULL FROM ext_posting_identities('00000000-0000-0000-0000-0000000df001')$$,
  $$VALUES ('Reyes'::text, 'https://example.com/reyes.png'::text, false),
           ('Okafor'::text, NULL::text, true)$$,
  'a member sees each posting period with the character name and portrait, oldest first'
);

-- The GM sees the same.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000de001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000de001","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_posting_identities('00000000-0000-0000-0000-0000000df001')),
  2::bigint,
  'the GM sees every posting period'
);

-- Blocked member and outsider see nothing.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000de003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000de003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_posting_identities('00000000-0000-0000-0000-0000000df001')),
  0::bigint,
  'a blocked member sees no posting identities'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000de004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000de004","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM ext_posting_identities('00000000-0000-0000-0000-0000000df001')),
  0::bigint,
  'an outsider sees no posting identities'
);

RESET ROLE;

SELECT ok(
  NOT has_function_privilege('anon', 'public.ext_posting_identities(uuid)', 'EXECUTE'),
  'anonymous visitors cannot call the projection'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ext_posting_periods'
  ),
  'posting periods are published for live updates'
);

SELECT * FROM finish();
ROLLBACK;
