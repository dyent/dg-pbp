# The Case File: How to Use It

*Phase 2b, built 2026-11-22 to 2026-11-24. Design: `11-phase2b-design.md`. Decisions:
DECISIONS.md #38 to #44. Access: `PERMISSIONS.md`.*

The **Case files** panel holds the campaign's records: **operations**, **locations**, **organisations** and
**clues**. You use it for prep and continuity; players see the records you show them. Open it from
**Case files** in the campaign sidebar, next to *Files*.

## Adding a record (GM)

1. Press **+ New record**, choose the kind and type a name.
2. The record opens. It is **GM only** until you share it.
3. Press **Edit** to fill in the fields, add your own fields and headings, reorder them, and choose
   a picture (an icon or an uploaded image).

Each kind starts with its own fields:

| Kind | Everyone | GM only |
|---|---|---|
| Operation | Briefing, Summary, Outcome | GM notes |
| Location | Description, Address / where | Who's there, GM notes |
| Organisation | Description | Goals, Resources, Secrets, GM notes |
| Clue | Description | What it suggests, GM notes |

While editing, *Who sees it* moves a field between **Everyone** and **GM only**. *GM notes* is
always GM only. The kind of a record can't be changed later; make a new one instead.

## Showing a record to players (GM)

Under **Who can see it**, choose:

- **GM only**: your prep. Players can't see it.
- **All players**: every player sees it in their Case file.
- **Chosen players**: tick the players. It is shared with the *player*, so all their characters
  can use it, as for campaign files.

Then press **Save sharing**. Players only ever see the *Everyone* fields; empty fields are left
out for them. In your list each record shows **Hidden**, **All players** or the chosen players'
names.

## Sorting and finding

- Records are grouped by kind (Operations, Locations, Organisations, Clues), A–Z.
- Search by name, or show one kind only.
- **Tags** (the same list as for NPCs, e.g. *Hollow Creek*) are GM only: you can tag records and
  show one tag, players don't see tags.

## Aliases (GM)

Under **Aliases (GM only)**, type other names separated by commas (e.g. *The Hollow, the Choir*)
and press **Save aliases**. At most 10, each up to 40 characters. Players never see them.

## Tagging records in posts (step 2)

Type `@` and the first letters of a record's name: records appear in the list with their kind
(*Location*, *Clue*…), after the players and NPCs. The person icon in the toolbar lists them too.

- When the post is sent, the tag becomes a small chip with the kind's icon (a pin for locations,
  a building for organisations, a magnifying glass for clues, a folder for operations). Clicking it
  opens the record in the Case file. Renaming the record later updates old posts.
- **Players** can tag records they have been shown. To a player, a record they can't see is plain
  text: they see the name that was written, nothing more.
- **Aliases:** you can also tag by an alias (*The Hollow · alias of The Fellowship*). Players see
  the alias as plain text and can't tell which record it is; you see *Alias of …* when you point
  at it.

## Activity and notes (step 2)

Each record has an **Activity** tab next to **Profile**:

- **Mentions:** posts that tag the record or name it (for you, also by its aliases). Players only
  get posts they could read anyway; whispers to others and private rooms are left out.
- **Notes:** you and the players can add notes, as on characters. A player's note is for them and
  you, or for everyone who can see the record. Yours are GM only or for everyone. Each note can
  carry an in-game date. Type `@` (or use the tag button) to tag an NPC or record, as in posts:
  the note shows it as a chip that opens it. Tags turn back into `@Name` while you edit a note.
- **Changes** (you only): created, renamed, field edits, moves between Everyone and GM only,
  sharing, aliases, and links added, removed, changed or reversed (on both ends).

## Links (step 3)

Records and characters can be linked to each other with a short label, for example
*Kowalski — deputy at → Sheriff's office* or *Bloody glove — found at → Hollow Creek morgue*.
Each link shows in a **Links** section at the bottom of the **Profile** tab of *both* ends (a
record in the Case file, or a character in the Characters panel).

- **Adding (GM):** press **Add link**, choose what to link to (PCs, NPCs and records are listed in
  groups), a label and who can see it. The form shows the link as a sentence; if it reads the
  wrong way round, press the **⇄** button beside it, so it doesn't matter which end you add it from.
  Typing in the label offers *part of*, *found at*, *works for*, *member of*, *located in* and *knows*, but any
  label up to 60 characters works.
- **Who sees it:** a new link is **GM only**. Press **Show** to show it to players: a player then
  sees it only if they can also see **both** ends. A link to a hidden clue stays hidden until the
  clue is shown. **Hide** takes it back.
- **Editing:** **Edit** changes the label; the **⇄** button swaps the two ends of an existing link
  (*The Cult — pays → Dr Hale* becomes *Dr Hale — pays → The Cult*); **Remove** (with a second click to confirm) deletes the
  link. To point a link somewhere else, remove it and add a new one.
- **Opening:** click the other end to open it. A record opens in the Case file, a character in the
  Characters panel.
- Deleting a record or a character removes its links. Archived campaigns are read-only.

## Clues (step 4)

A clue's **Profile** tab starts with a **Clue** box:

- **Status:** *Unexamined* (every new clue), *Investigated* or *Resolved*. You change it with the
  drop-down; players see it as a badge on the clue and in their list. The list has a
  **clue status** filter (for example *Investigated clues*) as soon as there are clues.
- **Found:** **Edit found** records which PC found it, where (one of your locations) and the
  in-game date, all optional. A new find starts on the campaign's current date. **Clear** removes
  all three. Players see *Found by Agent Reyes at Hollow Creek morgue on Fri 24 Oct 1997*, but a
  name only appears if they can see that PC or location; the names open the character or record.
- **GM checklist** (only you): what the clue really points to, one line each, for example *The
  glove belongs to Dr Hale*. Tick a line once the agents have worked it out; the box shows how
  many are done (*1 of 2 worked out*). The × removes a line.

Status and found changes appear in the clue's history (Activity → Changes). Players write their
theories as **notes** on the clue.

## Coming next

Phase 2b is complete. Possible later additions: a timeline drawn from in-game dates, and notes that
tag a record or NPC showing up in *that* one's Activity too.

<!-- cspell:locale en-GB,en -->
