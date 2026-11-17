# Our Database Migrations

Every migration we add is listed here with its purpose. Generic fork features use the `ext_`
prefix; Delta Green-specific rules will use `dg_` (DECISIONS.md #13). Upstream migrations are not
listed. See `supabase/migrations/` and upstream's `docs/SCHEMA.md` for those.

> The three migrations below were rewritten in place on 2026-11-17 (`dg_` names → `ext_`, Delta
> Green terms → generic; DECISIONS.md #14). Nothing had been deployed. From the first deployment
> onwards, applied migrations are immutable.

| Migration file | Purpose | Tables / functions affected |
|---|---|---|
| `20261117075913_ext_characters.sql` | Phase 2a step 1: characters (`kind` = `pc` / `npc`) with per-field visibility (`players` / `gm`) and automatic history. GM-only character table; players read through a safe projection. Archived campaigns read-only | Tables `ext_characters`, `ext_character_fields`, `ext_character_events`; functions `ext_character_revealed`, `ext_list_revealed_characters`; trigger functions `ext_characters_guard`, `ext_characters_after_insert`, `ext_characters_after_update`, `ext_character_fields_guard`, `ext_character_fields_after_update`, `ext_character_events_guard`. Tests: `supabase/tests/20261117075913_ext_characters.sql` (44) |
| `20261117081427_ext_character_control.sql` | Phase 2a step 2: character stables (max 3 PCs per player), posting periods (which PC a player posts as, from/to), give / take back / post as / convert to NPC. First posting period is backdated to the player's join time. Membership name/portrait kept in step with the current PC | Tables `ext_character_controllers`, `ext_posting_periods`; extends `ext_character_events` event types; client functions `ext_give_character`, `ext_take_character`, `ext_post_as`, `ext_convert_to_npc`; internal (no API access) `ext__log_event`, `ext__set_posting`, `ext__release_character`. Writes to upstream `channel_members` (name/portrait) and `channel_npcs` (new NPC identity on conversion): data only, no schema change. Tests: `supabase/tests/20261117081427_ext_character_control.sql` (45) |
| `20261117082349_ext_posting_identities.sql` | Phase 2a step 3: safe projection of posting periods with character name/portrait, so the app can label each post and roll with the character active at the time; publishes `ext_posting_periods` for live updates | Function `ext_posting_identities`; adds `ext_posting_periods` to the `supabase_realtime` publication. Tests: `supabase/tests/20261117082349_ext_posting_identities.sql` (6) |
