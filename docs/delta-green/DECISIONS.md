# Decision Log

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-11-16 | Fork `alvarocavalcanti/ttrpgpbp` on GitHub; develop from a fresh clone in `C:\dev\` (outside OneDrive). Upstream = original repo, origin = fork | Enables upstream merges; avoids OneDrive sync problems with `node_modules`/Docker |
| 2 | 2026-11-16 | Install Docker Desktop (WSL2) and run Supabase locally for development | Safe, resettable local database; production uses hosted Supabase later |
| 3 | 2026-11-16 | Players sign in with Google OAuth (own Google Cloud OAuth client) | Free, no SMTP provider needed |
| 4 | 2026-11-16 | Keep upstream `AGENTS.md` untouched. Follow its database rules (explicit grants, RLS + test per new table, migration ordering, regenerate types). Do not follow its caveman style, worktree-per-session or 100% coverage rules; target ~80% coverage on our code | Keeps safety rules, fits a solo hobby fork, avoids merge conflicts |
| 5 | 2026-11-16 | Custom tables prefixed `dg_` in `public` schema; custom UI in `src/features/dg/`; custom Edge Functions `dg-ai-*`; hook points in upstream files marked `// DG-EXT:` | Isolation from upstream for easy merges (see 00-repository-assessment.md §4) |
| 6 | 2026-11-17 | Make upstream's git hooks pass on Windows by fixing the 12 Windows-only test failures (cross-platform edits, one win32 test skip) instead of bypassing hooks | Keeps the full safety net (build, tests, E2E) on every push. The fixes could also be offered to upstream |
| 7 | 2026-11-17 | Post authorship via time-ranged **posting periods** (player → agent, from/to), not by stamping each message. Applies to chat posts and the roll history list | No changes to upstream message code; history correctable; agent-specific roll labels for ~2 lines |
| 8 | 2026-11-17 | NPCs hidden from players until revealed. Character profiles are per-field records, each toggled **Agent-visible / Handler-only**, enforced by RLS | Owner wants fine-grained control of what agents know; privacy enforced by the database |
| 9 | 2026-11-17 | Players control up to **3 agents** at once and switch which one they post as; switching only to agents with status *active* | Agents get sidelined temporarily; posts must stay with the right agent |
| 10 | 2026-11-17 | Automated per-character **activity log**: lifecycle events (triggers), posts as the character, name/alias mentions (text match), and Handler notes, each with visibility; assembled with the viewer's permissions | Owner request: track what happens to/about NPCs without manual bookkeeping; no AI cost |
| 11 | 2026-11-17 | Players are told to keep agent names short (no titles) because upstream truncates membership names to 20 characters | Avoids touching upstream's 20-char limit |
