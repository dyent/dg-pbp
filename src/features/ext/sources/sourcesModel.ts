// Source library (Phase 3 step 1): published adventures, GM only. Pure helpers.

export const SOURCES_BUCKET = 'ext-sources'
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024
export const SOURCE_TITLE_MAX = 120

export interface CampaignSource {
  id: string
  title: string
  objectPath: string
  fileName: string
  sizeBytes: number
  createdAt: string
}

/** A readable problem with a chosen file, or null when it can be uploaded. */
export function sourceFileProblem(file: { name: string; type: string; size: number }): string | null {
  const isPdf = file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name))
  if (!isPdf) return 'Sources must be PDF files.'
  if (file.size > MAX_SOURCE_BYTES) return 'Sources can be at most 50 MB.'
  if (file.size === 0) return 'That file is empty.'
  return null
}

/** A readable problem with a title, or null. */
export function sourceTitleProblem(title: string): string | null {
  const trimmed = title.trim()
  if (!trimmed) return 'Give the source a title.'
  if (trimmed.length > SOURCE_TITLE_MAX) return `Titles can be at most ${SOURCE_TITLE_MAX} characters.`
  return null
}

/** "last-things_last.pdf" → "last things last": a starting title from the file name. */
export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SOURCE_TITLE_MAX)
}

/** Where an upload is stored: '<campaign>/<random id>.pdf'. */
export function sourcePathFor(channelId: string, randomId: string): string {
  return `${channelId}/${randomId}.pdf`
}

/** A whole page number from what was typed, or null. */
export function parsePage(value: string): number | null {
  const n = Number(value.trim())
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : null
}

/** Sources by title, A–Z. */
export function sortSources(sources: CampaignSource[]): CampaignSource[] {
  return [...sources].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
}
