# Characters Panel: How to Use It

*Phase 2a step 4b, built 2026-11-18. Design: `03-step4-characters-design.md`. Who may see and do
what: `PERMISSIONS.md` (the database enforces it; the panel only hides what you can't use).*

## Opening it

In a campaign, open the sidebar and choose **Characters** (first item under *Table*). Everyone in
the campaign has it. On a phone the panel fills the screen: tap a character to open them, and
**← List** to go back.

## The list

- Two tabs: **PCs** and **NPCs**.
- Each row shows the portrait and name, then badges: *In play* / *Out of play* (PCs), the status
  (e.g. *Active*, *Missing*), the player's name, and **Hidden** (GM only) for characters players
  can't see yet.
- Players see their own PCs under **Your characters**, then every revealed character.
- GM extras: a search box (names and aliases), a tag filter on the NPC tab, and a box at the bottom
  to add a PC or NPC.

## Posting as

The line at the top says which character a player is posting as, with a **Switch to…** list of
their other PCs that are in play and *Active*. Switching labels future posts and rolls; earlier
posts keep the name they were written with.

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

- **Role:** *PC – in play*, *PC – out of play* or *NPC*, plus the **Player** for a PC. Changing it
  shows **When you save:** with the exact effects, an optional note for the history, and **Save
  role** / **Cancel**. The database enforces the limit of 3 PCs in play per player and reports it
  if hit.
- **Status:** applies immediately. Only *Active* characters can be posted as.
- **Revealed to players** and **Players can see the status:** switches.
- **Tags** (NPCs only): tap a tag to add or remove it, or type a new one.
- **Aliases:** other names, separated by commas (GM only; used by the activity log later).
- **Delete character:** only works for characters that have never posted. Otherwise, change the
  status or role.

## Known limits (for later steps)

- No live refresh: if someone else changes a character while the panel is open, close and reopen
  it to see the change. Posting switches do update live.
- The Delta Green sheet, the "My sheet" pop-up and NPC stat blocks come in step 4c; PDF attachments
  in 4d.
- Changing a PC's status to something other than *Active* doesn't switch the player away from
  posting as them. The player (or a role change) does that.

## Files

| Code | Purpose |
|---|---|
| `src/features/ext/characters/characterModel.ts` | Labels, role logic, edit drafts and diffing, warning and history text (pure, no database) |
| `src/features/ext/characters/characterApi.ts` | Every database call the panel makes |
| `useCharacterList.ts`, `useCharacterProfile.ts`, `useCharacterActions.ts` | React hooks over the API |
| `CharactersEntry.tsx` | Sidebar item + panel (the only thing `ChannelView` renders) |
| `CharactersPanel.tsx`, `CharacterList.tsx`, `CharacterProfile.tsx`, `ProfileEditor.tsx`, `GmControls.tsx`, `CharacterHistory.tsx`, `PostingAsSwitcher.tsx`, `CharacterBadges.tsx`, `ui.ts` | The screens |

<!-- cspell:locale en-GB,en -->
