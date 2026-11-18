# Upstream Touchpoints

Every place we edit an **upstream** file is listed here, so merge conflicts are quick to resolve.
Each edit in code is marked with `// FORK-EXT:` (TypeScript/TSX, including `{/* FORK-EXT */}` in
JSX) or `-- FORK-EXT:` (SQL). Search for `FORK-EXT` to find them all.

## Windows test fixes (2026-11-17)

| Upstream file | What we changed | Why |
|---|---|---|
| `vite.config.ts` | `fileURLToPath` import; win32-only `test.alias` for `virtual:pwa-register` → `src/test/stubs/pwaRegister.ts` | Vitest on Windows can't resolve the PWA plugin's virtual module, so 4 suites failed to load |
| `src/tokenAdoption.test.ts` | `readSource` normalizes `\` to `/` in `rel` | Allowlist uses POSIX paths; failed on Windows |
| `src/features/marketing/FeaturesPage.test.tsx` | `assertThumbsOnDisk` derives the full-size path from the URL, not the OS path | `'/thumbs/'` replace didn't match Windows paths |
| `scripts/usage-report/run.test.ts` | `describe.skipIf(process.platform === 'win32')` | Script needs POSIX + `jq`; it's upstream's own hosted-project tool |

All four are cross-platform fixes with identical Linux behaviour, so they're good candidates to
offer upstream as a pull request. If upstream accepts them, this section shrinks.

## Character post authorship (Phase 2a step 3)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/features/chat/MessageItem.tsx` | Import `usePostAuthor`; `postAuthor` + `characterAvatarUrl` before `senderName`; `senderName` prefers `postAuthor?.name`; avatar branch uses `characterAvatarUrl` (with `dark:invert` for game-icon portraits) | Label posts with the character active when they were written |
| `src/features/dice/RollHistoryModal.tsx` | Import `useAuthorLookup`; `authorAt` lookup; roller label prefers the character name | Label rolls with the character active at the time |
| `src/features/channels/ChannelView.tsx` | Import `PostAuthorshipProvider`; wrap the main return's root `<div>` in it (inner JSX deliberately not re-indented to keep the diff small) | Provides the authorship lookup to chat and roll history |

Tests for these hook points live in `src/features/ext/authorship/upstreamTouchpoints.test.tsx`.

## Characters panel (Phase 2a step 4b)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/features/channels/ChannelView.tsx` | Import `CharactersEntry`; render it as the first item of the sidebar's *Table* section | Opens the characters panel. The panel itself renders through a portal (the sidebar is CSS-transformed) |
| `src/features/channels/ChannelView.test.tsx` | `vi.mock` of our `usePostingIdentities` (like the upstream data hooks it already mocks); `'Characters'` added to the expected sidebar order | The provider's real network calls caused the "Closing rpc while onUserConsoleLog was pending" teardown errors (0 in 5 runs after the fix); the new menu item changes the list |

## Display name (DECISIONS.md #15)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/App.tsx` | Import `APP_NAME`; signed-in header shows `{APP_NAME}` | Configurable display name |
| `src/lib/routeTitles.ts` | Import `APP_NAME`; `SUFFIX` / `DEFAULT_TITLE` use it | Browser tab titles of app pages |
| `src/features/auth/LoginPage.tsx` | Import `APP_NAME`; page title/description, logo alt and heading use it | Sign-in page |
| `src/features/marketing/MarketingHeader.tsx` | Import `APP_NAME`; header text | Signed-out header |
| `src/features/marketing/LandingPage.tsx` | Import `APP_NAME`; banner text only (marketing copy untouched) | Landing banner |
| `src/components/PwaInstallBanner.tsx` | Import `APP_NAME`; aria-label and title | Install prompt |
| `public/manifest.json` | `name` "Role by Post by Dylan", `short_name` "RbP Dylan" | Installed-app name (static file, can't read settings) |

Tests keep the default name (the setting is only in `.env.development.local`), so upstream's
tests needed no changes.

## New files (no conflict risk)

`CLAUDE.md`, `docs/delta-green/*`, `src/features/ext/**`, `src/test/stubs/pwaRegister.ts`,
`supabase/migrations/*_ext_*.sql`, `supabase/tests/*_ext_*.sql`.

<!-- cspell:locale en-GB,en -->
<!-- cspell:words Touchpoints TOUCHPOINTS -->
