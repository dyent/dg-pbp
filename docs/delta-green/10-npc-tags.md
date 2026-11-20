# NPC Tags in Posts: How to Use Them

*Phase 2a step 5c, built 2026-11-20. Design: `07-step5-design.md`. Decisions: DECISIONS.md #36
and #37. Access: `PERMISSIONS.md`.*

Write one post in normal play-by-post style, with narration and several NPCs in it, and tag the
NPCs so readers can see who is who. *Speak as NPC* still works, but you no longer need it.

## Writing

```text
Hale looks up from the table.
@Dr Hale "The body was moved before you got here."
She glances at @The Stranger, who shrugs.
```

- Type `@` and the first letters of a name: NPCs appear in the list after the players, marked
  **NPC**. Pick one with the mouse, or with the arrow keys and Enter.
- Or press the **person icon** at the right of the formatting toolbar and pick an NPC there.
- **GM only:** the list also shows each NPC's **aliases**, marked *alias of Dr Hale*.
- Tagging an NPC never sends a notification.
- When the post is sent, each `@Name` is stored as a link to that character, so renaming the NPC
  later updates the name in old posts too.

## What everyone sees

- Every tag shows as a small **name chip** (portrait and name), wherever it sits in the line.
- **Click** a chip to open the NPC's profile. Players can only open NPCs they can see; a hidden NPC
  still shows its name and portrait in the post, but nothing more.
- **Alias tags** show the alias exactly as written, with its first letter instead of a portrait.
  Players can't tell which character it is or open it. You see *Alias of Dr Hale* when you point
  at it and can open Dr Hale from it.
- **Players** can tag NPCs they can see, by name only (they never see aliases).
- In a character's **Activity** tab, every tag of that character counts as a **mention**; alias
  tags appear only in your Activity, never in a player's. Posts there keep their formatting, and
  clicking a chip in the Activity tab switches the panel to that NPC.

## Good to know

- Editing a sent post shows the stored links (`[Dr Hale](npc:…)`); typing a new `@Name` while
  editing stays plain text. Delete and repost if you need a new tag.
- A new NPC or alias appears in the `@` list after the Characters panel is closed.

<!-- cspell:locale en-GB,en -->
