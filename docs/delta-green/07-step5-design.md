# Step 5 Design: In-Game Calendar, NPC Activity Log, Inline NPC Tags

*Agreed with the owner on 2026-11-19. Decisions: DECISIONS.md #30–#32 (refining #10, #16 and #28).
Order: **5a** calendar → **5b** activity log and notes → **5c** inline NPC tags; each step is tried
and committed before the next. Progress: **5a built** (see `08-in-game-calendar.md`).*

## 5a: In-game calendar

- **Campaign date:** the GM sets the campaign's current in-game date (date only, no time of day).
  It shows in the campaign header.
- **Room override:** a room (scene) can have its own date, for a flashback or a parallel scene. A
  room without one follows the campaign date. The GM can set, change or clear it from the room.
- **Moving time:** the GM can set a date directly or **go forward** (or back) by a number of days,
  weeks, months or years, for the campaign or one room.
- **Divider in the chat:** each change shows as a line between posts in the affected room(s), e.g.
  *— 3 days later: Fri 17 Oct 1997 —* (or *— Mon 14 Jul 1997 —* when set directly).
- **Dates of posts and notes:** worked out from a record of "date changed to X at real time T"
  (the same idea as posting periods), so upstream's posts are not changed.
- **Calendars:** stored as a **calendar type + day number**. Earth (Gregorian) first; custom and
  fantasy calendars can be added later as new calendar types without changing stored dates.
- **Generic:** not Delta Green-specific, so `ext_` names and GM / player wording.

## 5b: NPC activity log and notes

An **Activity** tab on each character (NPCs first; PCs get it too), built when viewed, using the
viewer's own access, so private posts are never copied anywhere:

| Source | Example |
|---|---|
| Posts where the character was **tagged** (5c) or **spoken as** (upstream *Speak as NPC*) | *Dr Hale in Morgue (12 Oct 1997): "The body was moved…"* with a link to the post |
| Posts **mentioning** the name or aliases (plain text match; can be filtered out) | *Mentioned by Agent Reyes in Main (13 Oct 1997)* |
| **Notes** by the GM or players | *Agents asked her about the autopsy (14 Oct 1997)* |
| Existing **history** (status, role, profile changes) | *Status: Active → Missing* |

- Entries carry the in-game date (from 5a) as well as the real date.
- **Notes:** the GM and players can add notes to characters they can see. A player's note is
  visible to **the writer and the GM** unless the writer shares it with **everyone**; the GM's notes
  are Everyone or GM only. The GM sees every note. The in-game date defaults to the current one
  and can be changed.
- **Players** see only revealed characters, and only posts they could already read (whispers and
  private rooms are left out automatically).

## 5c: Inline NPC tags

- An **Insert NPC** button in the composer (GM only) picks an NPC and inserts a tag, e.g.
  `[Dr Hale](npc:<id>)`, using the same link mechanism as upstream's dice links.
- A tag **at the start of a paragraph** turns that paragraph into the NPC's **speech block**
  (portrait and name beside it, slightly indented). A tag mid-sentence shows as a small name chip.
  Clicking either opens the NPC's profile.
- Several NPCs can speak in one post. Upstream's one-NPC *Speak as* mode stays.
- Tagged posts feed the activity log (5b).
- Needs small `FORK-EXT` hooks in upstream's post display (`MessageItem.tsx`) and composer.

<!-- cspell:locale en-GB,en -->
