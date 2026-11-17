# Who Can See and Do What: Characters

Enforced by the database (row-level security and functions), so it holds no matter which screen
or tool is used. Every row below is covered by pgTAP tests
(`supabase/tests/*_ext_characters.sql`, `*_ext_character_roles.sql`,
`*_ext_posting_identities.sql`). Current as of Phase 2a step 4a (2026-11-17).

**Viewers:** **GM** (the campaign's GM) · **Owner** (the player who owns this PC) · **Former owner**
(owned it before it left play) · **Other player** (any other campaign member) · **Outsider** (not in
the campaign, or blocked).

## Seeing characters

| What | GM | Owner | Other player | Outsider |
|---|---|---|---|---|
| Character exists in the list | All | Own PCs + revealed characters | Revealed characters | No |
| Name, portrait, role (in play / out of play / NPC) | Yes | Yes | If revealed | No |
| Status | Yes | Always, for own PCs | If revealed **and** "players see status" is on | No |
| Aliases, NPC tags, NPC stat blocks (4c) | Yes | No | No | No |

## Seeing profile fields and history entries

| Field / entry visibility | GM | Owner (PC in play) | Former owner (PC out of play) | Other player | Outsider |
|---|---|---|---|---|---|
| **Everyone** | Yes | Yes | Yes | If character revealed | No |
| **Owner** | Yes | Yes | Yes | Only when the PC is **out of play** and the field is **not Private** | No |
| **Owner + Private** | Yes | Yes | Yes | No | No |
| **GM only** | Yes | No | No | No | No |

NPCs have no Owner level: when a PC becomes an NPC, its Owner fields become GM-only and the former
owner loses access to them.

## Changing things

| Action | GM | Owner (PC in play) | Former owner | Other player |
|---|---|---|---|---|
| Create / delete characters | Yes (delete only if it never posted) | No | No | No |
| Role and player (in play / out of play / NPC), 3-in-play limit | Yes (`ext_set_role`) | No | No | No |
| Status, reveal, status visibility, aliases, tags | Yes | No | No | No |
| Name and portrait | Yes | Yes (`ext_update_my_character`) | No | No |
| Edit Everyone / Owner fields, toggle Private | Yes | Yes | No | No |
| Add custom fields and headings | Yes (any visibility) | Yes (Everyone / Owner only) | No | No |
| Delete fields | Yes | Own custom fields only (not standard fields) | No | No |
| GM-only fields | Yes | No (can't see, add, or move fields into GM-only) | No | No |
| Choose which PC to post as | Yes | Yes (own PCs in play with status Active) | No | No |
| Add history notes | Yes | No | No | No |

Every field addition, edit (old and new text), removal and visibility change is logged as a GM-only
history entry. Archived campaigns are read-only for everyone.

<!-- cspell:locale en-GB,en -->
