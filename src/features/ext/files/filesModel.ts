// Campaign files: shapes, labels and small pure helpers (no Supabase calls).
// Access rules live in the database (migration 20261118232029_ext_campaign_files.sql).

export const FILES_BUCKET = 'ext-campaign-files'

/** Storage's own cap for the bucket (also checked by the database). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
/** For the file picker's `accept` attribute. */
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp,.gif,' + ACCEPTED_TYPES.join(',')

export type FileVisibility = 'gm' | 'players' | 'selected'

export const VISIBILITY_LABELS: Record<FileVisibility, string> = {
  gm: 'GM only',
  players: 'All players',
  selected: 'Chosen players',
}

export interface FileVersion {
  id: string
  versionNo: number
  objectPath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}

export interface CampaignFile {
  id: string
  title: string
  description: string
  folder: string
  visibility: FileVisibility
  createdAt: string
  updatedAt: string
  /** Newest first. Never empty for a file the database returned. */
  versions: FileVersion[]
}

export interface FileEvent {
  id: string
  fileId: string
  actorId: string | null
  kind: 'added' | 'replaced' | 'edited'
  details: Record<string, unknown>
  createdAt: string
}

/** What the add / edit form produces. */
export interface FileDetails {
  title: string
  description: string
  folder: string
  visibility: FileVisibility
  playerIds: string[]
}

export function isVisibility(value: unknown): value is FileVisibility {
  return value === 'gm' || value === 'players' || value === 'selected'
}

export function currentVersion(file: CampaignFile): FileVersion | undefined {
  return file.versions[0]
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/** "1.2 MB", "350 KB", "12 bytes". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Why this file can't be uploaded, or null when it's fine. */
export function fileProblem(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return 'Only PDF and image files (JPG, PNG, WebP, GIF) can be added.'
  }
  if (file.size > MAX_FILE_BYTES) return 'Files can be at most 20 MB.'
  return null
}

/** Why these details can't be saved, or null when they're fine. */
export function detailsProblem(details: FileDetails): string | null {
  if (!details.title.trim()) return 'Give the file a title.'
  if (details.title.trim().length > 120) return 'Titles can be at most 120 characters.'
  if (details.folder.trim().length > 60) return 'Folder names can be at most 60 characters.'
  if (details.description.trim().length > 1000) return 'Descriptions can be at most 1000 characters.'
  if (details.visibility === 'selected' && details.playerIds.length === 0) {
    return 'Choose at least one player to share the file with.'
  }
  return null
}

/** Object name inside the bucket: '<campaign id>/<random id>.<ext>'. */
export function objectPathFor(channelId: string, fileName: string, randomId: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(fileName)
  const ext = match ? match[1].toLowerCase() : 'bin'
  return `${channelId}/${randomId}.${ext}`
}

export interface FolderGroup {
  /** '' for files outside any folder. */
  folder: string
  files: CampaignFile[]
}

/**
 * Files matching the search text (title, description, folder or file name),
 * grouped by folder: named folders alphabetically, then files without a folder.
 * Within a folder, newest change first.
 */
export function groupByFolder(files: CampaignFile[], search = ''): FolderGroup[] {
  const q = search.trim().toLowerCase()
  const matches = q
    ? files.filter(f =>
        [f.title, f.description, f.folder, currentVersion(f)?.fileName ?? ''].some(s => s.toLowerCase().includes(q)),
      )
    : files
  const groups = new Map<string, CampaignFile[]>()
  for (const f of matches) {
    const list = groups.get(f.folder) ?? []
    list.push(f)
    groups.set(f.folder, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([folder, list]) => ({
      folder,
      files: [...list].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)),
    }))
}

/** Existing folder names, for the folder suggestions. */
export function folderNames(files: CampaignFile[]): string[] {
  return [...new Set(files.map(f => f.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  folder: 'Folder',
  visibility: 'Who can see it',
}

function shown(field: string, value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  if (field === 'visibility' && isVisibility(text)) return VISIBILITY_LABELS[text]
  return text ? `"${text}"` : '(empty)'
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** One-line description of a history entry, e.g. "Replaced with map-v2.pdf (version 2)". */
export function describeEvent(event: FileEvent, nameOf: (userId: string) => string): string {
  const d = event.details
  if (event.kind === 'added') {
    const visibility = isVisibility(d.visibility) ? VISIBILITY_LABELS[d.visibility] : ''
    const players = ids(d.players).map(nameOf)
    const who = d.visibility === 'selected' && players.length ? `shared with ${players.join(', ')}` : visibility
    return `Added ${String(d.file_name ?? '')}${who ? ` (${who})` : ''}`
  }
  if (event.kind === 'replaced') {
    return `Replaced with ${String(d.file_name ?? '')} (version ${String(d.version ?? '?')})`
  }
  const parts: string[] = []
  if (Array.isArray(d.changes)) {
    for (const c of d.changes as { field?: unknown; from?: unknown; to?: unknown }[]) {
      const field = typeof c.field === 'string' ? c.field : ''
      parts.push(`${FIELD_LABELS[field] ?? field}: ${shown(field, c.from)} → ${shown(field, c.to)}`)
    }
  }
  const added = ids(d.added).map(nameOf)
  const removed = ids(d.removed).map(nameOf)
  if (added.length) parts.push(`Shared with ${added.join(', ')}`)
  if (removed.length) parts.push(`No longer shared with ${removed.join(', ')}`)
  return parts.length ? `Edited. ${parts.join('; ')}` : 'Edited'
}
