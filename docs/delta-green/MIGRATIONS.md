# Our Database Migrations

Every migration we add (prefix `dg_`) is listed here with its purpose. Upstream migrations are not
listed. See `supabase/migrations/` and upstream's `docs/SCHEMA.md` for those.

| Migration file | Purpose | Tables / functions affected |
|---|---|---|
| `20261117075913_dg_characters.sql` | Phase 2a step 1: agents + NPCs with per-field visibility and automatic history. GM-only character table; players read via a safe projection. Archived campaigns read-only | Tables `dg_characters`, `dg_character_fields`, `dg_character_events`; functions `dg_character_revealed`, `dg_list_revealed_characters`; trigger functions `dg_characters_guard`, `dg_characters_after_insert`, `dg_characters_after_update`, `dg_character_fields_guard`, `dg_character_fields_after_update`, `dg_character_events_guard`. Tests: `supabase/tests/20261117075913_dg_characters.sql` (44) |
| `20261117081427_dg_agent_control.sql` | Phase 2a step 2: agent stables (max 3 per player), posting periods (who a player posts as, from/to), give / take back / post as / convert to NPC. First posting period is backdated to the player's join time. Membership name/portrait kept in step with the current agent | Tables `dg_agent_controllers`, `dg_posting_periods`; extends `dg_character_events` event types; client functions `dg_give_agent`, `dg_take_agent`, `dg_post_as`, `dg_convert_to_npc`; internal (no API access) `dg__log_event`, `dg__set_posting`, `dg__release_agent`. Writes to upstream `channel_members` (name/portrait) and `channel_npcs` (new NPC identity on conversion): data only, no schema change. Tests: `supabase/tests/20261117081427_dg_agent_control.sql` (45) |
