# Our Database Migrations

Every migration we add (prefix `dg_`) is listed here with its purpose. Upstream migrations are not
listed. See `supabase/migrations/` and upstream's `docs/SCHEMA.md` for those.

| Migration file | Purpose | Tables / functions affected |
|---|---|---|
| `20261117075913_dg_characters.sql` | Phase 2a step 1: agents + NPCs with per-field visibility and automatic history. GM-only character table; players read via a safe projection. Archived campaigns read-only | Tables `dg_characters`, `dg_character_fields`, `dg_character_events`; functions `dg_character_revealed`, `dg_list_revealed_characters`; trigger functions `dg_characters_guard`, `dg_characters_after_insert`, `dg_characters_after_update`, `dg_character_fields_guard`, `dg_character_fields_after_update`, `dg_character_events_guard`. Tests: `supabase/tests/20261117075913_dg_characters.sql` (44) |
