// cspell:words organisation organisations
// Adventure import (Phase 3 step 3): runs and suggestions as the app shows them.

/** The firm limit per run; 10 is a suggestion (bigger runs are slower and cost more). */
export const MAX_IMPORT_PAGES = 30
export const SUGGESTED_IMPORT_PAGES = 10

export const SUGGESTION_KINDS = ['operation', 'npc', 'location', 'organisation', 'clue', 'link', 'handout'] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

export const SUGGESTION_KIND_PLURALS: Record<SuggestionKind, string> = {
  operation: 'Operations',
  npc: 'NPCs',
  location: 'Locations',
  organisation: 'Organisations',
  clue: 'Clues',
  link: 'Links',
  handout: 'Handouts',
}

export type RunStatus = 'running' | 'done' | 'failed'
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'merged'

export interface ImportRun {
  id: string
  firstPage: number
  lastPage: number
  status: RunStatus
  error: string | null
  costUsd: number
  createdAt: string
  suggestionCount: number
  /** Repeats folded into suggestions from earlier runs of the same source. */
  combinedCount: number
}

export interface ImportSuggestion {
  id: string
  kind: SuggestionKind
  name: string
  page: number | null
  summary: string
  fields: { key: string; label: string; value: string }[]
  possibleDuplicateOf: string | null
  link: { from: string; to: string; label: string } | null
  handout: { firstPage: number; lastPage: number } | null
  /** Every page it was found on (several after combining runs). */
  pages: number[]
  /** A clue's suggested GM checklist. */
  checklist: string[]
  /** For a handout: where it sits on its page, the record it belongs to, and where its file was attached. */
  handoutArea: { left: number; top: number; width: number; height: number } | null
  relatedTo: string | null
  attachedTo: string | null
  status: SuggestionStatus
  /** What approving or merging created or updated. */
  created: { type: 'character' | 'record' | 'link' | 'file'; id: string } | null
}

export function isSuggestionKind(value: unknown): value is SuggestionKind {
  return typeof value === 'string' && (SUGGESTION_KINDS as readonly string[]).includes(value)
}

/** A readable problem with the pages typed, or null. */
export function importRangeProblem(first: number | null, last: number | null): string | null {
  if (first === null || last === null) return 'Enter the first and last page.'
  if (last < first) return 'The last page must come after the first.'
  if (last - first + 1 > MAX_IMPORT_PAGES) return `Import at most ${MAX_IMPORT_PAGES} pages at a time.`
  return null
}

/** Rough cost shown before a run: Sonnet 5.5 reading pages as images. */
export function estimateCost(pages: number): string {
  const low = Math.max(0.01, pages * 0.01)
  const high = Math.max(0.03, pages * 0.025)
  return `about $${low.toFixed(2)}–$${high.toFixed(2)}`
}

/** Suggestions grouped by kind, in the app's order. */
export function groupSuggestions(list: ImportSuggestion[]): { kind: SuggestionKind; items: ImportSuggestion[] }[] {
  return SUGGESTION_KINDS.map(kind => ({ kind, items: list.filter(s => s.kind === kind) })).filter(g => g.items.length > 0)
}

/** A run that has said "running" for over 15 minutes stopped without telling us. */
export function isStalled(run: ImportRun, now = Date.now()): boolean {
  return run.status === 'running' && now - Date.parse(run.createdAt) > 15 * 60_000
}

/** A note for runs bigger than the suggested size, or null. */
export function bigRunNote(pages: number): string | null {
  return pages > SUGGESTED_IMPORT_PAGES
    ? `More than ${SUGGESTED_IMPORT_PAGES} pages: this takes longer, and on the hosted server a very long run can time out.`
    : null
}

/** NPCs and records first, then links (they need both ends), then handouts. */
const APPROVE_ORDER: Record<SuggestionKind, number> = { operation: 0, npc: 0, location: 0, organisation: 0, clue: 0, link: 1, handout: 2 }

/** What "Approve all" takes: waiting suggestions not flagged as a possible duplicate, in a safe order. */
export function approveAllOrder(list: ImportSuggestion[]): ImportSuggestion[] {
  return list
    .filter(s => s.status === 'pending' && !s.possibleDuplicateOf)
    .sort((a, b) => APPROVE_ORDER[a.kind] - APPROVE_ORDER[b.kind])
}

/** "3 waiting · 5 added · 1 rejected". */
export function reviewSummary(list: ImportSuggestion[]): string {
  const count = (status: SuggestionStatus | SuggestionStatus[]) =>
    list.filter(s => (Array.isArray(status) ? status : [status]).includes(s.status)).length
  const parts = [
    [count('pending'), 'waiting'],
    [count(['approved', 'merged']), 'added'],
    [count('rejected'), 'rejected'],
  ].filter(([n]) => (n as number) > 0)
  return parts.map(([n, label]) => `${n} ${label}`).join(' · ')
}

/** Kinds that can be merged into an existing item, and what into. */
export function mergeTargetKind(kind: SuggestionKind): 'character' | 'record' | null {
  if (kind === 'npc') return 'character'
  if (kind === 'location' || kind === 'organisation' || kind === 'clue' || kind === 'operation') return 'record'
  return null
}
