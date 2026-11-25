# Phase 3 Design: Adventure Import

*Agreed with the owner on 2026-11-25 (DECISIONS.md #46). Progress: **3-1 and 3-2 done** (`14-ai-setup.md`), **3-3 to 3-5 built** (DECISIONS.md #48, #49; 10 pages per run became a suggestion, up to 30). Builds on campaign records (`11-phase2b-design.md`), characters
(`03-step4-characters-design.md`) and campaign files (#29). Owner choices so far: import NPCs,
locations / organisations / clues, links and handouts; the AI always reads the **pages as they
look**; one **page range** at a time; no API key yet.*

## What it is for

You upload a published adventure. For a chapter at a time, the AI reads the pages and suggests
the NPCs, places, groups, clues and handouts in them, plus how they connect. **Nothing goes into
the campaign until you approve it.** Approved items arrive GM only, labelled **source**, so you
always know what came from the book and what you wrote yourself.

## The pieces

### 1. Source library (GM only)

A new **Sources** tab in Case files (GM only; players never see it).

- Upload an adventure PDF (up to 50 MB, the free plan's limit per file), give it a title. Stored in its **own private storage
  area** that only the campaign's GM can read, separate from campaign files, so it can never be
  shared with players by mistake (copyright, `00-repository-assessment.md` §3.7).
- Open it at any page from there or from a suggestion.

### 2. Importing a page range

- Choose a source, a page range (for example *pages 12–19*, **at most 10 pages** per run) and
  press **Import**.
- Your browser cuts those pages out of the PDF and sends them, with the **names** of what already
  exists in the campaign (so the AI can spot duplicates), to our server function. The server
  sends them to Claude **Sonnet 5.5**, which reads the pages as images and text and answers in a
  fixed format.
- A run takes up to a minute or two. Its suggestions then wait in the **review list**. You see
  what each run cost.
- Why 10 pages: the server function has a time limit (about 2½ minutes on the free plan), and
  short runs are easier to check and cheaper to redo.

### 3. Reviewing suggestions

One list per run, grouped by kind, each with the page it came from (click to open the PDF there).

| Kind | What you see | Approve creates |
|---|---|---|
| **NPC** | Name, description, role, stats if printed | A hidden NPC character, fields GM only, labelled *source* |
| **Location / organisation / clue** | Name and the default fields for its kind | A GM-only record in Case files, labelled *source* |
| **Link** | *Dr Hale — works at → Morgue* | A GM-only link, once both ends exist |
| **Handout** | Title, pages | A **GM only** campaign file made from those pages (share it when the players find it) |

For each suggestion: **Approve**, **Edit then approve**, **Merge into…** an existing NPC or record
(adds the suggested fields to it, nothing overwritten), or **Reject**. **Approve all** for a
whole run. Rejected suggestions stay in the run's list, greyed out, until you clear the run.

### 4. Source and canon

- Approved items are labelled **source** (a small badge). Once you edit a field, that field becomes
  **canon**: your version, never replaced by the book. Re-importing the same pages never
  overwrites anything; a duplicate shows as a suggestion to merge.
- NPC characters get the same source / canon label as records (a new column, nothing else
  changes).

### 5. Cost and safety

- The Anthropic API key lives only in the server's secrets, never in the app, the code or the
  chat. You create it yourself, with a spending limit set on Anthropic's side.
- Every AI call is logged (feature, model, tokens, estimated cost); a **Usage** line in Case files
  shows this month's total.
- A **monthly cap** (default **$5**) is checked before each call; when it is reached, imports stop
  until next month or until you raise it.
- Players can't reach any of this: the source library, runs and suggestions are GM only by
  row-level security, and the server function refuses anyone but the campaign's GM.

## Rough cost

Reading pages as images costs more than plain text: roughly **$0.10–$0.25 per 10 pages** with
Sonnet 5.5, so **about $1–$3 for an 80-page adventure**. Re-running a range costs the same again.

## Delivery in steps (each tried and committed separately)

1. **3-1 Source library:** private storage, upload, list, open at a page (no AI yet).
2. **3-2 AI plumbing:** the server function, the key as a secret, usage log, monthly cap, a
   harmless "test the connection" button. You create the API key here.
3. **3-3 Import runs:** page range → suggestions stored for review.
4. **3-4 Review:** approve, edit, merge, reject for NPCs and records; source / canon labels.
5. **3-5 Links and handouts:** link suggestions and handout files.

## Not in Phase 3

- Asking questions about the adventure (Phase 4 can add campaign Q&A over the source).
- Importing maps as pictures (handouts cover pages; cutting images out comes later if needed).
- Automatic suggestions without a button press (AI calls are always started by you).

## Open questions for the owner

Until you say otherwise, the defaults below apply: 10 pages per run with no overnight option,
merge adds missing fields only, and a $5 monthly cap.

1. Is **10 pages per run** acceptable, or would you rather have a slower overnight option for
   bigger ranges (Anthropic's batch service, half price, results within hours)?
2. **Merge** adds missing fields only. Should it also offer to replace a field you haven't edited
   yet (still *source*)?
3. Is **$5 a month** the right default cap?

<!-- cspell:locale en-GB,en -->
