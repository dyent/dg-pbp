// In-game calendar: pure date maths and the rules for which date applies where.
// The database (migration 20261119002024_ext_in_game_calendar.sql) stores every
// change; these functions replay them. Earth (Gregorian) calendar: day 0 is
// 1970-01-01, negative days are earlier.

export type ShiftUnit = 'day' | 'week' | 'month' | 'year'
export const SHIFT_UNITS: ShiftUnit[] = ['day', 'week', 'month', 'year']

export interface CalendarChange {
  id: string
  /** null = the whole campaign. */
  subChannelId: string | null
  kind: 'set' | 'shift' | 'clear'
  /** The date in force after the change (null for 'clear'). */
  dayNumber: number | null
  shiftAmount: number | null
  shiftUnit: ShiftUnit | null
  createdAt: string
}

export interface RoomDate {
  day: number
  /** True when the room has its own date rather than following the campaign. */
  own: boolean
}

const MS_PER_DAY = 86_400_000

export function dayToIso(day: number): string {
  const d = new Date(day * MS_PER_DAY)
  const year = d.getUTCFullYear()
  const yyyy = String(year).padStart(4, '0')
  return `${yyyy}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Day number of a 'YYYY-MM-DD' date, or null if it isn't a real date in years 1–9999. */
export function isoToDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (year < 1) return null
  const d = new Date(0)
  d.setUTCFullYear(year, month - 1, day)
  d.setUTCHours(0, 0, 0, 0)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return Math.round(d.getTime() / MS_PER_DAY)
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "Tue 14 Oct 1997". */
export function formatDay(day: number): string {
  const parts = dayFormat.formatToParts(new Date(day * MS_PER_DAY))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`
}

function time(iso: string): number {
  return Date.parse(iso)
}

/** Oldest first (ties keep their order). */
export function sortChanges(changes: CalendarChange[]): CalendarChange[] {
  return [...changes].sort((a, b) => time(a.createdAt) - time(b.createdAt))
}

function latest(changes: CalendarChange[], scope: string | null, at: number): CalendarChange | undefined {
  let found: CalendarChange | undefined
  for (const c of changes) {
    if (c.subChannelId === scope && time(c.createdAt) <= at) found = c
  }
  return found
}

/**
 * The date in force for a room (null = the campaign / Main) at a moment
 * (default: now), or null when no date applies. `changes` must be sorted.
 */
export function dateAt(changes: CalendarChange[], subChannelId: string | null, at = Number.POSITIVE_INFINITY): RoomDate | null {
  if (subChannelId) {
    const own = latest(changes, subChannelId, at)
    if (own && own.kind !== 'clear' && own.dayNumber !== null) return { day: own.dayNumber, own: true }
  }
  const campaign = latest(changes, null, at)
  return campaign && campaign.dayNumber !== null ? { day: campaign.dayNumber, own: false } : null
}

function plural(n: number, unit: ShiftUnit): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** The text of the divider a change draws in a room's chat. */
export function dividerLabel(change: CalendarChange, after: RoomDate | null): string {
  const date = after ? formatDay(after.day) : null
  if (change.kind === 'clear') return date ? `Back to the campaign date: ${date}` : 'Back to the campaign date'
  if (change.kind === 'shift' && change.shiftAmount !== null && change.shiftUnit) {
    const n = Math.abs(change.shiftAmount)
    return `${plural(n, change.shiftUnit)} ${change.shiftAmount > 0 ? 'later' : 'earlier'}${date ? `: ${date}` : ''}`
  }
  return date ?? ''
}

export interface Divider {
  id: string
  label: string
}

/**
 * Dividers to draw in a room's chat for changes made after `from` (exclusive)
 * up to `to` (inclusive). A campaign change shows in a room only while that
 * room follows the campaign date. `from` null means "unknown" (the start of the
 * loaded history), so nothing is drawn. `changes` must be sorted.
 */
export function dividersBetween(
  changes: CalendarChange[],
  subChannelId: string | null,
  from: string | null,
  to: string | null,
): Divider[] {
  if (from === null) return []
  const start = time(from)
  const end = to === null ? Number.POSITIVE_INFINITY : time(to)
  const result: Divider[] = []
  for (const c of changes) {
    const at = time(c.createdAt)
    if (!(at > start && at <= end)) continue
    const mine = c.subChannelId === subChannelId
    const campaignHere = c.subChannelId === null && subChannelId !== null && !dateAt(changes, subChannelId, at)?.own
    if (!mine && !campaignHere) continue
    result.push({ id: c.id, label: dividerLabel(c, dateAt(changes, subChannelId, at)) })
  }
  return result
}
