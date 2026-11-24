// cspell:words organisation organisations recognises
import { describe, expect, it } from 'vitest'
import {
  describeRecordEvent,
  groupRecords,
  isClueStatus,
  isRecordKind,
  newRecordProblem,
  sharingLabel,
  sharingProblem,
  type CampaignRecord,
  type RecordEvent,
} from './recordModel'

function rec(id: string, kind: CampaignRecord['kind'], name: string, extra: Partial<CampaignRecord> = {}): CampaignRecord {
  return { id, kind, name, pictureUrl: null, provenance: 'canon', visibility: 'gm', updatedAt: 't', tagIds: [], sharedWith: [], ...extra }
}

const records = [
  rec('1', 'clue', 'Bloody glove', { tagIds: ['t1'] }),
  rec('2', 'location', 'Morgue', { tagIds: ['t1'] }),
  rec('3', 'location', 'Diner'),
  rec('4', 'operation', 'LAMPLIGHT'),
]
const nameOf = (id: string) => ({ u1: 'Sam', u2: 'Jo', u3: 'Ana' })[id] ?? id

describe('groupRecords', () => {
  it('groups by kind with operations first, A–Z within a kind', () => {
    const groups = groupRecords(records, { search: '', kind: 'all', tagId: null })
    expect(groups.map(g => [g.kind, g.records.map(r => r.name)])).toEqual([
      ['operation', ['LAMPLIGHT']],
      ['location', ['Diner', 'Morgue']],
      ['clue', ['Bloody glove']],
    ])
  })

  it('filters by name, kind and tag', () => {
    expect(groupRecords(records, { search: 'MOR', kind: 'all', tagId: null }).flatMap(g => g.records.map(r => r.id))).toEqual(['2'])
    expect(groupRecords(records, { search: '', kind: 'clue', tagId: null }).flatMap(g => g.records.map(r => r.id))).toEqual(['1'])
    expect(groupRecords(records, { search: '', kind: 'all', tagId: 't1' }).flatMap(g => g.records.map(r => r.id))).toEqual(['2', '1'])
    expect(groupRecords(records, { search: 'zzz', kind: 'all', tagId: null })).toEqual([])
  })
})

describe('sharing text and checks', () => {
  it('names chosen players, shortening long lists', () => {
    expect(sharingLabel({ visibility: 'gm', sharedWith: [] }, nameOf)).toBe('GM only')
    expect(sharingLabel({ visibility: 'players', sharedWith: [] }, nameOf)).toBe('All players')
    expect(sharingLabel({ visibility: 'selected', sharedWith: [] }, nameOf)).toBe('Chosen players')
    expect(sharingLabel({ visibility: 'selected', sharedWith: ['u1', 'u2'] }, nameOf)).toBe('Sam, Jo')
    expect(sharingLabel({ visibility: 'selected', sharedWith: ['u1', 'u2', 'u3'] }, nameOf)).toBe('Sam, Jo +1')
  })

  it('needs a name and at least one chosen player', () => {
    expect(newRecordProblem('  ')).toBe('The record needs a name.')
    expect(newRecordProblem('x'.repeat(81))).toMatch(/at most 80/)
    expect(newRecordProblem('Morgue')).toBeNull()
    expect(sharingProblem('selected', [])).toMatch(/Tick at least one player/)
    expect(sharingProblem('selected', ['u1'])).toBeNull()
    expect(sharingProblem('players', [])).toBeNull()
    expect(isRecordKind('clue')).toBe(true)
    expect(isRecordKind('npc')).toBe(false)
  })
})

describe('describeRecordEvent', () => {
  const e = (eventType: string, details: Record<string, unknown> = {}): RecordEvent => ({ id: 'e', eventType, details, actorId: null, createdAt: 't' })

  it('describes every kind of history entry', () => {
    expect(describeRecordEvent(e('created', { kind: 'organisation' }), nameOf)).toBe('Created as an organisation.')
    expect(describeRecordEvent(e('created', { kind: 'clue' }), nameOf)).toBe('Created as a clue.')
    expect(describeRecordEvent(e('created', { kind: 'nope' }), nameOf)).toBe('Created as a record.')
    expect(describeRecordEvent(e('renamed', { from: 'A', to: 'B' }), nameOf)).toBe('Renamed from "A" to "B".')
    expect(describeRecordEvent(e('visibility_changed', { from: 'gm', to: 'selected', added: ['u1'], removed: [] }), nameOf)).toBe(
      'Shared: GM only → Chosen players; added Sam.',
    )
    expect(describeRecordEvent(e('visibility_changed', { from: 'selected', to: 'selected', added: [], removed: ['u2'] }), nameOf)).toBe(
      'Sharing changed (Chosen players); removed Jo.',
    )
    expect(describeRecordEvent(e('field_visibility_changed', { label: 'Goals', from: 'gm', to: 'players' }), nameOf)).toBe(
      '"Goals" moved from GM only to Everyone.',
    )
    expect(describeRecordEvent(e('field_edited', { action: 'added', label: 'X', item_type: 'heading' }), nameOf)).toBe('Added heading "X".')
    expect(describeRecordEvent(e('field_edited', { action: 'removed', label: 'X' }), nameOf)).toBe('Removed field "X".')
    expect(describeRecordEvent(e('field_edited', { action: 'edited', label: 'Y', old_label: 'X' }), nameOf)).toBe('Renamed field "X" to "Y".')
    expect(describeRecordEvent(e('field_edited', { action: 'edited', label: 'Y', old_label: 'Y' }), nameOf)).toBe('Edited "Y".')
    expect(describeRecordEvent(e('mystery'), nameOf)).toBe('mystery')
  })
})

describe('clue extras', () => {
  const clues = [
    rec('c1', 'clue', 'Glove', { clueStatus: 'resolved' }),
    rec('c2', 'clue', 'Ledger', { clueStatus: 'unexamined' }),
    rec('l1', 'location', 'Morgue'),
  ]

  it('filters by clue status, showing only clues with it', () => {
    const ids = (status: 'all' | 'resolved' | 'unexamined' | 'investigated') =>
      groupRecords(clues, { search: '', kind: 'all', tagId: null, status }).flatMap(g => g.records.map(r => r.id))
    expect(ids('all')).toEqual(['l1', 'c1', 'c2'])
    expect(ids('resolved')).toEqual(['c1'])
    expect(ids('investigated')).toEqual([])
  })

  it('recognises statuses', () => {
    expect(isClueStatus('investigated')).toBe(true)
    expect(isClueStatus('lost')).toBe(false)
  })

  it('describes status and found changes', () => {
    const ev = (eventType: string, details: Record<string, unknown>): RecordEvent => ({ id: 'e', eventType, details, actorId: null, createdAt: 't' })
    expect(describeRecordEvent(ev('status_changed', { from: 'unexamined', to: 'resolved' }), nameOf)).toBe('Status: Unexamined → Resolved.')
    expect(describeRecordEvent(ev('status_changed', { from: null, to: 'odd' }), nameOf)).toBe('Status:  → odd.')
    expect(describeRecordEvent(ev('found_changed', { by: 'Reyes', at: 'Morgue', day: 0 }), nameOf)).toBe('Found by Reyes at Morgue on Thu 1 Jan 1970.')
    expect(describeRecordEvent(ev('found_changed', { by: null, at: 'Morgue', day: null }), nameOf)).toBe('Found at Morgue.')
    expect(describeRecordEvent(ev('found_changed', {}), nameOf)).toBe('Found details cleared.')
  })
})
