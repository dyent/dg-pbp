import { describe, expect, it } from 'vitest'
import {
  dateAt,
  dayToIso,
  dividerLabel,
  dividersBetween,
  formatDay,
  isoToDay,
  sortChanges,
  type CalendarChange,
} from './calendarModel'

const day = (iso: string) => isoToDay(iso)!

let n = 0
function change(at: string, subChannelId: string | null, kind: CalendarChange['kind'], dayNumber: number | null, shift?: [number, CalendarChange['shiftUnit']]): CalendarChange {
  n += 1
  return {
    id: `c${n}`,
    subChannelId,
    kind,
    dayNumber,
    shiftAmount: shift ? shift[0] : null,
    shiftUnit: shift ? shift[1] : null,
    createdAt: `2026-11-19T10:${at}:00Z`,
  }
}

describe('calendar dates', () => {
  it('converts between ISO dates and day numbers', () => {
    expect(isoToDay('1970-01-01')).toBe(0)
    expect(isoToDay('1997-10-14')).toBe(10148)
    expect(dayToIso(10148)).toBe('1997-10-14')
    expect(isoToDay('1969-12-31')).toBe(-1)
    expect(dayToIso(isoToDay('0042-03-01')!)).toBe('0042-03-01')
    expect(isoToDay('1997-02-30')).toBeNull()
    expect(isoToDay('0000-01-01')).toBeNull()
    expect(isoToDay('14/10/1997')).toBeNull()
  })

  it('formats a day like "Tue 14 Oct 1997"', () => {
    expect(formatDay(day('1997-10-14'))).toBe('Tue 14 Oct 1997')
    expect(formatDay(day('1920-01-01'))).toBe('Thu 1 Jan 1920')
  })
})

describe('which date applies', () => {
  const room = 'r1'
  const changes = sortChanges([
    change('05', null, 'shift', day('1997-10-17'), [3, 'day']),
    change('01', null, 'set', day('1997-10-14')),
    change('10', room, 'set', day('1997-07-14')),
    change('15', null, 'shift', day('1997-10-24'), [1, 'week']),
    change('20', room, 'clear', null),
  ])
  const at = (mm: string) => Date.parse(`2026-11-19T10:${mm}:00Z`)

  it('sorts oldest first', () => {
    expect(changes.map(c => c.createdAt.slice(14, 16))).toEqual(['01', '05', '10', '15', '20'])
  })

  it('uses the campaign date unless a room has its own', () => {
    expect(dateAt([], null)).toBeNull()
    expect(dateAt(changes, null, at('00'))).toBeNull()
    expect(dateAt(changes, null, at('06'))).toEqual({ day: day('1997-10-17'), own: false })
    expect(dateAt(changes, room, at('06'))).toEqual({ day: day('1997-10-17'), own: false })
    expect(dateAt(changes, room, at('12'))).toEqual({ day: day('1997-07-14'), own: true })
    expect(dateAt(changes, room, at('16'))).toEqual({ day: day('1997-07-14'), own: true })
    expect(dateAt(changes, room)).toEqual({ day: day('1997-10-24'), own: false })
  })

  it('labels dividers', () => {
    const d = { day: day('1997-10-17'), own: false }
    expect(dividerLabel(changes[1], d)).toBe('3 days later: Fri 17 Oct 1997')
    expect(dividerLabel(change('30', null, 'shift', 0, [-1, 'month']), d)).toBe('1 month earlier: Fri 17 Oct 1997')
    expect(dividerLabel(changes[0], { day: day('1997-10-14'), own: false })).toBe('Tue 14 Oct 1997')
    expect(dividerLabel(changes[4], d)).toBe('Back to the campaign date: Fri 17 Oct 1997')
    expect(dividerLabel(changes[4], null)).toBe('Back to the campaign date')
    expect(dividerLabel(change('31', null, 'shift', 0, [2, 'year']), null)).toBe('2 years later')
  })

  it('draws campaign changes in Main', () => {
    const t = (mm: string) => `2026-11-19T10:${mm}:00Z`
    expect(dividersBetween(changes, null, null, t('30'))).toEqual([])
    expect(dividersBetween(changes, null, t('00'), t('30')).map(d => d.label)).toEqual([
      'Tue 14 Oct 1997',
      '3 days later: Fri 17 Oct 1997',
      '1 week later: Fri 24 Oct 1997',
    ])
    expect(dividersBetween(changes, null, t('02'), t('05')).map(d => d.label)).toEqual(['3 days later: Fri 17 Oct 1997'])
    expect(dividersBetween(changes, null, t('16'), null)).toEqual([])
  })

  it('draws a room’s own changes, and campaign changes only while it follows the campaign', () => {
    const t = (mm: string) => `2026-11-19T10:${mm}:00Z`
    expect(dividersBetween(changes, room, t('00'), null).map(d => d.label)).toEqual([
      'Tue 14 Oct 1997',
      '3 days later: Fri 17 Oct 1997',
      'Mon 14 Jul 1997',
      'Back to the campaign date: Fri 24 Oct 1997',
    ])
  })
})
