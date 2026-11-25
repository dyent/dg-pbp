-- AI settings and usage: server admin only; the log is written by the service role.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(16);

-- ---- Fixtures (database owner) ----------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aiadmin@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000b1002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aigm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000b1003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aisam@test.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-0000000b1001';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-0000000b2001', 'Admin campaign', '00000000-0000-0000-0000-0000000b1001', 'b2000001'),
  ('00000000-0000-0000-0000-0000000b2002', 'Other GM', '00000000-0000-0000-0000-0000000b1002', 'b2000002');
INSERT INTO channel_members (channel_id, user_id, character_name, joined_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1001', 'GM', now(), false),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1003', 'Sam', now(), false),
  ('00000000-0000-0000-0000-0000000b2002', '00000000-0000-0000-0000-0000000b1002', 'GM', now(), false);

-- Start the month clean for these checks (rolled back at the end).
DELETE FROM ext_ai_usage;
UPDATE ext_ai_settings SET monthly_cap_usd = 5;
INSERT INTO ext_ai_usage (channel_id, user_id, feature, model, input_tokens, output_tokens, cost_usd, outcome, created_at)
VALUES
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1001', 'connection_test', 'claude-sonnet-5-5', 100, 20, 0.0004, 'ok', now()),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1001', 'import', 'claude-sonnet-5-5', 30000, 4000, 0.1, 'ok', now()),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1001', 'import', 'claude-sonnet-5-5', 30000, 4000, 0.1, 'ok', now() - interval '40 days');

SELECT is(ext__ai_month_spent(), 0.1004::numeric, 'Spending counts this calendar month only');

SET LOCAL ROLE authenticated;

-- ===== Server admin ================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1001","role":"authenticated"}', true);

SELECT row_eq(
  $$SELECT * FROM ext_ai_status('00000000-0000-0000-0000-0000000b2001')$$,
  ROW(true, true, 0.1004::numeric, 5.00::numeric),
  'Server admin GM: allowed, with this month''s spending and the cap'
);
SELECT is(
  (SELECT allowed FROM ext_ai_status('00000000-0000-0000-0000-0000000b2002')),
  false,
  'Server admin is not allowed in a campaign they don''t GM'
);
SELECT is((SELECT count(*)::int FROM ext_ai_usage), 3, 'Server admin reads the usage log');
SELECT lives_ok($$SELECT ext_set_ai_cap(7.505)$$, 'Server admin changes the cap');
SELECT is((SELECT monthly_cap_usd FROM ext_ai_settings), 7.51::numeric, 'Rounded to cents');
SELECT throws_ok($$SELECT ext_set_ai_cap(-1)$$, 'P0001', 'The cap must be between $0 and $1,000 a month', 'No negative cap');
SELECT throws_ok($$SELECT ext_set_ai_cap(5000)$$, 'P0001', 'The cap must be between $0 and $1,000 a month', 'No huge cap');
SELECT throws_ok(
  $$INSERT INTO ext_ai_usage (feature, model, outcome) VALUES ('import', 'x', 'ok')$$,
  '42501', NULL,
  'Not even the server admin can write the log from the app'
);
SELECT throws_ok($$SELECT ext__ai_month_spent()$$, '42501', NULL, 'The internal spending helper is not callable from the app');

-- ===== Another GM (not server admin) ================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1002","role":"authenticated"}', true);

SELECT row_eq(
  $$SELECT * FROM ext_ai_status('00000000-0000-0000-0000-0000000b2002')$$,
  ROW(false, false, NULL::numeric, NULL::numeric),
  'Another GM is not allowed and learns nothing about spending'
);
SELECT is_empty($$SELECT 1 FROM ext_ai_usage$$, 'Another GM cannot read the usage log');
SELECT is_empty($$SELECT 1 FROM ext_ai_settings$$, 'or the settings');
SELECT throws_ok($$SELECT ext_set_ai_cap(100)$$, '42501', 'Only the server admin can change the AI spending cap', 'or change the cap');

-- ===== Player ======================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1003","role":"authenticated"}', true);

SELECT is((SELECT allowed FROM ext_ai_status('00000000-0000-0000-0000-0000000b2001')), false, 'A player is not allowed');
SELECT is_empty($$SELECT 1 FROM ext_ai_usage$$, 'A player cannot read the usage log');

SELECT * FROM finish();
ROLLBACK;
