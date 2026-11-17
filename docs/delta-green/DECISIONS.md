# Decision Log

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-11-16 | Fork `alvarocavalcanti/ttrpgpbp` on GitHub; develop from a fresh clone in `C:\dev\` (outside OneDrive). Upstream = original repo, origin = fork | Enables upstream merges; avoids OneDrive sync problems with `node_modules`/Docker |
| 2 | 2026-11-16 | Install Docker Desktop (WSL2) and run Supabase locally for development | Safe, resettable local database; production uses hosted Supabase later |
| 3 | 2026-11-16 | Players sign in with Google OAuth (own Google Cloud OAuth client) | Free, no SMTP provider needed |
| 4 | 2026-11-16 | Keep upstream `AGENTS.md` untouched. Follow its database rules (explicit grants, RLS + test per new table, migration ordering, regenerate types). Do not follow its caveman style, worktree-per-session or 100% coverage rules; target ~80% coverage on our code | Keeps safety rules, fits a solo hobby fork, avoids merge conflicts |
| 5 | 2026-11-16 | Custom tables prefixed `dg_` in `public` schema; custom UI in `src/features/dg/`; custom Edge Functions `dg-ai-*`; hook points in upstream files marked `// DG-EXT:` | Isolation from upstream for easy merges (see 00-repository-assessment.md §4) |
