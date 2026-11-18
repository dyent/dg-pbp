import { describe, it, expect } from 'vitest'
import {
  canRemove,
  columnsFor,
  describeEvent,
  describeRoleChange,
  diffFields,
  editDetails,
  editableColumns,
  hasChanges,
  isStatus,
  itemsIn,
  moveItem,
  moveToColumn,
  newDraftItem,
  removeItem,
  roleOf,
  roleToArgs,
  toDraft,
  updateItem,
  validateDraft,
  type CharacterEvent,
  type CharacterField,
  type DraftItem,
} from './characterModel'

function field(overrides: Partial<CharacterField> = {}): CharacterField {
  return {
    id: 'f1',
    characterId: 'c1',
    channelId: 'ch1',
    itemType: 'field',
    fieldKey: null,
    label: 'Occupation',
    body: '',
    visibility: 'players',
    private: false,
    sortOrder: 10,
    ...overrides,
  }
}

function event(eventType: string, details: Record<string, unknown> = {}, note: string | null = null): CharacterEvent {
  return { id: 'e1', eventType, details, note, visibility: 'gm', actorId: null, createdAt: '2026-11-18T10:00:00Z' }
}

const names: Record<string, string> = { u1: 'Sam', u2: 'Alex' }
const nameOf = (id: string) => names[id] ?? 'Someone'

describe('roles', () => {
  it('maps kind and in-play to a role and back', () => {
    expect(roleOf({ kind: 'npc', inPlay: true })).toBe('npc')
    expect(roleOf({ kind: 'pc', inPlay: true })).toBe('pc_in_play')
    expect(roleOf({ kind: 'pc', inPlay: false })).toBe('pc_out_of_play')
    expect(roleToArgs('npc')).toEqual({ kind: 'npc', inPlay: true })
    expect(roleToArgs('pc_in_play')).toEqual({ kind: 'pc', inPlay: true })
    expect(roleToArgs('pc_out_of_play')).toEqual({ kind: 'pc', inPlay: false })
  })

  it('recognizes statuses', () => {
    expect(isStatus('active')).toBe(true)
    expect(isStatus('asleep')).toBe(false)
    expect(isStatus(null)).toBe(false)
  })

  it('gives NPCs no Owner column and hides GM only from players', () => {
    expect(columnsFor('npc')).toEqual(['players', 'gm'])
    expect(columnsFor('pc')).toEqual(['players', 'owner', 'gm'])
    expect(editableColumns('pc', false)).toEqual(['players', 'owner'])
    expect(editableColumns('pc', true)).toEqual(['players', 'owner', 'gm'])
  })
})

describe('drafts', () => {
  const fields = [
    field({ id: 'a', label: 'A', sortOrder: 20 }),
    field({ id: 'b', label: 'B', sortOrder: 10 }),
    field({ id: 'c', label: 'C', visibility: 'owner', sortOrder: 5 }),
    field({ id: 'd', label: 'D', sortOrder: 30 }),
  ]

  it('orders the draft by sort order', () => {
    expect(toDraft(fields).map(d => d.id)).toEqual(['c', 'b', 'a', 'd'])
  })

  it('moves items within their column, skipping other columns', () => {
    const draft = toDraft(fields)
    // b is first in Everyone; c (Owner) sits before it in the list.
    expect(moveItem(draft, 'b', -1)).toBe(draft)
    const down = moveItem(draft, 'b', 1)
    expect(itemsIn(down, 'players').map(d => d.id)).toEqual(['a', 'b', 'd'])
    expect(moveItem(draft, 'd', 1)).toBe(draft)
    expect(moveItem(draft, 'missing', 1)).toBe(draft)
  })

  it('moves an item to the bottom of another column and drops Private outside Owner', () => {
    let draft = updateItem(toDraft(fields), 'c', { private: true })
    draft = moveToColumn(draft, 'c', 'players')
    const moved = draft[draft.length - 1]
    expect(moved.id).toBe('c')
    expect(moved.visibility).toBe('players')
    expect(moved.private).toBe(false)
    expect(moveToColumn(draft, 'c', 'players')).toBe(draft)
    expect(moveToColumn(draft, 'nope', 'gm')).toBe(draft)
  })

  it('keeps Private when moving into Owner', () => {
    const draft = updateItem(toDraft(fields), 'a', { private: true })
    expect(moveToColumn(draft, 'a', 'owner').find(d => d.id === 'a')?.private).toBe(true)
  })

  it('creates new items with temporary keys', () => {
    const a = newDraftItem('field', 'owner')
    const b = newDraftItem('heading', 'players')
    expect(a.key).not.toBe(b.key)
    expect(a.id).toBeNull()
    expect(a.label).toBe('New field')
    expect(b.label).toBe('New heading')
  })

  it('lets owners remove only custom items', () => {
    const standard = { ...newDraftItem('field', 'players'), fieldKey: 'occupation' }
    expect(canRemove(standard, false)).toBe(false)
    expect(canRemove(standard, true)).toBe(true)
    expect(canRemove(newDraftItem('field', 'players'), false)).toBe(true)
    expect(removeItem([standard], standard.key)).toEqual([])
  })

  it('validates titles and lengths', () => {
    const ok = newDraftItem('field', 'players')
    expect(validateDraft([ok])).toBeNull()
    expect(validateDraft([{ ...ok, label: '  ' }])).toMatch(/needs a title/)
    expect(validateDraft([{ ...ok, label: 'x'.repeat(61) }])).toMatch(/at most 60/)
    expect(validateDraft([{ ...ok, body: 'x'.repeat(8001) }])).toMatch(/too long/)
  })
})

describe('diffFields', () => {
  const original = [
    field({ id: 'a', label: 'A', body: 'one', sortOrder: 10 }),
    field({ id: 'b', label: 'B', body: 'two', sortOrder: 20 }),
    field({ id: 'c', label: 'C', visibility: 'owner', private: true, sortOrder: 10 }),
  ]

  it('reports nothing when nothing changed', () => {
    const changes = diffFields(original, toDraft(original))
    expect(changes).toEqual({ deletes: [], updates: [], inserts: [] })
    expect(hasChanges(changes)).toBe(false)
  })

  it('finds removals, edits, moves and additions', () => {
    let draft = toDraft(original)
    draft = removeItem(draft, 'b')
    draft = updateItem(draft, 'a', { body: 'uno', label: ' A2 ' })
    draft = moveToColumn(draft, 'c', 'players')
    const heading: DraftItem = { ...newDraftItem('heading', 'owner'), label: 'Kit', body: 'ignored' }
    draft = [...draft, heading]

    const changes = diffFields(original, draft)
    expect(hasChanges(changes)).toBe(true)
    expect(changes.deletes).toEqual(['b'])
    expect(changes.updates).toEqual([
      { id: 'a', patch: { label: 'A2', body: 'uno' } },
      { id: 'c', patch: { visibility: 'players', private: false, sort_order: 20 } },
    ])
    expect(changes.inserts).toEqual([
      { item_type: 'heading', label: 'Kit', body: '', visibility: 'owner', private: false, sort_order: 10 },
    ])
  })

  it('renumbers sort order when items are reordered', () => {
    const draft = moveItem(toDraft(original), 'b', -1)
    expect(diffFields(original, draft).updates).toEqual([
      { id: 'b', patch: { sort_order: 10 } },
      { id: 'a', patch: { sort_order: 20 } },
    ])
  })

  it('ignores draft items whose original has vanished', () => {
    const draft: DraftItem[] = [{ ...toDraft(original)[0], id: 'ghost', key: 'ghost' }]
    expect(diffFields([], draft).updates).toEqual([])
  })
})

describe('describeRoleChange', () => {
  const inPlay = { kind: 'pc' as const, inPlay: true, ownerId: 'u1' }

  it('says nothing when nothing changes', () => {
    expect(describeRoleChange('Reyes', inPlay, inPlay, nameOf)).toEqual([])
  })

  it('explains taking a PC out of play', () => {
    const lines = describeRoleChange('Reyes', inPlay, { ...inPlay, inPlay: false }, nameOf)
    expect(lines.join(' ')).toMatch(/Sam can no longer post as or edit Reyes/)
    expect(lines.join(' ')).toMatch(/except those marked Private/)
  })

  it('explains giving an out-of-play PC to someone else', () => {
    const lines = describeRoleChange('Reyes', { ...inPlay, inPlay: false }, { ...inPlay, inPlay: false, ownerId: 'u2' }, nameOf)
    expect(lines[0]).toMatch(/Sam loses Reyes/)
    expect(lines[1]).toMatch(/Alex gets a read-only view/)
  })

  it('explains bringing a PC back into play', () => {
    const lines = describeRoleChange('Reyes', { ...inPlay, inPlay: false }, inPlay, nameOf)
    expect(lines[0]).toMatch(/Sam can edit Reyes and post as them\. This counts/)
    expect(lines[1]).toMatch(/go back to being seen only by the owner/)
  })

  it('explains handing a PC to another player', () => {
    const lines = describeRoleChange('Reyes', inPlay, { ...inPlay, ownerId: 'u2' }, nameOf)
    expect(lines[0]).toMatch(/Sam loses Reyes/)
    expect(lines[1]).toMatch(/Alex can edit Reyes and post as them \(straight away/)
  })

  it('explains removing the player', () => {
    const lines = describeRoleChange('Reyes', inPlay, { ...inPlay, ownerId: null }, nameOf)
    expect(lines).toContain('No player controls Reyes.')
  })

  it('explains converting a PC to an NPC', () => {
    const lines = describeRoleChange('Reyes', inPlay, { kind: 'npc', inPlay: true, ownerId: 'u1' }, nameOf)
    expect(lines[0]).toBe('Reyes becomes an NPC.')
    expect(lines.join(' ')).toMatch(/Owner fields become GM only/)
    expect(lines.join(' ')).toMatch(/NPC posting names/)
  })

  it('explains turning an NPC into a PC', () => {
    const lines = describeRoleChange('Dr Hale', { kind: 'npc', inPlay: true, ownerId: null }, { kind: 'pc', inPlay: true, ownerId: 'u2' }, nameOf)
    expect(lines[0]).toMatch(/Alex can edit Dr Hale/)
    expect(lines[lines.length - 1]).toMatch(/GM only stay GM only/)
  })

  it('handles an NPC-to-NPC no-op even with a stray owner', () => {
    expect(describeRoleChange('X', { kind: 'npc', inPlay: true, ownerId: null }, { kind: 'npc', inPlay: true, ownerId: 'u1' }, nameOf)).toEqual([])
  })
})

describe('describeEvent', () => {
  it.each([
    [event('created', { kind: 'npc' }), 'Created as an NPC.'],
    [event('created', { kind: 'pc' }), 'Created as a PC.'],
    [event('renamed', { from: 'A', to: 'B' }), 'Renamed from "A" to "B".'],
    [event('status_changed', { from: 'active', to: 'deceased' }), 'Status changed from Active to Deceased.'],
    [event('status_changed', { from: 'weird' }), 'Status changed from weird to unknown.'],
    [event('revealed'), 'Revealed to players.'],
    [event('hidden'), 'Hidden from players.'],
    [event('note', {}, 'Met the cultist'), 'Met the cultist'],
    [event('note'), ''],
    [event('posting_started', { user_id: 'u1' }), 'Sam started posting as this character.'],
    [event('posting_ended', {}), 'A player stopped posting as this character.'],
    [event('posting_started', {}), 'A player started posting as this character.'],
    [event('posting_ended', { user_id: 'u2' }), 'Alex stopped posting as this character.'],
    [
      event('role_changed', { from: { kind: 'pc', in_play: true, owner_id: null }, to: { kind: 'pc', in_play: false, owner_id: 'u1' } }),
      'Role changed from PC – in play (no player) to PC – out of play (Sam).',
    ],
    [event('role_changed', { from: null, to: { kind: 'npc' } }), 'Role changed from unknown to NPC.'],
    [event('field_visibility_changed', { label: 'Secrets', from: 'owner', to: 'gm' }), '"Secrets" moved from Owner to GM only.'],
    [event('field_visibility_changed', { label: 'S', from: 'owner', to: 'owner', private_from: false, private_to: true }), '"S" marked Private.'],
    [event('field_visibility_changed', { label: 'S', from: 'owner', to: 'owner', private_from: true, private_to: false }), '"S" no longer Private.'],
    [event('field_visibility_changed', { label: 'S', from: 'players', to: 'owner', private_to: true }), '"S" moved from Everyone to Owner and marked Private.'],
    [event('field_visibility_changed', { label: 'S', from: 'x', to: 'x' }), '"S" changed.'],
    [event('field_edited', { action: 'added', label: 'Kit', item_type: 'heading' }), 'Added heading "Kit".'],
    [event('field_edited', { action: 'removed', label: 'Pet' }), 'Removed field "Pet".'],
    [event('field_edited', { action: 'edited', label: 'B', old_label: 'A' }), 'Renamed field "A" to "B".'],
    [event('field_edited', { action: 'edited', label: 'B', old_label: 'B' }), 'Edited "B".'],
    [event('given'), 'Role changed (earlier version).'],
    [event('something_new'), 'something_new'],
  ])('describes %o', (e, text) => {
    expect(describeEvent(e, nameOf)).toBe(text)
  })

  it('treats missing details as empty', () => {
    expect(describeEvent({ ...event('renamed'), details: undefined as never }, nameOf)).toBe('Renamed from "" to "".')
  })
})

describe('editDetails', () => {
  it('returns before/after text for edits only', () => {
    expect(editDetails(event('field_edited', { old_body: 'a', new_body: 'b' }))).toEqual({ before: 'a', after: 'b' })
    expect(editDetails(event('field_edited', { action: 'added' }))).toBeNull()
    expect(editDetails(event('renamed', { old_body: 'a' }))).toBeNull()
    expect(editDetails({ ...event('field_edited'), details: undefined as never })).toBeNull()
  })
})
