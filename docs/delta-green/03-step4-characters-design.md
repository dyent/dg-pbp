# Step 4 Design: Characters Panel, Visibility, Delta Green Sheet

*Agreed with the owner on 2026-11-17 (revising the step 4 mockup). Replaces steps 4–6 of
`02-phase2a-plan.md`. Decisions: DECISIONS.md #17–#22. Progress: **4a done** (database; see
`PERMISSIONS.md`), **4b done** (characters panel; see `04-characters-panel.md`), **4c done**
(Delta Green sheet; see `05-dg-sheet.md`); 4d and 5 to do.*

## Direction

The app should be a one-stop shop for players, not only the PBP chat. Character sheets are built
for **Delta Green first** (other systems can be added later). Sheets are for **quick reference**,
not linked to the dice roller.

## Role, status and access

**Role** (GM-only dropdown; changes wait for **Save** and show a warning explaining the effect):

| Role | Who controls it | Counts toward 3-PC limit | Player access |
|---|---|---|---|
| PC – in play | Owning player + GM | Yes | Owner edits Everyone + Owner fields and the sheet (all changes logged); can post as it while status is *Active* |
| PC – out of play | GM | No | Former owner: read-only view of everything they could see. All players: the sheet and Owner fields **except fields marked Private** |
| NPC | GM | No | Players see only Everyone fields, once revealed. Former Owner fields become GM-only. Stat block always GM-only |

**Status** is the in-story condition (Active, Temporarily unavailable, Incapacitated, Missing,
Insane, Retired, Deceased). A PC who is recovering, swapped out or on hiatus stays *PC – in play*
with a non-Active status, so the player keeps control. Only *Active* characters can be posted as.

*Refined 2026-11-18 (DECISIONS.md #25):* the app shows these as **PC – active**, **PC – reserve**
(in play, any other status: backup, wounded, on hiatus) and **PC – retired** (out of play). The
limit of 3 counts active PCs only, there is a new *Backup* status, and players set their own PC's
temporary statuses. See `04-characters-panel.md`.

## Visibility levels

Three columns on the profile: **Everyone** · **Owner** (that character's player + GM) · **GM
only**. NPCs use Everyone and GM only. Owner fields can carry a **Private** marker ("stays private
even after the character leaves play"); the standard *Secrets* field is Private by default.
Enforced by row-level security, as before.

## Profile

- **Edit mode:** read-only until **Edit**; then **Save** / **Cancel**.
- **Section headings** can be added between fields; fields and headings can be reordered.
- **NPC tags:** an NPC can have several tags from a campaign tag list the GM builds up (e.g.
  Witness, Federal, Suspect). Used for sorting and filtering. GM-only.

## Delta Green character sheet (step 4c)

Reference sheet for PCs (players edit their own, logged): personal data, the six statistics
with ×5 values, HP / WP / SAN / Breaking Point (auto-calculated by code, overridable), skills with
Delta Green base values, Bonds with scores, motivations and disorders, Sanity-loss adaptations
(violence / helplessness), wounds, gear and weapons, home and family notes. NPCs get an optional
short stat block (always GM-only). Players get a **"My sheet"** pop-up reachable from anywhere in
the campaign.

## PDF attachment (step 4d)

Any character can have an attached PDF (e.g. a fillable official sheet): upload, view in the
browser, download, replace with a new version (older versions kept). Editing a PDF inside the app
is not planned. A possible later extra: read values from an official fillable sheet into the
built-in sheet.

## Step order

1. **4a:** database: owner visibility + Private marker, headings and ordering, role model (in
   play / out of play / NPC) replacing give/take/convert, NPC tags, player editing rights with
   logging.
2. **4b:** characters panel (GM and players), edit mode, role dropdown with warnings.
3. **4c:** Delta Green sheet + "My sheet" pop-up + NPC stat blocks.
4. **4d:** PDF attachments.
5. **5:** activity log + inline NPC tags in GM posts.

<!-- cspell:locale en-GB,en -->
