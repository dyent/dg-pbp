// cspell:words organisation organisations safehouse aeiou
// Pure data model for campaign records and the Case file (Phase 2b): kinds,
// labels, list grouping and history text. No Supabase access here.
import type { FieldLike, Visibility } from '../characters/characterModel'
import { formatDay } from '../calendar/calendarModel'
import { describeLinkEvent, isLinkEventType } from '../links/linkHistory'

export const RECORD_KINDS = ['operation', 'location', 'organisation', 'clue'] as const
export type RecordKind = (typeof RECORD_KINDS)[number]

export const KIND_LABELS: Record<RecordKind, string> = {
  operation: 'Operation',
  location: 'Location',
  organisation: 'Organisation',
  clue: 'Clue',
}

export const KIND_PLURALS: Record<RecordKind, string> = {
  operation: 'Operations',
  location: 'Locations',
  organisation: 'Organisations',
  clue: 'Clues',
}

export const KIND_HINTS: Record<RecordKind, string> = {
  operation: 'An adventure or mission: briefing, summary, outcome.',
  location: 'A place: the morgue, a motel room, a safehouse.',
  organisation: 'A group: a sheriff’s office, a cult, a front company.',
  clue: 'Evidence the agents found or could find.',
}

export function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && (RECORD_KINDS as readonly string[]).includes(value)
}

export const CLUE_STATUSES = ['unexamined', 'investigated', 'resolved'] as const
export type ClueStatus = (typeof CLUE_STATUSES)[number]

export const CLUE_STATUS_LABELS: Record<ClueStatus, string> = {
  unexamined: 'Unexamined',
  investigated: 'Investigated',
  resolved: 'Resolved',
}

export function isClueStatus(value: unknown): value is ClueStatus {
  return typeof value === 'string' && (CLUE_STATUSES as readonly string[]).includes(value)
}

export type RecordVisibility = 'gm' | 'players' | 'selected'

export const RECORD_VISIBILITY_LABELS: Record<RecordVisibility, string> = {
  gm: 'GM only',
  players: 'All players',
  selected: 'Chosen players',
}

export const RECORD_VISIBILITY_HINTS: Record<RecordVisibility, string> = {
  gm: 'Your prep and notes. Players can’t see it.',
  players: 'Every player sees it in their Case files (fields marked GM only stay hidden).',
  selected: 'Only the players you tick see it (fields marked GM only stay hidden).',
}

export function isRecordVisibility(value: unknown): value is RecordVisibility {
  return value === 'gm' || value === 'players' || value === 'selected'
}

/** Field columns of a record profile: no Owner column, records have no owner. */
export const RECORD_COLUMNS: Visibility[] = ['players', 'gm']

export const RECORD_LIMITS = { name: 80 } as const

export interface CampaignRecord {
  id: string
  kind: RecordKind
  name: string
  pictureUrl: string | null
  provenance: 'canon' | 'source'
  visibility: RecordVisibility
  updatedAt: string
  // GM-only extras (empty for players).
  tagIds: string[]
  sharedWith: string[]
  /** Clues only (null for other kinds). */
  clueStatus?: ClueStatus | null
}

export interface RecordField extends FieldLike {
  recordId: string
}

export interface RecordEvent {
  id: string
  eventType: string
  details: Record<string, unknown>
  actorId: string | null
  createdAt: string
}

export interface RecordGroup {
  kind: RecordKind
  records: CampaignRecord[]
}

export interface RecordFilter {
  search: string
  kind: RecordKind | 'all'
  tagId: string | null
  /** A clue status shows only clues with it. */
  status?: ClueStatus | 'all'
}

/** Records grouped by kind (operations first), A–Z, filtered by name, kind and tag. */
export function groupRecords(records: CampaignRecord[], filter: RecordFilter): RecordGroup[] {
  const needle = filter.search.trim().toLowerCase()
  const matches = records.filter(
    r =>
      (filter.kind === 'all' || r.kind === filter.kind) &&
      (!filter.tagId || r.tagIds.includes(filter.tagId)) &&
      (!filter.status || filter.status === 'all' || (r.kind === 'clue' && r.clueStatus === filter.status)) &&
      (!needle || r.name.toLowerCase().includes(needle)),
  )
  return RECORD_KINDS.map(kind => ({
    kind,
    records: matches.filter(r => r.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter(g => g.records.length > 0)
}

/** Short "who can see it" text for the GM's list and profile badge. */
export function sharingLabel(record: Pick<CampaignRecord, 'visibility' | 'sharedWith'>, nameOf: (userId: string) => string): string {
  if (record.visibility !== 'selected') return RECORD_VISIBILITY_LABELS[record.visibility]
  const names = record.sharedWith.map(nameOf)
  if (names.length === 0) return RECORD_VISIBILITY_LABELS.selected
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

/** First problem with a new record, or null. */
export function newRecordProblem(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'The record needs a name.'
  if (trimmed.length > RECORD_LIMITS.name) return `Names can be at most ${RECORD_LIMITS.name} characters.`
  return null
}

/** Problem with a chosen-players setting, or null. */
export function sharingProblem(visibility: RecordVisibility, playerIds: string[]): string | null {
  return visibility === 'selected' && playerIds.length === 0 ? 'Tick at least one player, or choose another setting.' : null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** One-line description of a history entry. */
export function describeRecordEvent(event: RecordEvent, nameOf: (userId: string) => string): string {
  const d = event.details ?? {}
  switch (event.eventType) {
    case 'created':
      if (!isRecordKind(d.kind)) return 'Created as a record.'
      return `Created as ${/^[aeiou]/i.test(KIND_LABELS[d.kind]) ? 'an' : 'a'} ${KIND_LABELS[d.kind].toLowerCase()}.`
    case 'renamed':
      return `Renamed from "${str(d.from)}" to "${str(d.to)}".`
    case 'visibility_changed': {
      const from = isRecordVisibility(d.from) ? RECORD_VISIBILITY_LABELS[d.from] : str(d.from)
      const to = isRecordVisibility(d.to) ? RECORD_VISIBILITY_LABELS[d.to] : str(d.to)
      const parts = [from === to ? `Sharing changed (${to})` : `Shared: ${from} → ${to}`]
      const added = ids(d.added).map(nameOf)
      const removed = ids(d.removed).map(nameOf)
      if (added.length) parts.push(`added ${added.join(', ')}`)
      if (removed.length) parts.push(`removed ${removed.join(', ')}`)
      return `${parts.join('; ')}.`
    }
    case 'aliases_changed': {
      const to = Array.isArray(d.to) ? d.to.filter((a): a is string => typeof a === 'string') : []
      return to.length ? `Aliases set to ${to.join(', ')}.` : 'Aliases removed.'
    }
    case 'field_visibility_changed': {
      const label = (v: unknown) => (v === 'players' ? 'Everyone' : v === 'gm' ? 'GM only' : str(v))
      return `"${str(d.label)}" moved from ${label(d.from)} to ${label(d.to)}.`
    }
    case 'field_edited': {
      const kind = d.item_type === 'heading' ? 'heading' : 'field'
      if (d.action === 'added') return `Added ${kind} "${str(d.label)}".`
      if (d.action === 'removed') return `Removed ${kind} "${str(d.label)}".`
      if (d.old_label && d.old_label !== d.label) return `Renamed field "${str(d.old_label)}" to "${str(d.label)}".`
      return `Edited "${str(d.label)}".`
    }
    case 'status_changed': {
      const label = (v: unknown) => (isClueStatus(v) ? CLUE_STATUS_LABELS[v] : str(v))
      return `Status: ${label(d.from)} → ${label(d.to)}.`
    }
    case 'found_changed': {
      const parts = [str(d.by) && `by ${str(d.by)}`, str(d.at) && `at ${str(d.at)}`, typeof d.day === 'number' && `on ${formatDay(d.day)}`].filter(Boolean)
      return parts.length ? `Found ${parts.join(' ')}.` : 'Found details cleared.'
    }
    default:
      return isLinkEventType(event.eventType) ? describeLinkEvent(event.eventType, d) : event.eventType
  }
}
