# Phase 2b Design: Campaign Records and the Case File

*Agreed with the owner on 2026-11-22. Decisions: DECISIONS.md #38–#41. Builds on characters
(`03-step4-characters-design.md`), campaign files (#29), Activity and notes (#35) and NPC tags
(#36, #37). Progress: **2b-1 built** (`12-case-file.md`).*

## What it is for

Phase 2b gives the campaign a memory beyond characters: the places, groups, clues and operations
the story is built from. The GM uses it for prep and continuity. Players get a **Case file** with
what they have been shown. Later, adventure import (Phase 3) fills it with *source* records, and
the AI checks (Phase 4) read it to spot continuity mistakes.

## Record kinds

| Kind | Example | Default fields |
|---|---|---|
| **Location** | The county morgue, a motel room, a safehouse | Description, Address / where, Who's there, GM notes |
| **Organisation** | Sheriff's office, a cult, a front company | Description, Goals, Resources, Secrets, GM notes |
| **Clue** | Bloody glove, a coded ledger | Description, What it suggests, GM notes, plus the clue extras below |
| **Operation** | *Operation LAMPLIGHT*: one adventure or mission | Briefing, Summary, Outcome, GM notes |

An **operation is just another record** (owner choice): it groups nothing by itself. Rooms,
records and characters belong to it only through **links** ("part of → Operation LAMPLIGHT").

## How a record works: like a character

Every kind shares one design, copied from character profiles so it looks and works the same:

- **Name**, optional **aliases** (GM only, as for NPCs), optional **picture**, and the **kind**.
- **Profile** of fields and section headings, in an order you choose (Edit / Save / Cancel). Each
  field is **Everyone** (whoever can see the record) or **GM only**. *GM notes* is always GM only.
- **Tags** (the existing campaign tag list, e.g. *Hollow Creek*) for sorting and filtering. Tags
  are GM only, as for NPCs; players sort by kind and search by name.
- **Activity tab**: posts that tag or mention the record, notes, and history (created, renamed,
  shown or hidden, changed fields). Built when viewed with the viewer's own rights, as for
  characters.
- **Notes**: the GM and players add notes, with the same visibility rules as character notes
  (player notes are *Me and the GM* or *Everyone*; GM notes *GM only* or *Everyone*).
- **Provenance**: every record and field is labelled **canon** for now. Phase 3 adds **source**
  (from the published adventure) and Phase 4 adds AI suggestions, which wait as proposals for your
  approval and never change a record directly.

## Who can see what: per player

A record is **GM only** (the default), **All players** or **Chosen players**, exactly like campaign
files (#29). Sharing is per **player**, not per character, as decided for files and notes.

- When you show a record, players see its *Everyone* fields; *GM only* fields stay hidden.
- Each change of who can see it is recorded in the record's history (GM only).
- **Knowledge belongs to characters** stays the rule for the AI later: Phase 4 can add an optional
  "known by" list of PCs without changing this design.

## Links

Any record or character can be linked to any other with a short **label**, e.g.
*Kowalski — deputy at → Sheriff's office* or *Bloody glove — found at → Morgue*.

- A link shows on **both ends**, in a *Links* section of the profile (records and characters).
- Each link is **GM only** or **Shown**. Players see a shown link only if they can see both ends.
- Clicking the other end opens it in the same panel (as NPC chips do now).
- Suggested labels: *part of*, *found at*, *works for*, *member of*, *located in*, *knows*; any
  other label can be typed.

## Clue extras

Clues get three additions to the shared design:

1. **Status**: *Unexamined*, *Investigated* or *Resolved*. Players see it and can filter by it;
   only the GM changes it.
2. **Found**: by which PC (optional), where (a link to a location, optional) and the in-game date
   (defaults to the campaign date).
3. **GM checklist** (always GM only): what the clue really points to, one line each, with a tick
   for *the agents have worked this out*. For example: *Glove belongs to Dr Hale* ☐, *Hale was in
   the morgue after midnight* ☑. It shows you at a glance how far the investigation has got.

Players write their theories as **notes** on the clue.

## Tags in posts

Records can be tagged in posts like NPCs: `@Morgue`, `@Sheriff's Office`, `@Bloody glove`.

- Typing `@` (or the toolbar button) lists records after the players and NPCs, with a small icon
  per kind (pin, building, magnifying glass, folder).
- Stored as `[Morgue](rec:<record id>)`, so a renamed record still points to the same one.
- Shown as a chip with the kind's icon; clicking it opens the record if the reader can see it.
  For a record the reader can't see, it is plain text (its name was written in the post anyway).
- GM-only aliases work as they do for NPCs (`recalias:<random id>`), so a secret name stays secret.
- Tags count as mentions in the record's Activity.

## The Case file panel

A new **Case file** entry in the sidebar's *Table* section, beside *Files*.

- **Players:** records shown to them, grouped by kind (Operations, Locations, Organisations,
  Clues), with search, a filter by kind, and for clues a filter by status (step 4). Opening one shows the
  profile, links, notes and Activity.
- **GM:** every record, with a *Hidden* / *Some players* badge, **New record** (choose the kind),
  sharing, deleting, and the clue checklist.
- Works on phones as a full-screen panel, like Characters.

## How it is built (for reference)

Everything is new and additive; no upstream table changes.

| Table / function | Purpose |
|---|---|
| `ext_records` | One row per record: campaign, kind, name, aliases, picture, provenance, visibility, created by/at. Clue status and found-by columns used only by clues |
| `ext_record_fields` | Profile fields and headings, same shape as character fields (visibility *players* / *gm*) |
| `ext_record_shares` | Chosen players for a record (as for campaign files) |
| `ext_record_tags` | Record ↔ campaign tag (reuses `ext_tags`) |
| `ext_record_events` | History: created, renamed, visibility changed, fields changed, status changed |
| `ext_record_notes` | Notes, same rules as character notes |
| `ext_clue_points` | The GM checklist (GM only) |
| `ext_links` | One row per link: each end is a character **or** a record (two optional references per end, exactly one filled), label, *gm* / *players* |
| `ext_record_alias_tags` | Random ids for GM alias tags (GM only), as for NPCs |
| `ext_record_posts(...)` | Activity search for a record, run with the caller's rights |
| `ext_record_tag_labels(...)` | Names and kind icons for record tags in posts |

Row-level security does all hiding. Every table gets database tests for the GM, a player who can
see the record, and a player who can't.

## Delivery in four steps (each tried and committed separately)

1. **2b-1 Records and the Case file (built):** the four kinds, profiles with field visibility,
   sharing (GM / all / chosen players), tags, history, the Case file panel for GM and players. A
   record's kind is fixed once created; new records always start GM only.
2. **2b-2 Activity, notes and @tags:** aliases, the Activity tab and notes for records, record tags
   in posts (including GM alias tags).
3. **2b-3 Links:** links between any records and characters, the *Links* section on both.
4. **2b-4 Clue extras:** status, found by / where / when, the GM checklist, the clue filters.

## Not in Phase 2b

- An events / timeline view (the in-game dates on notes, posts and clues come first; a timeline
  can be drawn from them later).
- Per-character "known by" lists (Phase 4, if the AI needs them).
- Importing records from the adventure PDF (Phase 3).
- Maps or diagrams of links.

<!-- cspell:locale en-GB,en -->
<!-- cspell:words recalias -->
