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

## Delta Green sheet (Phase 2a step 4c)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/features/channels/ChannelView.tsx` | Import `MySheetButton`; render it in the header, before the sidebar toggle | "My sheet" for players from anywhere in a campaign. It loads nothing until opened, so upstream's ChannelView tests need no new mocks |

No upstream *files* change for the step 4c follow-ups (Reserve, quick HP/WP/SAN, NPC identities).
`20261118100834_ext_npc_posting_identities.sql` writes rows to upstream's `channel_npcs` table (data
only, no schema change), so every NPC appears in upstream's *Speak as NPC* list.

## Campaign files (Phase 2a step 4d)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/features/channels/ChannelView.tsx` | Import `FilesEntry`; render it after `CharactersEntry` in the sidebar's *Table* section | Opens the campaign files panel. It loads nothing until opened, so upstream's ChannelView tests need no new mocks |
| `src/features/channels/ChannelView.test.tsx` | `'Files'` added to the expected sidebar order | The new menu item changes the list |

The migration adds its own bucket and storage policies; upstream's `images` bucket, its rules and
its clean-up are untouched.

## In-game calendar (Phase 2a step 5a)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/features/channels/ChannelView.tsx` | Import `InGameCalendarProvider` and `InGameDateBar`; wrap the main return's root `<div>` in the provider (inside `PostAuthorshipProvider`, not re-indented); render `InGameDateBar` after `ChannelStatusBar` | Loads the date changes once per campaign; shows the room's date and the GM's controls |
| `src/features/chat/MessageList.tsx` | Import `InGameDateDivider`; render it before each message (changes since the post above) and once after the last message | Date-change dividers in the chat. Outside our provider it renders nothing, so upstream's MessageList tests need no changes |
| `src/features/channels/ChannelView.test.tsx` | `vi.mock` of our `useCalendarChanges` | Keeps the provider's loader off the network, as for `usePostingIdentities` |

## One NPC list, one active character (step 5a follow-ups)

| Upstream file / object | What we changed | Why |
|---|---|---|
| `src/features/channels/ChannelView.tsx` | GM Tools *NPCs* button replaced by a `CharactersEntry` (label "NPCs", opens on the NPC tab); `onClosed={refetchNpcs}` on both entries; room invite names via `withPlayerName` (`"Agent Reyes (Sam)"`); `playerNames` map passed to `PostAuthorshipProvider`; `NoActiveCharacterBanner` after `InGameDateBar`. Upstream's `NpcManagementModal` code is left in place, just no longer opened | One NPC list (DECISIONS.md #34); "Speak as" names reload after Characters closes; rooms are shared with players; posts made with no active character keep the player's name; reminder banner (#33) |
| `src/features/channels/ChannelView.test.tsx` | `vi.mock` of our `useCharacterList`; the NPCs test expects the *Characters* dialog instead of *Manage NPCs* | The NPCs button opens our panel |
| Table `channel_npcs` (upstream) | `20261119103100_ext_npc_roster_merge.sql` adds a deferred trigger `ext_channel_npcs_to_character` (no column or policy change) | Every "Speak as" name becomes an NPC character |

## Character activity (Phase 2a step 5b)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/features/channels/ChannelView.tsx` | Import our `pendingPost` helpers; `openPost` callback plus an effect (after `handleJumpToMessage`): remember the post, switch room if needed, wait until that room's messages are loaded, then call upstream's `handleJumpToMessage`. Passed as `onOpenPost` to both `CharactersEntry` items. The target is kept outside React state because switching between Main and a room mounts a fresh view | *Go to post* from a character's Activity tab |

## Inline NPC tags (Phase 2a step 5c)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/features/chat/MessageItem.tsx` | Import `NpcTagChip`, `isNpcTagHref`; `urlTransform` keeps `npc:` and `npcalias:` links; the `a` renderer draws them as chips | Tags in posts. Without our provider (upstream tests) a chip just shows the written name |
| `src/features/chat/MessageComposer.tsx` | Import our composer parts and `tagInsertion`; NPC matches appended to the `@` options and listed after the players; `npcTags.linkify` after upstream's `linkifyMentions` on send; the formatting toolbar wrapped in a flex row with our *Tag an NPC* button | Typing `@` or the button inserts a tag; `@Name` becomes `[Name](npc:id)` |
| `src/features/channels/ChannelView.tsx` | Import `NpcTagProvider`; wrap the main return's root `<div>` in it (inside `InGameCalendarProvider`, not re-indented); `opensFromChat` on the sidebar *Characters* entry | Loads NPC names once per campaign; clicking a tag opens the NPC's profile |
| `src/features/channels/ChannelView.test.tsx` | `vi.mock` of our `npcTagApi` (names, labels, alias tags) | Keeps the provider's loader off the network |

## Campaign records: the Case file (Phase 2b step 1)

| Upstream file | What we changed | Why |
|---|---|---|
| `src/features/channels/ChannelView.tsx` | Import `CaseFileEntry`; render it after `FilesEntry` in the sidebar's *Table* section | Opens the Case file. It loads nothing until opened, so upstream's ChannelView tests need no new mocks |
| `src/features/channels/ChannelView.test.tsx` | `'Case file'` added to the expected sidebar order | The new menu item changes the list |

Record pictures are uploaded through upstream's `upload-image` function into its existing GM-only
`npc` folder (the function allows only a fixed list of folders), so the function is unchanged.

## New files (no conflict risk)

`CLAUDE.md`, `docs/delta-green/*`, `src/features/ext/**`, `src/features/dg/**`,
`src/test/stubs/pwaRegister.ts`, `supabase/migrations/*_ext_*.sql` and `*_dg_*.sql`,
`supabase/tests/*_ext_*.sql` and `*_dg_*.sql`.

<!-- cspell:locale en-GB,en -->
<!-- cspell:words Touchpoints TOUCHPOINTS npcalias -->
