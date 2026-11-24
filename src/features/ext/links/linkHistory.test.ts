import { describe, expect, it } from 'vitest'
import { describeEvent } from '../characters/characterModel'
import { describeRecordEvent } from '../records/recordModel'
import { describeLinkEvent, isLinkEventType } from './linkHistory'

const base = { from: 'Dr Hale', to: 'The Fellowship', label: 'works for', visibility: 'gm' }

describe('describeLinkEvent', () => {
  it.each([
    ['link_added', base, 'Link added: Dr Hale — works for → The Fellowship.'],
    ['link_added', { ...base, visibility: 'players' }, 'Link added: Dr Hale — works for → The Fellowship (shown).'],
    ['link_removed', { ...base, to: null }, 'Link removed: Dr Hale — works for → (deleted).'],
    ['link_reversed', base, 'Link reversed: now Dr Hale — works for → The Fellowship.'],
    ['link_changed', { ...base, old_label: 'paid by', old_visibility: 'gm' }, 'Link relabelled from "paid by": Dr Hale — works for → The Fellowship.'],
    ['link_changed', { ...base, visibility: 'players', old_label: 'works for', old_visibility: 'gm' }, 'Link shown to players: Dr Hale — works for → The Fellowship.'],
    ['link_changed', { ...base, old_label: 'works for', old_visibility: 'players' }, 'Link hidden from players: Dr Hale — works for → The Fellowship.'],
    ['link_changed', { ...base, old_label: 'works for', old_visibility: 'gm' }, 'Link changed: Dr Hale — works for → The Fellowship.'],
  ] as const)('%s', (type, details, text) => {
    expect(describeLinkEvent(type, details)).toBe(text)
  })

  it('copes with missing details', () => {
    expect(describeLinkEvent('link_added', null)).toBe('Link added: (deleted) — … → (deleted).')
  })

  it('knows its event types', () => {
    expect(isLinkEventType('link_reversed')).toBe(true)
    expect(isLinkEventType('renamed')).toBe(false)
  })

  it('is used by both character and record history', () => {
    const event = { id: 'e', eventType: 'link_added', details: base, createdAt: '', actorId: null }
    expect(describeEvent(event as never, () => '')).toBe('Link added: Dr Hale — works for → The Fellowship.')
    expect(describeRecordEvent(event as never, () => '')).toBe('Link added: Dr Hale — works for → The Fellowship.')
  })
})
