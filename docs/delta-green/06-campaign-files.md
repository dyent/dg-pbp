# Campaign Files: How to Use Them

*Phase 2a step 4d, built 2026-11-19. Decision: DECISIONS.md #29 (replaces the planned character PDF
attachments). Access: `PERMISSIONS.md`.*

A library of handouts, case files, maps and other documents for one campaign.

## Where to find it

**Files** in the campaign sidebar, in the *Table* section under Characters. Everyone in the campaign
can open it; players see only the files shared with them.

## What a file is

- A **PDF or image** (JPG, PNG, WebP or GIF), up to **20 MB**.
- A **title**, an optional **description** and an optional **folder** (e.g. *Case files*,
  *Maps*). The list is grouped by folder, with files outside any folder at the bottom, and has a
  search box (title, description, folder or file name).
- **Open** shows it in the browser (images also preview in the panel); **Download** saves it.

## Who sees it

Chosen per file, and changeable at any time with **Edit details**:

| Setting | Who can open it |
|---|---|
| **GM only** | Only you. For your notes, or a handout you haven't given out yet |
| **All players** | Everyone in the campaign |
| **Chosen players** | Only the players you tick (and you) |

Files are shared with **players, not characters**: a player with several characters can use the file
with any of them. The database enforces this, so a player can't open a file they shouldn't, even
with a copied link to the stored file.

## Managing files (GM only)

- **+ Add file**: choose the file (the title is suggested from the file name), set the folder,
  description and who can see it, then **Upload**.
- **Edit details**: title, description, folder, who can see it.
- **Replace file**: upload a new version. The earlier versions stay under *Earlier versions*, and
  whoever can see the file can open them too.
- **Delete**: removes the file, all its versions and its history for good (after a confirmation).
- **History (GM only)**: every upload, replacement and edit, including who gained or lost access.

Players can't upload files (their only uploads are character portraits). Archived campaigns are
read-only.

## Known limits

- An *Open* or *Download* link that a player already has keeps working for up to an hour after you
  unshare or delete the file.
- Deleting a whole campaign removes the file records but not the stored files themselves (nobody
  can open them afterwards).
- Files can't be attached to posts or characters yet.

## Files

| Code | Purpose |
|---|---|
| `supabase/migrations/20261118232029_ext_campaign_files.sql` | Bucket, tables, access rules, GM functions, history |
| `src/features/ext/files/filesModel.ts` | Shapes, labels, checks, folder grouping, history wording |
| `src/features/ext/files/filesApi.ts`, `useCampaignFiles.ts` | Storage and database calls; loading hook |
| `FilesEntry.tsx`, `FilesPanel.tsx` | Sidebar item (the only thing `ChannelView` renders) and the panel |
| `FileForm.tsx`, `FileDetail.tsx` | Add / edit form; one file with preview, versions and history |

<!-- cspell:locale en-GB,en -->
