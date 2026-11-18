# Characters Panel: How to Use It

*Phase 2a step 4b, built 2026-11-18. Design: `03-step4-characters-design.md`. Who may see and do
what: `PERMISSIONS.md` (the database enforces it; the panel only hides what you can't use).*

## Opening it

In a campaign, open the sidebar and choose **Characters** (first item under *Table*). Everyone in
the campaign has it. On a phone the panel fills the screen: tap a character to open them, and
**← List** to go back.

## The list

- Two tabs: **PCs** and **NPCs**.
- Each row shows the portrait and name, then badges: *Active* / *Reserve* / *Retired* (PCs; *In
  play* when you can't see the status), the status (e.g. *Backup*, *Missing*), the player's name,
  and **Hidden** (GM only) for characters players can't see yet.
- Players see their own PCs under **Your characters**, then every revealed character.
- GM extras: a search box (names and aliases), a tag filter on the NPC tab, and a box at the bottom
  to add a PC or NPC.

## Posting as

The line at the top says which character a player is posting as, with a **Switch to…** list of
their other PCs that are in play and *Active*. Switching labels future posts and rolls; earlier
posts keep the name they were written with.

## Active, Reserve and Retired PCs

*Updated 2026-11-18 (DECISIONS.md #25).*

| Shown as | Meaning | Counts toward 3 | Can be posted as | Who can read it |
|---|---|---|---|---|
| **PC – active** | In play, status *Active* | Yes | Yes | Player + GM |
| **PC – reserve** (backup, wounded, on hiatus) | In play, any other status (*Backup*, *Temporarily unavailable*, *Incapacitated*, …) | No | No | Player + GM |
| **PC – retired** (dead, insane, left the story) | Out of play | No | No | Everyone, except Private fields |

- **Players** set their own PC's status (below the header): *Active*, *Backup*, *Temporarily
  unavailable* or *Incapacitated*. *Missing*, *Insane*, *Retired* and *Deceased* are set only by the
  GM, and the player then sees the status read-only.
- When a PC stops being *Active* and its player is posting as it, they switch to another active PC
  of theirs. With no other active PC they keep posting as it until something changes.
- Making a fourth PC *Active* is refused: move one to Reserve first.

## The profile

- The header shows the role, status and player.
- **Profile** has three columns:
  - **Everyone**: all players can read it.
  - **Owner**: the character's player and the GM.
  - **GM only**: only the GM.

  Players never see the GM column, and NPCs have no Owner column. **🔒 Private** marks Owner fields
  that stay hidden even after the PC leaves play.
- **History** lists what happened to the character. The GM also sees every field edit, with a
  **Show the change** before/after view, and can add notes.

## Edit mode

**Edit** appears for the GM, and for a player on their own PC while it is *in play*.

- Change the name and the portrait (**Choose icon**, **Upload** or **Remove**). A PC name longer
  than 20 characters is cut short on posts, and the editor warns about it.
- Every field becomes a text box. Each field has:
  - **↑ / ↓** to reorder it within its column;
  - **Who sees it** to move it to another column (players can't choose *GM only*);
  - **Private**, on Owner fields;
  - **✕** to remove it. Players can remove only fields they added themselves.
- Each column has **+ Field** and **+ Heading**.
- Nothing is saved until **Save**; **Cancel** discards everything. While editing, the panel won't
  close (Escape, ✕ and clicking outside are ignored), so edits can't be lost by accident.

## GM controls

These appear below the header for the GM.

- **Role:** *PC – active*, *PC – reserve*, *PC – retired* or *NPC*, plus the **Player** for a PC.
  Choosing Reserve sets the status to *Backup*; choosing Active from Reserve sets it to *Active*.
  Changing it shows **When you save:** with the exact effects, an optional note for the history,
  and **Save role** / **Cancel**. The database enforces the limit of 3 active PCs per player and
  reports it if hit.
- **Status:** applies immediately. Any status other than *Active* puts an in-play PC in Reserve.
- **Every NPC** appears in upstream's **Speak as NPC** list (and GM Tools → NPCs) under its name
  and portrait; renaming the NPC renames the entry. Past posts keep the name they were sent with.
- **Revealed to players** and **Players can see the status:** switches.
- **Tags** (NPCs only): tap a tag to add or remove it, or type a new one.
- **Aliases:** other names, separated by commas (GM only; used by the activity log later).
- **Delete character:** only works for characters that have never posted. Otherwise, change the
  status or role.

## Known limits (for later steps)

- No live refresh: if someone else changes a character while the panel is open, close and reopen
  it to see the change. Posting switches do update live.
- The Delta Green sheet, the "My sheet" pop-up and NPC stat blocks: see `05-dg-sheet.md`. PDF
  attachments come in 4d.
- An NPC renamed to a name another *Speak as* entry already uses keeps its old entry name.

## Files

| Code | Purpose |
|---|---|
| `src/features/ext/characters/characterModel.ts` | Labels, role logic, edit drafts and diffing, warning and history text (pure, no database) |
| `src/features/ext/characters/characterApi.ts` | Every database call the panel makes |
| `useCharacterList.ts`, `useCharacterProfile.ts`, `useCharacterActions.ts` | React hooks over the API |
| `CharactersEntry.tsx` | Sidebar item + panel (the only thing `ChannelView` renders) |
| `CharactersPanel.tsx`, `CharacterList.tsx`, `CharacterProfile.tsx`, `ProfileEditor.tsx`, `GmControls.tsx`, `OwnStatus.tsx`, `CharacterHistory.tsx`, `PostingAsSwitcher.tsx`, `CharacterBadges.tsx`, `ui.ts` | The screens |

<!-- cspell:locale en-GB,en -->
