import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './characterApi'

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

type Result = { data?: unknown; error?: unknown }

/**
 * A query builder stand-in: every method records its call and returns the
 * builder; awaiting it (or calling .single()) yields the next queued result.
 */
function mockFrom(...results: Result[]) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  let table = ''
  const next = () => {
    const r = results.shift() ?? {}
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null })
  }
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'limit']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ table, method, args })
      return builder
    })
  }
  builder.single = vi.fn(() => next())
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next().then(resolve, reject)
  vi.mocked(supabase.from).mockImplementation(((name: string) => {
    table = name
    calls.push({ table, method: 'from', args: [name] })
    return builder
  }) as never)
  return calls
}

const rpc = () => vi.mocked(supabase.rpc)

describe('characterApi', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('listCharacters', () => {
    it('reads the table with GM extras for the GM', async () => {
      const calls = mockFrom({
        data: [
          { id: 'c1', kind: 'pc', in_play: true, name: 'Reyes', portrait_url: null, status: 'active', owner_id: 'me', updated_at: 't', revealed: false, status_visible: true, aliases: ['R'], ext_character_tags: [{ tag_id: 't1' }] },
          { id: 'c2', kind: 'npc', in_play: true, name: 'Hale', portrait_url: 'p', status: 'odd', owner_id: null, updated_at: 't', revealed: true, status_visible: false, aliases: null, ext_character_tags: null },
        ],
      })
      const list = await api.listCharacters('ch1', true, 'me')
      expect(calls[0]).toEqual({ table: 'ext_characters', method: 'from', args: ['ext_characters'] })
      expect(calls.find(c => c.method === 'eq')?.args).toEqual(['channel_id', 'ch1'])
      expect(list[0]).toMatchObject({ id: 'c1', isMine: true, revealed: false, aliases: ['R'], tagIds: ['t1'], status: 'active' })
      expect(list[1]).toMatchObject({ kind: 'npc', isMine: false, status: null, aliases: [], tagIds: [] })
    })

    it('uses the safe projection for players', async () => {
      rpc().mockResolvedValue({
        data: [{ id: 'c1', kind: 'pc', in_play: false, name: 'Reyes', portrait_url: null, status: null, owner_id: 'u1', is_mine: true, updated_at: 't' }],
        error: null,
      } as never)
      const list = await api.listCharacters('ch1', false, 'u1')
      expect(rpc()).toHaveBeenCalledWith('ext_list_revealed_characters', { p_channel_id: 'ch1' })
      expect(list).toEqual([
        { id: 'c1', kind: 'pc', inPlay: false, name: 'Reyes', portraitUrl: null, status: null, ownerId: 'u1', isMine: true, updatedAt: 't' },
      ])
      expect(list[0].revealed).toBeUndefined()
    })

    it('throws readable errors', async () => {
      mockFrom({ error: { message: 'denied' } })
      await expect(api.listCharacters('ch1', true, 'me')).rejects.toThrow('denied')
      rpc().mockResolvedValue({ data: null, error: { message: 'nope' } } as never)
      await expect(api.listCharacters('ch1', false, 'me')).rejects.toThrow('nope')
    })

    it('copes with empty results', async () => {
      mockFrom({ data: null })
      expect(await api.listCharacters('ch1', true, undefined)).toEqual([])
      rpc().mockResolvedValue({ data: null, error: null } as never)
      expect(await api.listCharacters('ch1', false, undefined)).toEqual([])
    })
  })

  it('creates a character and returns its id', async () => {
    const calls = mockFrom({ data: { id: 'new' } })
    expect(await api.createCharacter('ch1', 'npc', '  Dr Hale ', 'gm')).toBe('new')
    expect(calls.find(c => c.method === 'insert')?.args[0]).toEqual({ channel_id: 'ch1', kind: 'npc', name: 'Dr Hale', created_by: 'gm' })
  })

  it('reports a failed create', async () => {
    mockFrom({ error: { message: 'dup' } })
    await expect(api.createCharacter('ch1', 'pc', 'A', 'gm')).rejects.toThrow('dup')
  })

  it('updates and deletes characters', async () => {
    let calls = mockFrom({})
    await api.updateCharacter('c1', { status: 'missing' })
    expect(calls.find(c => c.method === 'update')?.args[0]).toEqual({ status: 'missing' })
    expect(calls.find(c => c.method === 'eq')?.args).toEqual(['id', 'c1'])

    calls = mockFrom({})
    await api.deleteCharacter('c1')
    expect(calls.some(c => c.method === 'delete')).toBe(true)

    mockFrom({ error: { message: 'has posted' } })
    await expect(api.deleteCharacter('c1')).rejects.toThrow('has posted')
    mockFrom({ error: { message: 'bad' } })
    await expect(api.updateCharacter('c1', {})).rejects.toThrow('bad')
  })

  it('calls the role, posting and rename functions', async () => {
    rpc().mockResolvedValue({ data: null, error: null } as never)
    await api.setRole('c1', 'pc', false, 'u1', '  ')
    expect(rpc()).toHaveBeenCalledWith('ext_set_role', { p_character_id: 'c1', p_kind: 'pc', p_in_play: false, p_owner_id: 'u1', p_note: undefined })
    await api.setRole('c1', 'npc', true, null, ' Turned ')
    expect(rpc()).toHaveBeenLastCalledWith('ext_set_role', { p_character_id: 'c1', p_kind: 'npc', p_in_play: true, p_owner_id: null, p_note: 'Turned' })
    await api.postAs('c1')
    expect(rpc()).toHaveBeenLastCalledWith('ext_post_as', { p_character_id: 'c1' })
    await api.updateMyCharacter('c1', 'Reyes', null)
    expect(rpc()).toHaveBeenLastCalledWith('ext_update_my_character', { p_character_id: 'c1', p_name: 'Reyes', p_portrait_url: '' })

    rpc().mockResolvedValue({ data: null, error: { message: 'limit' } } as never)
    await expect(api.setRole('c1', 'pc', true, 'u1', '')).rejects.toThrow('limit')
    await expect(api.postAs('c1')).rejects.toThrow('limit')
    await expect(api.updateMyCharacter('c1', 'x', 'p')).rejects.toThrow('limit')
  })

  it('lists fields with safe defaults', async () => {
    mockFrom({
      data: [
        { id: 'f1', character_id: 'c1', channel_id: 'ch1', item_type: 'heading', field_key: null, label: 'Kit', body: '', visibility: 'owner', private: false, sort_order: 10 },
        { id: 'f2', character_id: 'c1', channel_id: 'ch1', item_type: 'field', field_key: 'gm_notes', label: 'GM', body: 'x', visibility: 'weird', private: false, sort_order: 20 },
      ],
    })
    const fields = await api.listFields('c1')
    expect(fields[0]).toMatchObject({ itemType: 'heading', visibility: 'owner' })
    expect(fields[1]).toMatchObject({ itemType: 'field', visibility: 'gm', fieldKey: 'gm_notes' })
    mockFrom({ data: null })
    expect(await api.listFields('c1')).toEqual([])
    mockFrom({ error: { message: 'x' } })
    await expect(api.listFields('c1')).rejects.toThrow('x')
  })

  it('saves field changes in order: removals, edits, additions', async () => {
    const calls = mockFrom({}, {}, {}, {})
    await api.saveFields('c1', 'ch1', {
      deletes: ['a', 'b'],
      updates: [{ id: 'c', patch: { body: 'new' } }],
      inserts: [{ item_type: 'field', label: 'L', body: '', visibility: 'players', private: false, sort_order: 10 }],
    })
    const writes = calls.filter(c => ['delete', 'update', 'insert'].includes(c.method)).map(c => c.method)
    expect(writes).toEqual(['delete', 'update', 'insert'])
    expect(calls.find(c => c.method === 'in')?.args).toEqual(['id', ['a', 'b']])
    expect(calls.find(c => c.method === 'insert')?.args[0]).toEqual([
      { item_type: 'field', label: 'L', body: '', visibility: 'players', private: false, sort_order: 10, character_id: 'c1', channel_id: 'ch1' },
    ])
  })

  it('skips empty change groups and stops at the first error', async () => {
    let calls = mockFrom()
    await api.saveFields('c1', 'ch1', { deletes: [], updates: [], inserts: [] })
    expect(calls).toEqual([])

    mockFrom({ error: { message: 'del' } })
    await expect(api.saveFields('c1', 'ch1', { deletes: ['a'], updates: [], inserts: [] })).rejects.toThrow('del')
    mockFrom({ error: { message: 'upd' } })
    await expect(api.saveFields('c1', 'ch1', { deletes: [], updates: [{ id: 'a', patch: {} }], inserts: [] })).rejects.toThrow('upd')
    calls = mockFrom({ error: { message: 'ins' } })
    await expect(
      api.saveFields('c1', 'ch1', { deletes: [], updates: [], inserts: [{ item_type: 'field', label: 'L', body: '', visibility: 'gm', private: false, sort_order: 1 }] }),
    ).rejects.toThrow('ins')
  })

  it('lists history newest first and adds GM notes', async () => {
    let calls = mockFrom({
      data: [
        { id: 'e1', event_type: 'note', details: null, note: 'hi', visibility: 'players', actor_id: 'gm', created_at: 't' },
        { id: 'e2', event_type: 'renamed', details: { from: 'a' }, note: null, visibility: 'gm', actor_id: null, created_at: 't' },
      ],
    })
    const events = await api.listEvents('c1')
    expect(calls.find(c => c.method === 'order')?.args).toEqual(['created_at', { ascending: false }])
    expect(calls.find(c => c.method === 'limit')?.args).toEqual([api.HISTORY_LIMIT])
    expect(events[0]).toMatchObject({ eventType: 'note', details: {}, visibility: 'players' })
    expect(events[1].details).toEqual({ from: 'a' })
    mockFrom({ data: null })
    expect(await api.listEvents('c1')).toEqual([])
    mockFrom({ error: { message: 'e' } })
    await expect(api.listEvents('c1')).rejects.toThrow('e')

    calls = mockFrom({})
    await api.addNote('c1', 'ch1', '  Met him ', 'gm')
    expect(calls.find(c => c.method === 'insert')?.args[0]).toEqual({
      character_id: 'c1', channel_id: 'ch1', event_type: 'note', note: 'Met him', visibility: 'gm', actor_id: 'gm',
    })
    mockFrom({ error: { message: 'n' } })
    await expect(api.addNote('c1', 'ch1', 'x', 'gm')).rejects.toThrow('n')
  })

  it('manages tags', async () => {
    mockFrom({ data: [{ id: 't1', name: 'Witness' }] })
    expect(await api.listTags('ch1')).toEqual([{ id: 't1', name: 'Witness' }])
    mockFrom({ data: null })
    expect(await api.listTags('ch1')).toEqual([])
    mockFrom({ error: { message: 't' } })
    await expect(api.listTags('ch1')).rejects.toThrow('t')

    let calls = mockFrom({ data: { id: 't2', name: 'Federal' } })
    expect(await api.createTag('ch1', ' Federal ')).toEqual({ id: 't2', name: 'Federal' })
    expect(calls.find(c => c.method === 'insert')?.args[0]).toEqual({ channel_id: 'ch1', name: 'Federal' })
    mockFrom({ error: { message: 'dup' } })
    await expect(api.createTag('ch1', 'x')).rejects.toThrow('dup')

    calls = mockFrom({}, {})
    await api.setCharacterTags('c1', ['t2'], ['t1'])
    expect(calls.filter(c => c.method === 'delete' || c.method === 'insert').map(c => c.method)).toEqual(['delete', 'insert'])
    expect(calls.find(c => c.method === 'insert')?.args[0]).toEqual([{ character_id: 'c1', tag_id: 't2' }])

    calls = mockFrom()
    await api.setCharacterTags('c1', [], [])
    expect(calls).toEqual([])
    mockFrom({ error: { message: 'r' } })
    await expect(api.setCharacterTags('c1', [], ['t1'])).rejects.toThrow('r')
    mockFrom({ error: { message: 'a' } })
    await expect(api.setCharacterTags('c1', ['t1'], [])).rejects.toThrow('a')
  })
})
