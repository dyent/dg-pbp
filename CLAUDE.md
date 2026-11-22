# CLAUDE.md: Delta Green PBP (fork of Role by Post)

Personal, AI-assisted play-by-post platform, built for running a Delta Green campaign. It extends
[alvarocavalcanti/ttrpgpbp](https://github.com/alvarocavalcanti/ttrpgpbp) ("upstream") without
rewriting it. The owner is a GM with limited coding experience, so explain decisions in plain
language, work in small steps, and ask before architectural changes.

## Terminology: generic unless Delta Green-specific (DECISIONS.md #12)

Features that any game could use stay **system-agnostic**: say **GM**, **player**, **character /
PC**, **NPC** in code, database values, UI text and docs. Delta Green words (Handler, Agent,
Sanity, Bonds, Home scenes) appear only in features that genuinely implement Delta Green rules.
Test data may use Delta Green flavour names.

Read first: [docs/delta-green/00-repository-assessment.md](docs/delta-green/00-repository-assessment.md)
(architecture + plan) and [docs/delta-green/DECISIONS.md](docs/delta-green/DECISIONS.md) (decision log).

## Relationship to upstream `AGENTS.md`

`AGENTS.md` is upstream's file. **Never edit it** (merge conflicts). Where it conflicts with this
file, **this file wins** (owner decision 2026-11-16, DECISIONS.md #4).

Follow from AGENTS.md:

- All **Database Migrations** rules: explicit grants in the same migration, RLS enabled + policies
  on every new table, a pgTAP test per new table (positive + negative case), never edit an applied
  migration, regenerate `src/types/database.ts` after every schema change.
- UI Best Practices (validation, empty/loading/error states, accessibility, mobile + desktop).
- Testing strategy and fake-timer advice.

Do **not** follow from AGENTS.md:

- The "caveman" terse response style. Write normal, clear prose.
- `rtk` prefixes, ctags/ast-grep discovery protocols.
- Git worktree per session / PR-only workflow. Solo fork: work on `main` (or a short-lived
  branch for bigger features), commit at sensible milestones **after asking the owner**.
- 100% coverage goal. Target ~80% coverage on *our* code.
- CHANGELOG / help-screenshot / FEATURES.md upkeep for upstream features. Document our features in
  `docs/delta-green/` instead.
- `--include-all` ban: on *our own* database `supabase db push --include-all` is allowed after an
  upstream merge brings in migrations older than ours.

## Architecture (short version)

- **Frontend:** React 19 + TypeScript + Vite + Tailwind, PWA. `src/features/*` per feature.
- **Backend:** Supabase. Postgres with Row-Level Security (RLS) on every table, `SECURITY DEFINER`
  RPCs for writes, Realtime, Storage (`images` bucket, private), Auth (Google OAuth).
- **Server code:** Supabase Edge Functions (Deno) in `supabase/functions/`.
- **Mapping:** channel = campaign · channel GM = GM · room (`sub_channels`) = scene/thread ·
  `channel_npcs` = NPC posting identities (name + portrait only).
- Upstream resolves message author names **live** from `channel_members.character_name`. Our
  posting periods (`ext_posting_periods`) + `PostAuthorshipProvider` label each post and roll with
  the character active at the time instead.

## Isolation conventions (keep upstream merges easy)

| What | Where / how |
|---|---|
| Our tables, RPCs | Schema `public`, prefixed **`ext_`** for generic fork features (characters, posting, activity, campaign records) and **`dg_`** only for Delta Green-specific rules (Sanity, Bonds…). Internal helpers use a double underscore (`ext__…`) and get no API grants. Reference upstream tables by FK; don't alter them |
| Our migrations | `supabase/migrations/<timestamp>_ext_<name>.sql` (or `_dg_`); log each one in `docs/delta-green/MIGRATIONS.md` |
| Our DB tests | `supabase/tests/<timestamp>_ext_<name>.sql` (or `_dg_`) |
| Our frontend | `src/features/ext/` (generic), `src/features/dg/` (Delta Green-specific, later) |
| Our Edge Functions | `supabase/functions/ext-*` (AI: `ext-ai-*`) |
| Our docs | `docs/delta-green/` |
| Edits to upstream files | Minimal hook points only, marked with a `// FORK-EXT:` comment (or `-- FORK-EXT:` in SQL). List them in `docs/delta-green/UPSTREAM-TOUCHPOINTS.md` |
| App display name | `VITE_APP_NAME` (default "Role by Post"); locally in gitignored `.env.development.local` so tests keep the default. Read via `APP_NAME` in `src/features/ext/branding.ts`. Upstream credit (About/legal pages) stays "Role by Post" |

## Core product rules (non-negotiable)

- **Three kinds of information:** `source` (published adventure), `canon` (GM-approved), and
  `ai_suggestion`. Source never overrides canon.
- **AI never writes canon, character stats or Bond values directly.** AI output goes to a proposals
  table for GM approval.
- **Knowledge belongs to characters, not players.** A replacement character doesn't inherit a dead
  character's knowledge.
- **Privacy is enforced by RLS and retrieval, not by prompting.** Player-facing AI fetches context
  with the player's own JWT so GM-only data can't be retrieved.
- **Rules maths is deterministic code** (DB functions), never the AI.
- **AI calls are event-driven** (button/explicit trigger), with minimal retrieved context, cheap
  models for routine work, and usage logging. The Anthropic API key lives only in Supabase secrets.

## Development environment (Windows 11)

- Repo at `C:\dev\dg-pbp` (outside OneDrive). Remotes: `origin` = github.com/dyent/dg-pbp,
  `upstream` = alvarocavalcanti/ttrpgpbp (push disabled).
- Node 26 via **fnm**. Docker Desktop (WSL2) for local Supabase. Git for Windows.
- npm runs scripts with Git Bash (`npm config set script-shell "C:\Program Files\Git\bin\bash.exe"`,
  user-level). This is needed because the `supabase:*` scripts are POSIX `sh`.
- If a tool "isn't recognised" in a fresh shell, refresh PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); fnm env --shell powershell | Out-String | Invoke-Expression`

### Everyday commands

| Task | Command |
|---|---|
| Start local DB (+ writes `.env.local`) | `npm run supabase:up` |
| Stop local DB | `npm run supabase:down` |
| Wipe + re-apply all migrations | `npm run supabase:reset` |
| Local DB admin UI (create test users) | <http://localhost:54323> |
| Local email inbox (magic links) | <http://localhost:54324> |
| Run the app | `npm run dev` → <http://localhost:5173> |
| Frontend tests | `npx vitest run` (or `npm test` for watch mode) |
| Lint | `npm run lint` |
| New migration | `npx supabase migration new dg_<name>` |
| Apply new migrations locally | `npx supabase migration up` |
| DB tests (clean) | `npm run supabase:reset` then `npx supabase test db` |
| Regenerate DB types | In **Git Bash**: `npx --yes supabase@2.117.0 gen types typescript --local > src/types/database.ts` |

### Test baseline and git hooks (2026-11-17, Windows)

Upstream's suite originally had 12 Windows-only failures. We fixed them with small cross-platform
test edits (listed in `docs/delta-green/UPSTREAM-TOUCHPOINTS.md`). The baseline is now **fully
green**:

- `npm run test:coverage`: 3,711 passed, 11 skipped after Phase 2b step 1
  (`scripts/usage-report/run.test.ts`, skipped on Windows only), ~96% line coverage. Thresholds:
  80% lines/functions/statements, 81% branches.
- `npx supabase test db`: 958 database tests pass.
- `npx playwright test`: 36 end-to-end tests pass (needs the local stack running).

Git hooks (Husky) run automatically and must pass. **Never bypass them with `--no-verify`.**

- **pre-commit:** type-check of staged migrations, `oxlint`, Markdown lint, spellcheck (~1 min).
- **pre-push:** `npm run build`, full coverage test run, Playwright E2E (~3–5 min). Keep the local
  stack up (`npm run supabase:up`) before pushing.

**Type generation must use CLI v2.117.0.** Upstream's CI pins `supabase/setup-cli` to v2.117.0
and diffs `src/types/database.ts` against its output, but `package.json` installs CLI 3.1.0, which
formats the file completely differently. Always generate with `npx --yes supabase@2.117.0 …` from
Git Bash (PowerShell redirection changes encoding/line endings). A correct regeneration only adds
lines for our new objects.

**Database tests need a clean database.** The Playwright E2E run (pre-push) leaves listed test
campaigns behind, which makes upstream's public-directory pgTAP tests fail. Run
`npm run supabase:reset` before `npx supabase test db`. Baseline after Phase 2b step 1: 1,282
database tests pass. Who-can-see-what is documented in `docs/delta-green/PERMISSIONS.md`; keep it
in step with any access change.

**Our migrations were rewritten in place once** (2026-11-17, `dg_` → `ext_` and generic terms)
because nothing had been deployed. From the first deployment onwards, applied migrations are
immutable: fix forward with a new migration.

**Teardown errors (fixed 2026-11-18):** `EnvironmentTeardownError: Closing rpc while
"onUserConsoleLog" was pending` from `ChannelView.test.tsx` was mostly caused by *our*
post-authorship hook making real network calls inside upstream's test and logging after it ended.
That test now mocks `usePostingIdentities`. Rule: when our code runs inside an upstream component,
the upstream test must mock our data hooks (as it mocks upstream's own). If the error still appears
occasionally under full load and every test passed, re-run the push.

**No database views:** adding a view to `public` changes the generated Supabase client types so
that many upstream tests stop type-checking. Expose read projections as SQL functions (RPCs)
instead, e.g. `dg_get_sheet`.

**Colours:** new code uses upstream's semantic Tailwind names (`primary-*`, `surface-*`), never raw
`indigo-*` / `gray-*`; `src/tokenAdoption.test.ts` fails otherwise.

`npm run build` needs `VITE_CONTROLLER_NAME`/`VITE_CONTROLLER_EMAIL`. Locally they come from a
gitignored `.env` with placeholder values (`supabase:up` rewrites `.env.local`, so they can't live
there).

## Merging upstream updates

```bash
git fetch upstream
git merge upstream/main
```

Then: resolve conflicts (check `docs/delta-green/UPSTREAM-TOUCHPOINTS.md` first), `npm ci`,
`npm run supabase:up`, regenerate types if migrations arrived, run tests and compare against the
baseline above, commit. Merge upstream regularly (e.g. monthly) so conflicts stay small.

## GitHub

Upstream's GitHub Actions workflows are **disabled** on the fork (they deploy to upstream's
infrastructure). We'll add our own deploy workflow when we set up hosting.

## Spelling

Our docs use British English. Each of our Markdown files ends with a
`<!-- cspell:locale en-GB,en -->` comment (plus `cspell:words` for tool names) so upstream's
pre-commit spellcheck passes without editing upstream's `.cspell.json`.

<!-- cspell:locale en-GB,en -->
<!-- cspell:words dyent TOUCHPOINTS fnm pgTAP Mailpit -->
