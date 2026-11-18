# Delta Green Sheet: How to Use It

*Phase 2a step 4c, built 2026-11-18. Design: `03-step4-characters-design.md`. Decisions: #23–#24
and #27 (quick HP / WP / SAN).
Access: `PERMISSIONS.md`.*

## Where to find it

- **Players:** **My sheet** in the campaign header (the page icon next to Whispers). It opens on
  the character you're posting as; with more than one PC, tabs switch between them. Retired PCs
  are read-only.
- **GM:** in the **Characters** panel, open a character and choose the **Sheet** tab (PCs) or the
  **Stats** tab (NPCs).

## Who sees and edits it

| | GM | The PC's player | Other players |
|---|---|---|---|
| PC sheet, PC active or reserve | Sees, edits | Sees, edits | No |
| PC sheet, PC retired | Sees, edits | Sees (read-only) | Sees (read-only) |
| NPC stat block | Sees, edits | No | No |

A PC turned into an NPC keeps its full sheet, which becomes GM-only. Only the GM can remove a sheet.
Archived campaigns are read-only.

## Creating and editing

- **Create Delta Green sheet** starts a sheet with every skill at its base value. **Add stats**
  starts a short NPC stat block (statistics, HP/WP/SAN, armour, skills, attacks, notes as free text);
  leave out whatever you don't need.
- **Edit sheet** → change anything → **Save** (or **Cancel**). While editing, the window can't be
  closed by accident.
- Typed skills (Art, Craft, Foreign Language, Military Science, Pilot, Science): choose the skill,
  type the specialisation (e.g. *Russian*) and **+ Add skill**. Each can be added several times.
- Tick the box beside a skill when it fails this session, for improvement rolls.
- **+ Bond** starts the new Bond at the current CHA score.

## Quick HP, WP and SAN

Without opening the editor, anyone who can edit the sheet (the GM, or the PC's player) can change
the **current** HP, WP and SAN (on NPC stat blocks too):

- **− / +** change the value by one. Clicks within a moment of each other are saved together, as
  one change. If the value is empty, they start from the maximum (HP, WP) or the starting SAN.
- **Click the number** to type a value; **Enter** or clicking elsewhere saves it, **Escape** cancels,
  and an empty box clears the value.
- Each change saves straight away and appears in the GM's change log. Only that one value is
  written, so it can't overwrite other changes to the sheet.

## Calculated values

Worked out by database functions (shown live while editing):

| Value | Rule |
|---|---|
| ×5 column | Statistic × 5 |
| Maximum HP | (STR + CON) ÷ 2, rounded up |
| Maximum WP | POW |
| Starting SAN | POW × 5 (**Start at** button) |
| Maximum SAN | 99 − Unnatural (a warning shows if current SAN is above it) |
| Breaking Point | Starts at SAN − POW; **Recalculate** sets it to current SAN − POW once it's reached |

Maximum HP and WP can be overridden (e.g. after permanent injury); the sheet then shows
"calculated: X" beside it. The sheet flags **reached** when SAN is at or below the Breaking Point.

## Change log

Every save adds one GM-only entry to the character's **History**: "Sheet edited (N changes)" with
**Show the changes** listing each value, e.g. *POW: 12 → 11*, *Bond 1 name: (empty) → Maya*. Up to 60
changes are listed per save.

## Known limits

- The sheet is for reference only: it isn't linked to the dice roller.
- If the GM and a player edit the same sheet at the same moment, the last save wins (each save is
  logged, so nothing is lost silently).
- The profile's standard *Motivations* field still exists for story notes; mechanical motivations
  belong on the sheet.

## Files

| Code | Purpose |
|---|---|
| `supabase/migrations/20261118072838_dg_character_sheets.sql` | Table, access rules, validation, calculations, change log |
| `src/features/dg/sheet/sheetModel.ts` | Sheet shape, skill list with base values, calculations (mirror), validation, change-log labels |
| `src/features/dg/sheet/sheetApi.ts`, `useSheet.ts` | Database calls and hook |
| `SheetView.tsx`, `SheetEditor.tsx` | Read-only sheet and editor (Agent sheet and NPC stat block) |
| `PoolAdjuster.tsx` | − / + and click-to-type for current HP, WP and SAN (`dg_set_pool`, migration `20261118100841_dg_sheet_quick_pools.sql`) |
| `CharacterSheet.tsx` | Loads one character's sheet: create, view, edit, remove |
| `MySheetButton.tsx` | Header button + pop-up (the only thing `ChannelView` renders) |

<!-- cspell:locale en-GB,en -->
