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
  the note shows it as a chip that opens it, and the note also appears in the tagged NPC's or
  record's own Activity. Tags turn back into `@Name` while you edit a note.
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

## Files on records

Each record's **Profile** tab has a **Files** box: **Attach a file** picks one of the campaign's
files (a handout, a map, a photo). Pictures show a small preview; **Open** opens the file;
**Remove** takes it off the record (it stays in Files). Players see an attached file only if you
have shared both the record and the file with them. A file can be attached to several records.

**Post in chat** (GM, on pictures and PDFs) puts the picture into your message box in the room you
have open; add any words and send it. A PDF's first page becomes the picture. The tick box *Also
share this file with all players in Files* is on by default. This needs picture uploads switched on
in the server settings.

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

## Sources (Phase 3, GM only)

The **Sources** switch at the top of Case files (only you see it) opens your library of published
adventures:

- **+ Add a source:** choose the PDF (up to 50 MB); the title starts from the file name. Uploading a
  big PDF takes a little while.
- **Open:** opens the PDF in a new browser tab, at the page you type (or page 1).
- **Rename** and **Delete** (with a second click to confirm; this removes the PDF too).

Sources are never shown to players and can't be shared: they live in their own storage, apart
from campaign files.

### Importing pages with AI (server admin)

- Under a source, **Import pages with AI**: enter **From page** and **To page** (PDF page numbers, as
  your PDF viewer shows them). About 10 pages works best, but a chapter of 12 is fine; the limit is
  30, and bigger runs take longer and cost more. The estimated cost shows before you start.
- Your browser cuts those pages out and sends them; Claude reads them as they look. A run takes a
  minute or two; **Reading…** shows meanwhile and the list updates by itself. One import at a time.
- When it's done, **Review** lists the suggestions by kind (NPCs, locations, organisations, clues,
  links, handouts) with the pages each came from (click *p. 14* to open the PDF there), a one-line
  summary, the suggested profile fields, and *Maybe …* when it looks like something you already
  have.
- **Split chapters:** if you import pages 1–10 and then 11–12, the second run is told what the first
  suggested. Repeats are **combined** into the first suggestion (new fields added, new details
  appended with their page), and the run says how many were combined.

### Reviewing suggestions

- **Approve** adds it: an NPC arrives **hidden**, a location, organisation, clue or operation
  **GM only**, both labelled *From the book*. The suggested text fills the standard profile fields;
  anything else (such as game statistics) becomes a GM-only extra field, and a GM-only *From the
  book* field says where it came from (title and pages). Edit it freely afterwards: once you change
  a field it is yours (*canon*), and the book never overwrites it.
- **Edit first** lets you change the name and the text before approving.
- **Merge into…** adds the suggestion to something you already have (it picks the *Maybe …* match
  for you). Only empty or missing fields are filled; nothing you wrote changes.
- **Reject** greys it out; **Undo** brings it back.
- **Links** (*Dr Hale — works at → Morgue*) can be approved once both ends exist, so approve the NPC
  and the place first. They arrive GM only.
- **Clues** come with a suggested **GM checklist** (what the clue really points to); approving the
  clue creates those lines, and merging adds any new ones.
- **Handouts** become a GM-only **picture** in **Files**, folder *Handouts*: the AI says where the
  handout sits on the page and the app cuts that part out (if no picture can be made, you get the
  pages as a PDF). The picture is attached to the clue or place it belongs to, when that exists.
  Share it with the players when they find it, or replace it with your own scan in Files.
- **Approve all waiting** adds everything still waiting except possible duplicates (those are left
  for you), in a safe order (links after NPCs and records), and says what it couldn't do.
- **Open** jumps to what was added.
- **Remove** deletes a run and its suggestions. A run that never finishes shows *Stopped* after 15
  minutes. A failed run says why (for example *There was too much on these pages*) and what it cost.

## Coming next

Phase 2b is complete (a timeline drawn from in-game dates may come later). Phase 3 (adventure
import) is built; Phase 4 adds AI checks on posts.

<!-- cspell:locale en-GB,en -->
