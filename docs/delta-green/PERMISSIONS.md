# Who Can See and Do What: Characters

Enforced by the database (row-level security and functions), so it holds no matter which screen
or tool is used. Every row below is covered by pgTAP tests
(`supabase/tests/*_ext_characters.sql`, `*_ext_character_roles.sql`,
`*_ext_posting_identities.sql`, `*_dg_character_sheets.sql`, `*_ext_character_reserve.sql`,
`*_dg_sheet_quick_pools.sql`, `*_ext_npc_roster_merge.sql`). Current as of the step 5a follow-ups
(2026-11-19). Every "Speak as NPC" name is an NPC character (GM only until revealed).

"In play" covers **active** and **reserve** PCs (reserve = in play with a status other than
Active); "out of play" is shown in the app as **retired**.

**Viewers:** **GM** (the campaign's GM) · **Owner** (the player who owns this PC) · **Former owner**
(owned it before it left play) · **Other player** (any other campaign member) · **Outsider** (not in
the campaign, or blocked).

## Seeing characters

| What | GM | Owner | Other player | Outsider |
|---|---|---|---|---|
| Character exists in the list | All | Own PCs + revealed characters | Revealed characters | No |
| Name, portrait, role (in play / out of play / NPC) | Yes | Yes | If revealed | No |
| Status | Yes | Always, for own PCs | If revealed **and** "players see status" is on | No |
| Aliases, NPC tags, NPC stat blocks | Yes | No | No | No |
| PC's Delta Green sheet | Yes | Yes | Only when the PC is **out of play** (and revealed) | No |

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
| Role and player (active / reserve / retired / NPC); 1 active and up to 3 reserve PCs per player | Yes (`ext_set_role`) | No | No | No |
| Status: Active, Backup, Temporarily unavailable, Incapacitated (making one Active moves the player's other active PC to Backup) | Yes | Yes (`ext_set_my_status`, own PC in play, only from one of these) | No | No |
| Status: Missing, Insane, Retired, Deceased; reveal, status visibility, aliases, tags | Yes | No | No | No |
| Name and portrait | Yes | Yes (`ext_update_my_character`) | No | No |
| Edit Everyone / Owner fields, toggle Private | Yes | Yes | No | No |
| Add custom fields and headings | Yes (any visibility) | Yes (Everyone / Owner only) | No | No |
| Delete fields | Yes | Own custom fields only (not standard fields) | No | No |
| GM-only fields | Yes | No (can't see, add, or move fields into GM-only) | No | No |
| Which PC a player posts as | Follows the active PC | Their one active PC, or their own name when none is active | No | No |
| Tick boxes on the sheet (failed skills, SAN-loss incidents, first aid) from the view | Yes | Yes (PC in play) | No | No |
| Add history notes | Yes | No | No | No |
| Create / edit a PC's Delta Green sheet, quick HP / WP / SAN (`dg_set_pool`) | Yes | Yes (PC in play) | No | No |
| NPC stat block; remove any sheet | Yes | No | No | No |

Every field addition, edit (old and new text), removal and visibility change is logged as a GM-only
history entry, and so is every sheet save (the list of changed values). A PC that becomes an NPC
keeps its sheet, which becomes GM-only. Archived campaigns are read-only for everyone.

## Character notes and activity

Tests: `supabase/tests/*_ext_character_activity.sql`. How to use: `09-activity-log.md`.

| What | GM | Writer | Other player | Outsider |
|---|---|---|---|---|
| Read a **GM only** note (GM's) | Yes | (the GM) | No | No |
| Read a **Me and the GM** note (player's) | Yes | Yes | No | No |
| Read an **Everyone** note | Yes | Yes | If they can see the character | No |
| Add a note | Any character | Players: characters they can see | Same | No |
| Edit a note | Own notes only | Yes | No | No |
| Delete a note | Any note | Yes | No | No |
| Posts and mentions in the Activity tab | Everything in the campaign, aliases included | Only posts they can read in the chat; the name only | Same | Nothing |

Notes belong to the player who wrote them, even after their PC retires (DECISIONS.md #35).
Archived campaigns are read-only.

## Campaign files

Tests: `supabase/tests/*_ext_campaign_files.sql`. How to use: `06-campaign-files.md`.

| What | GM | Player the file is shared with | Other player | Outsider |
|---|---|---|---|---|
| See and open a **GM only** file | Yes | No | No | No |
| See and open an **All players** file | Yes | Yes | Yes | No |
| See and open a **Chosen players** file | Yes | Yes | No | No |
| Earlier versions | Yes | Same as the file | Same as the file | No |
| Who a file is shared with; file history | Yes | No | No | No |
| Add, replace, edit, share, delete | Yes (not in archived campaigns) | No | No | No |

## In-game calendar

Tests: `supabase/tests/*_ext_in_game_calendar.sql`. How to use: `08-in-game-calendar.md`.

| What | GM | Player | Outsider |
|---|---|---|---|
| See the campaign date and its changes | Yes | Yes | No |
| See a room's own date and its changes | Yes | If they can see the room (private rooms: invited players only) | No |
| Set, move, clear a room's date, undo the last change | Yes (not in archived campaigns) | No | No |

Sharing is with the player, not a character (DECISIONS.md #29). The stored files themselves follow
the same rules (storage policies), so a copied storage path is useless without access. An "Open" or
"Download" link already shown to a player keeps working for up to an hour, even if the file is
unshared in the meantime.

<!-- cspell:locale en-GB,en -->
