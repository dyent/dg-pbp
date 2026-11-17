# Repository Assessment: Role by Post → Delta Green PBP Platform

*Assessment date: 2026-11-16. Based on the source in `ttrpgpbp-main` (downloaded ZIP of
`alvarocavalcanti/ttrpgpbp`, `main` branch). Every claim below was checked against the source,
not the project's marketing.*

---

## 1. Summary of the existing application

Role by Post is a **mature, actively developed, security-conscious** PBP app. It is
much more than a prototype:

- ~200 database migrations between Aug and Nov 2026 (near-daily changes upstream).
- ~110 database (pgTAP) test files plus a large frontend test suite.
- Several formal security / UX audits in `docs/audit/`.
- MIT licence: you may fork, modify and self-host freely; keep the copyright notice.

### Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Router 7 | Installable mobile-first PWA |
| Backend | **Supabase** (hosted Postgres + Auth + Realtime + Storage + Edge Functions) | No separate app server. The browser talks to the database directly; security lives *in the database* |
| Business logic | Postgres functions ("RPCs", `SECURITY DEFINER`) + Row-Level Security (RLS) policies | e.g. `send_message`, `roll_dice`, `join_channel` |
| Server code | 5 Supabase Edge Functions (Deno/TypeScript): `upload-image`, `push-notifications`, `push-receipt`, `cleanup-images`, `delete-account` | This is where AI calls would go |
| Auth | Supabase Auth: Google OAuth and email magic link | No passwords |
| Search | Postgres full-text search (`tsvector`) on messages | Free; no vector search yet |
| Testing | Vitest + Testing Library + MSW; pgTAP SQL tests; Playwright | Husky git hooks run lint/tests on commit/push |
| Hosting (reference) | Cloudflare Pages (frontend) + Supabase cloud (backend), deployed by GitHub Actions | All free tiers |

### Core concepts and how they map to Delta Green

| Role by Post concept | Table | Delta Green meaning |
|---|---|---|
| **Channel** | `channels` | **Campaign** (one channel = one campaign) |
| Channel GM (`channels.gm_id`) | — | **Handler** (exactly one per channel) |
| **Channel member** | `channel_members` | A player *and* their character (one row per user per channel) |
| **Room** (sub-channel) | `sub_channels` | Scenes / locations / operation threads. Visibility `all`, `gm` or `private` (Handler + invited players). Max 10 active rooms per channel; older ones can be archived |
| Message types | `messages.type` | `regular`, `scene` (Handler scene break), `npc` (Handler speaking as an NPC), `dice_roll`, `system` |
| Whisper (`whisper_to`) | `messages` | Private message: sender + one recipient + Handler |
| NPC roster | `channel_npcs` | **Only name + portrait.** No profile, motives or secrets |
| Campaign Notes | `channel_notes` | Plain-text notes scoped `character` (author + GM), `party` (everyone) or `gm` (GM only), max 4,000 characters |
| Channel status | `channels.status_text` / `sub_channels.status_text` | Pinned markdown banner (time, location, conditions) |
| Character data | `channel_members.character_name` (max 20 chars), `attributes` (JSON), `character_notes` (500 chars), `character_sheet_url` | Very thin. No real character sheet |
| Dice | `dice_rolls` + `roll_dice` RPC | Server-side, tamper-proof rolls. d100 supported. **No roll-under/percentile skill check**, no Delta Green criticals |

### Existing PBP features (keep all of these)

Campaign channels with invite links/passwords · player and GM roles · per-channel character
name, avatar, notes and sheet link · markdown posts, replies, reactions, mentions, 15-minute edit
window, soft delete · scene breaks · NPC posting with a roster and portraits · whispers · rooms with
private audiences · server-side dice with history and favourites · image uploads (maps, handouts) to
private storage · web push notifications, unread counts and badges · "active player" turn
indicators · away messages · full-text search · chat export · campaign notes · safety tools
(Lines & Veils, X-Card) · archive channels · admin console · GDPR data export / account deletion.

Not needed for a private game, but harmless if left alone: the public game directory, marketing
pages, SEO prerendering, Google Analytics, Sentry and the age/terms gates. **Don't delete them.**
Leave them unconfigured, because removing them would cause endless merge conflicts with upstream.

---

## 2. Permission and privacy model

This is the most important finding, and it's good news.

- **Every table has Row-Level Security.** The database itself decides which rows each user can
  see. Visibility does not depend on the frontend hiding things.
- Helper functions `is_channel_member(channel_id)` and `is_channel_gm(channel_id)` are the basis of
  nearly every policy. Blocked or suspended users are excluded automatically.
- Whispers and restricted rooms are filtered **at the database level** for message reads, unread
  counts, previews and search.
- All writes to important data go through server functions that check permissions. A client can't
  forge a dice result or post as an NPC.
- Grants are explicit. A test (`supabase/tests/20261021091717_public_table_grant_coverage.sql`)
  fails if a new table is exposed without RLS.

**Why this matters for AI:** your requirement that "restrictions are enforced through
permissions and data retrieval, not by instructing the AI" fits this architecture directly. If an
AI request for a *player* fetches its context **using that player's own login token**, RLS makes
Handler-only secrets impossible to retrieve. They never reach the prompt at all. Handler requests
use the Handler's token and see everything the Handler can see.

**Gap:** the model has three audiences: *GM*, *party*, and *a specific user*. It has no concept of
"what a particular **character** knows", and no "source material vs. canon vs. AI suggestion"
layer. Both must be added (see §4).

---

## 3. Significant findings, risks and limitations

### 3.1 Character rotation breaks post history *(important)*

- `channel_members` has a unique key on `(channel_id, user_id)`. A player can hold **only one
  character identity per campaign**, stored on the membership row.
- Messages store only `sender_id` (the user). The author name is looked up **live** from the
  member's *current* character (`src/features/chat/MessageItem.tsx:292`).
- **Consequence:** if Agent A dies and the player renames their membership to Agent B, **every
  old post by Agent A would display as Agent B.**

**Fix:** keep our own `agents`/characters table, and record which character wrote each post. A
small side table filled by a database trigger means we don't have to rewrite upstream's
`send_message`. `MessageItem` then needs a small UI change to prefer that name. This is the one
place where touching upstream frontend code is unavoidable early on.

### 3.2 NPCs are only a name and a portrait

`channel_npcs` holds `name` + `avatar_url`. Messages snapshot the NPC name, so history is stable.
The full NPC profile (personality, motives, secrets, knowledge, status) belongs in our own table,
linked to the existing roster entry so the Handler keeps the existing "post as NPC" feature.
Converting a retired PC into an NPC = change the character's type, and create a roster entry for
posting.

### 3.3 Upstream moves fast, and key files are large

- `ChannelView.tsx` (~60 KB), `MessageComposer.tsx` (~52 KB), `MessageItem.tsx` (~57 KB),
  `useMessages.ts` (~55 KB) change often upstream. **Every edit we make to these is a likely future
  merge conflict.** Limit edits to small, clearly marked "hook points" (e.g. one extra sidebar
  entry, one extra button), and put the real work in our own files.
- **Migration ordering:** Supabase's `db push` refuses a migration whose timestamp is earlier than
  the newest one already applied. Upstream migrations we merge later may be timestamped *before*
  ours. Because it's our own database, we can safely use `supabase db push --include-all` after a
  merge. This needs documenting in our CLAUDE.md, because upstream's own rules forbid that flag for
  *their* deployment.

### 3.4 Upstream's AI-agent instructions file (`AGENTS.md`)

The upstream repo contains `AGENTS.md` with instructions aimed at AI coding tools: a terse
"caveman" response style, a git-worktree-per-session workflow, 100% test coverage targets, help
screenshot regeneration and so on. Some of its rules are valuable (migration ordering, explicit
grants, RLS tests for every new table). Others don't suit a solo hobby fork. **We leave
`AGENTS.md` untouched** (to avoid merge conflicts) and write our own `CLAUDE.md` saying which of its
rules we follow.

### 3.5 Windows development environment

- npm scripts and git hooks call `sh` (shell scripts). On Windows this needs **Git for Windows**
  (which provides Git Bash).
- The local Supabase stack runs in **Docker**, so you need Docker Desktop with WSL2.
- The project expects **Node 26** (`.nvmrc`); this machine has Node 22.
- **The project currently lives in OneDrive.** OneDrive syncing `node_modules` (tens of thousands
  of files) and Docker volumes causes slowness and file-lock errors. Recommend developing in
  `C:\dev\...` (outside OneDrive) and relying on GitHub as the backup.
- The downloaded folder is a ZIP, **not a git clone**. It has no history, so upstream updates
  can't be merged into it. It must be replaced by a proper clone of your fork.
- No Git, Python or Docker is currently installed.

### 3.6 Hosting and free-tier constraints

- Supabase free tier: limited database/storage size (fine for 4–5 users), and **free projects are
  paused after a period of inactivity** (currently about a week; check current terms). An async PBP
  game can go quiet for a week. Mitigations: a free scheduled ping (GitHub Actions cron, a pattern
  the repo already uses), or Supabase's paid tier later if it becomes annoying.
- Edge Functions have CPU-time limits, so heavy PDF parsing inside them is risky (see §5).
- Upstream's `supabase/config.toml` contains upstream's Google OAuth client ID and domains. You'll
  need your own values. That is a small, isolated edit, but it's in a file upstream also edits.
- Upstream's GitHub workflows (`deploy.yml`, `migrate.yml`, `cleanup-images.yml`) will run on your
  fork and fail without secrets. Disable them in the fork's GitHub settings, or adapt them later.
- Image uploads are **off by default** (`app_settings.image_uploading_enabled`). Turn them on for
  handouts and maps.
- Production builds require `VITE_CONTROLLER_NAME` / `VITE_CONTROLLER_EMAIL` (shown in the privacy
  policy).

### 3.7 Copyright of published adventures

Uploaded Delta Green adventures must stay in **private** storage, visible to the Handler only.
Player-facing AI must never be able to quote source text. Both are handled by RLS (§2). Sending
adventure text to the Anthropic API for your own use is a normal personal-use workflow. Don't
make the source library shareable.

---

## 4. Recommended architecture for extending it

### Guiding rule: add alongside, don't modify

```text
Upstream (untouched as far as possible)          Our additions (isolated)
──────────────────────────────────────           ─────────────────────────────────────
channels, channel_members, messages,     ◄──FK── dg_* tables (agents, npcs, clues, ...)
sub_channels, channel_npcs, notes                dg_* RPCs + RLS policies
src/features/channels, chat, dice ...    ◄─hook─ src/features/dg/...   (our UI)
supabase/functions/upload-image ...              supabase/functions/dg-ai-*  (AI calls)
docs/*                                            docs/delta-green/*   (our docs)
```

- **Database:** new tables prefixed `dg_` in the `public` schema. They reference upstream tables by
  foreign key (`channel_id`, `user_id`, `message_id`) and never alter them, apart from the
  rare exception that is documented. Prefixing keeps them visually separate and keeps all the
  existing tooling (type generation, RLS coverage test) working without config changes. *(A
  separate Postgres schema is the purer alternative, but it needs Supabase API config changes and
  extra client code. Not worth it yet.)*
- **Frontend:** everything in `src/features/dg/`. Upstream files get only minimal, commented hook
  points (marked `// DG-EXT:` so they are easy to find during merges).
- **Server/AI:** new Edge Functions `supabase/functions/dg-ai-*`. The Anthropic API key is stored as
  a Supabase secret, never in the browser.
- **Docs:** `docs/delta-green/` + our own `CLAUDE.md`.
- **Migration log:** `docs/delta-green/MIGRATIONS.md` lists every migration we add and why.

### Proposed data model (Phase 2 sketch, not final)

| Table | Purpose |
|---|---|
| `dg_operations` | Operations/adventures within a campaign (channel). Status, dates, summary, optional link to rooms |
| `dg_characters` | **Every person**: agents (PCs) and NPCs in one table with `kind` = `pc`/`npc`. Status: active, unavailable, retired, incapacitated, deceased, insane, missing. Profile fields, controlling user (for PCs), link to `channel_npcs` for posting voice. PC→NPC conversion = change `kind` and keep everything |
| `dg_message_authors` | Which character wrote each post (fixes §3.1). Filled by trigger |
| `dg_locations`, `dg_organisations` | Places and groups |
| `dg_clues` | Evidence records: description, source, location, discovered by, status (unexamined/investigated/resolved), interpretations |
| `dg_events` | Timeline entries |
| `dg_relationships` | Generic link table: any record ↔ any record, with a description (NPC↔org, clue↔event, etc.) |
| `dg_knowledge` | **Who knows what:** (character → clue/record), with how and when they learned it. Belongs to the *character*, not the player, so Agent A's knowledge dies with Agent A |
| `dg_sources` / `dg_source_chunks` | Uploaded adventure documents and their extracted, searchable text (Handler-only) |
| `dg_proposals` | **AI suggestions awaiting Handler approval** (extracted NPCs, proposed summaries, suggested links). Nothing becomes canon until approved |
| `dg_audit_log` | History of important changes (who, what, when, before/after) |

Every record carries two labels:

- **`provenance`** = `source` (from the published adventure), `canon` (Handler-approved
  campaign fact), or `ai_suggestion`. This implements your source/canon/AI distinction directly.
- **`visibility`** = `handler`, `party`, or specific players. Enforced by RLS policies built on the
  existing `is_channel_gm` / `is_channel_member` helpers.

### AI integration pattern

1. **Event-driven only.** AI runs when a button is pressed or a specific event happens (e.g.
   "Analyse my post", "Suggest NPC reply", "Import document"). It never runs on keystrokes or page
   loads.
2. **Retrieval before generation.** The Edge Function gathers a small, relevant context: the
   character, what *that character* knows, the NPCs and locations in the scene, and the last N posts.
   It never sends the whole campaign.
3. **Run as the requesting user.** Context is fetched using the caller's login token, so RLS
   filters out anything they shouldn't see (§2).
4. **AI writes only to `dg_proposals`**, never directly to canon, character stats or Bonds.
5. **Deterministic rules in code.** Dice, skill checks, SAN/HP changes and Bond values are
   calculated by database functions (like the existing `roll_dice`). The AI may explain a result
   but never computes or changes one.
6. **Log every call** (tokens, cost, feature) to a `dg_ai_usage` table so spending is visible.

### Search / retrieval

Start with **Postgres full-text search** (free, already used by the app). Add vector/semantic
search later **only if** keyword search proves inadequate. Supabase supports `pgvector`, and free
embedding options exist. Anthropic doesn't sell an embeddings model, so this is a separate decision.

---

## 5. Adventure import: challenges

| Challenge | Recommendation |
|---|---|
| PDFs are large (a published op is roughly 40–120 pages) | Store the PDF in private storage. Extract text **in the browser** with `pdf.js` (free, avoids Edge Function CPU limits), store page-chunked text in `dg_source_chunks` |
| Layout: sidebars, two columns, stat blocks, handouts | Text extraction will be imperfect. Claude can also read PDFs directly (visual layout included) when a section needs it, at higher token cost |
| Scanned/image-only PDFs | Need OCR. Claude's PDF input handles these; budget for it per document |
| Extraction accuracy | Extract **per section** into structured JSON (NPCs, locations, clues, events), always as `dg_proposals`. Handler reviews in a side-by-side "source page ↔ proposed record" screen |
| Duplicates across chapters | Proposal review offers "merge with existing record" |
| Spoilers | Source material is Handler-only by RLS; player-facing AI never searches it |
| Cost | One-off per adventure; can use the Batch API (50% discount) since it isn't urgent |

---

## 6. AI cost estimate (Anthropic API, prices as of Nov 2026)

| Model | Input / 1M tokens | Output / 1M tokens | Good for |
|---|---|---|---|
| Claude Haiku 5.5 | $0.10 | $0.50 | Routine checks: grammar, simple continuity warnings |
| Claude Sonnet 5.5 | $2.00 | $10.00 | Adventure extraction, NPC dialogue, campaign Q&A |
| Claude Opus 5.5 | $4.00 | $20.00 | Occasional deep analysis (e.g. end-of-operation review) |

Discounts: cached prompt prefixes are ~90% cheaper to re-read, and the Batch API is 50% cheaper.

Rough monthly figures for a 4-player game (~150 posts/month):

| Task | Approx. cost |
|---|---|
| Post analysis on every post, Haiku (~8k tokens context each) | ~$0.20/month |
| Same on Sonnet | ~$4/month |
| 30 Handler NPC/Q&A requests, Sonnet | ~$1–2/month |
| Importing one 80-page adventure, Sonnet (batch) | ~$0.25–$1 one-off |

**Realistic total: a few dollars a month or less.** Build with a per-feature model setting and a
monthly spending cap, so you can tune quality against cost after real use. These are estimates.
Once built, we measure actual usage from the logs.

---

## 7. Proposed roadmap

Each step is small, testable, and ends with a commit.

**Phase 1: Foundation (no features).** Steps:

1. Install Git for Windows, Node 26 (via `fnm` or `nvm-windows`), Docker Desktop (WSL2), VS Code
   extensions.
2. Create your GitHub fork; clone it to `C:\dev\dg-pbp` (outside OneDrive); add `upstream` remote.
3. `npm install`, `npm run supabase:up`, `npm run dev`: run the app locally unchanged.
4. Run upstream's tests to confirm a green baseline.
5. Write `CLAUDE.md` (architecture, conventions, which AGENTS.md rules we follow, upstream-merge
   procedure) and `docs/delta-green/`.
6. Practise one upstream merge (`git fetch upstream; git merge upstream/main`) so the routine is
   known before we have custom code.
7. Create a hosted Supabase project + Cloudflare Pages deploy for real play (can wait until the MVP
   is near).

**Phase 2a: Agents & continuity**: `dg_characters`, statuses, post-author tracking (§3.1),
PC→NPC conversion, Handler UI to manage them. *(MVP items 3, 4, 12)*

**Phase 2b: Campaign records**: operations, locations, organisations, clues, events, relationships,
character knowledge, provenance/visibility, audit log. *(MVP items 1, 2, 7)*

**Phase 3: Adventure import**: upload, browser text extraction, AI extraction to proposals,
review/approve screen. *(MVP items 5, 6)*

**Phase 4: First AI features**: post analysis (continuity + knowledge violations + optional
writing suggestions), Handler approval of proposed updates, usage logging. *(MVP items 9–11)*

**Later:** Delta Green character sheet, percentile skill rolls with DG criticals, SAN/HP/Bonds,
home scenes, reminders, NPC dialogue suggestions, campaign Q&A, visualisations.

MVP item 8 ("play through the existing PBP interface") works as soon as Phase 1 is done.

---

## 8. Decisions needed before implementation

Only the ones that block Phase 1:

1. **Project location & fork:** OK to create a GitHub fork and work from a fresh clone in
   `C:\dev\` (outside OneDrive), replacing this ZIP copy?
2. **Local dev with Docker:** OK to install Docker Desktop (needed for a local database)? The
   alternative is developing directly against a free hosted Supabase project. That's simpler to
   install, but riskier (no throwaway local data) and slower to reset.
3. **Sign-in method for your players:** Google sign-in (needs a free Google Cloud OAuth setup), or
   email magic link (needs a free SMTP provider such as Resend for real emails)?
4. **Upstream `AGENTS.md` rules:** adopt its database rules (explicit grants, RLS test per table,
   migration ordering) but relax the rest (no "caveman" style, no worktree-per-session, ~80% test
   coverage on our code instead of 100%)?

Decisions for later phases (no need to answer now): hosting for real play, the Australian
setting, the exact character status list, the AI model per feature, and whether to add vector
search.

<!-- cspell:locale en-GB,en -->
<!-- cspell:words pgvector criticals prerendering -->
