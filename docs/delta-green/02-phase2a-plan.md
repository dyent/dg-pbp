# Phase 2a Plan: Agents, NPCs, Post Authorship, Activity Log

*Drafted 2026-11-17, revised the same day after owner feedback. Status: **awaiting owner
approval**.*

## Goal

By the end of Phase 2a the Handler can:

1. Create **agents** (player characters) and **NPCs** with persistent profiles, where **each
   profile field can be toggled between "Agent-visible" and "Handler-only"**.
2. Give each player a **stable of up to 3 agents**. The player switches which one they're posting
   as (e.g. while one is sidelined), and **every post and dice roll stays attributed to the agent
   who made it**.
3. Change a character's **status** (active, temporarily unavailable, retired, incapacitated,
   deceased, insane, missing), with an automatic history.
4. **Convert a former agent into an NPC**, keeping profile and history, with a ready-made NPC
   posting identity.
5. See an **automated activity log** per character: what happened *to* or *about* them in play.

Players get a read-only view of the team's agents and of NPCs the Handler has revealed. They see
only the fields marked Agent-visible.

Out of scope (Phase 2b and later): clues, locations, organisations, timeline, per-character
knowledge, Delta Green stats/Bonds, portrait uploads, player-edited profiles (with character
sheets in Phase 5), AI summaries of activity (Phase 4).

---

## 1. Profiles with per-field visibility

A character has a small **core record** plus any number of **profile fields**:

- **Core** (`dg_characters`): kind (agent/NPC), name, aliases, portrait, status, whether the
  character is **revealed to the agents** at all, link to the NPC posting identity.
- **Fields** (`dg_character_fields`): label + text + a visibility toggle (**Agent-visible** /
  **Handler-only**), in an order the Handler chooses. Standard fields are created automatically;
  the Handler can add custom ones (e.g. "Cover identity", "Known associates").

| Standard field | Default for agents | Default for NPCs |
|---|---|---|
| Occupation | Agent-visible | Handler-only |
| Appearance | Agent-visible | Handler-only |
| Personality | Agent-visible | Handler-only |
| Background | Agent-visible | Handler-only |
| Speech & mannerisms | Agent-visible | Handler-only |
| Current whereabouts | Agent-visible | Handler-only |
| Motivations | Handler-only | Handler-only |
| Secrets | Handler-only | Handler-only |
| Handler notes | Handler-only (locked) | Handler-only (locked) |

On screen, a profile shows the two halves side by side ("What the agents know" / "Handler only"),
and each field has a one-click toggle to move it across.

**Enforced by the database:** a player can read a field only if the character is revealed **and**
the field is Agent-visible. Hidden NPCs and Handler-only fields never leave the database for a
player's account. Tested both ways.

*Later (Phase 2b):* "revealed to the agents" becomes "known to specific agents", tied to
per-character knowledge. The design leaves room for that.

---

## 2. Multiple agents per player, and who wrote each post

Two separate histories:

| Table | Records | Example |
|---|---|---|
| `dg_agent_controllers` | Which player controls which agent, from when to when. **Max 3 at once per player** | Sam controls Reyes and Okafor |
| `dg_posting_periods` | Which agent a player is **posting as**, from when to when. One at a time per player | Sam posts as Reyes until 3 Mar, then as Okafor |

Any post or dice roll is matched to the posting period that covers its timestamp, and shown under
that agent's name and portrait:

```text
Sam ── posting as Reyes   1 Dec → 3 Mar   (Reyes sidelined: "temporarily unavailable")
    └─ posting as Okafor  3 Mar → now
```

- **Switching:** the player (or the Handler) picks "Posting as…" from the agents they control. You
  can only switch to an agent whose status is **active**. A sidelined agent becomes available again
  when the Handler sets them back to active.
- Switching also copies the agent's name and portrait onto the player's membership, so upstream
  screens (member list, mentions, composer) show the current agent. **Upstream caps that copy at 20
  characters**, so players should keep the agent's *name* field short and leave out titles. Our own
  screens show the full name.
- **Rolls:** both the chat roll posts and the **roll history list** show the specific agent (the
  roll data already records who rolled and when).
- Campaigns with no agents set up behave exactly as before.

### Database functions (each one transaction, permissions checked inside)

| Function | Who | What it does |
|---|---|---|
| `dg_give_agent(agent, player)` | Handler | Adds the agent to the player's stable (max 3). If the player has no current agent, they start posting as this one. The first period starts when the player joined, so their earlier posts are attributed too |
| `dg_take_agent(agent, note?)` | Handler | Removes the agent from the player's stable (e.g. died, retired). Ends their posting period if active |
| `dg_post_as(agent)` | Player or Handler | Switches the player's posting identity to another active agent they control |
| `dg_convert_to_npc(agent)` | Handler | Kind → NPC, removes from any stable, creates/links an NPC posting identity with the same name and portrait. All fields, history and past posts kept |

Plain edits (status, fields, reveal) are ordinary updates. Triggers write the history entries
automatically, so they can't be skipped.

---

## 3. Automated activity log

Each character page has an **Activity** timeline that builds itself from four sources:

| Source | How it's gathered | Example entry |
|---|---|---|
| **Lifecycle events** | Database triggers | "Status: active → missing" · "Revealed to agents" · "Converted to NPC" · "Secrets field made Agent-visible" |
| **Posts as the character** | NPC posts made with the linked NPC identity; agent posts via posting periods | "Dr Hale (NPC post) in *Morgue*: …" |
| **Posts mentioning the character** | Searches the campaign's posts for the character's name and aliases (whole words) | "Agent Reyes mentioned *Hale* in *Main*: …" |
| **Handler log entries** | Handler writes a quick note, with its own Agent-visible / Handler-only toggle | "Agents bribed him for the autopsy file" |

Every entry links back to the post. Filters: by source, and "include mentions".

**Privacy:** the timeline is gathered *as the person viewing it*. A player only ever sees posts
they could already read (whispers and private rooms excluded automatically), lifecycle events and
notes marked Agent-visible, and only for revealed characters.

Aliases matter for mentions: give NPCs short aliases ("Hale", "the coroner") so posts that don't
use the full name are still caught. A mention search is a plain text match, with no AI and no
cost. It can produce occasional false matches (e.g. a common surname). In Phase 4 the AI can
summarise an NPC's activity from this same log.

---

## Data model summary (all new tables; nothing upstream altered)

| Table | Players can read | Handler | Written by |
|---|---|---|---|
| `dg_characters` | Revealed characters | All | Handler |
| `dg_character_fields` | Agent-visible fields of revealed characters | All | Handler |
| `dg_agent_controllers` | Their campaign's rows | All | Functions only |
| `dg_posting_periods` | Their campaign's rows | All | Functions only |
| `dg_character_events` | Agent-visible events of revealed characters | All | Triggers, functions, and Handler notes |

Plus a read-only function `dg_character_activity(character, …)` that assembles the timeline,
running with the viewer's own permissions.

---

## Screens

- **Sidebar:** a new **Agents & NPCs** entry (everyone), and a compact **"Posting as: Reyes ▾"**
  switcher for players who control more than one agent.
- **Agents & NPCs panel:** tabs *Agents* / *NPCs*, status badges, "active only / everyone"
  filter, empty states. Players see only revealed characters.
- **Character page:** core info + status; the two-column profile ("What the agents know" / "Handler
  only") with per-field toggles; controllers and posting history; **Activity** timeline.
- **Handler actions:** New agent / New NPC, Edit, Add field, Reveal to agents / Hide, Change
  status, Give to player / Take back, Convert to NPC (with a confirmation explaining what's kept),
  Add log entry.
- **Portraits:** reuse upstream's game-icons portrait picker plus "paste an image URL".
- Works on phone and desktop.

---

## Files

**New (ours):** `supabase/migrations/<ts>_dg_characters.sql`,
`supabase/migrations/<ts>_dg_agent_control.sql`, `supabase/migrations/<ts>_dg_character_activity.sql`,
matching `supabase/tests/…` files, `src/features/dg/characters/…`,
`src/features/dg/authorship/…`, `src/features/dg/activity/…`, docs and a short player/Handler
guide.

**Upstream files touched (small, marked `DG-EXT:`):**

| File | Change |
|---|---|
| `src/features/chat/MessageItem.tsx` | ~5 lines: use the agent active at the post's time for name/portrait, else existing logic |
| `src/features/dice/RollHistoryModal.tsx` | ~2 lines: same lookup for each roll's label |
| `src/features/channels/ChannelView.tsx` | Wrap in our provider; add our sidebar section; render our panel |
| `src/types/database.ts` | Regenerated automatically |

---

## Delivery in six steps (each tested and committed separately)

1. **Characters & fields (database):** tables, per-field visibility, reveal, history triggers,
   permission tests.
2. **Stables & posting (database):** controllers, posting periods, the four functions, tests (cap
   of 3, switching only to active agents, conversion).
3. **Authorship in chat & roll history:** provider + the two small hooks. *Check: switching agents
   leaves old posts and rolls with the old agent.*
4. **Handler panel:** list, profile with toggles, status, stables, conversion.
5. **Player view & "Posting as" switcher:** checked with a second test account.
6. **Activity log:** timeline function + UI + Handler log entries.

Each step ends with the full test suite, a click-through in the local app, and a commit. You can
stop and review after any step.

## Known limitations (accepted)

- Chat **export** and **search results** still show the player's current name (upstream code).
- Mention matching is plain text; it misses misspellings and can catch unrelated identical words.
- Players can't edit their own agents' profiles yet (planned with character sheets).

<!-- cspell:locale en-GB,en -->
<!-- cspell:words Reyes Okafor -->
