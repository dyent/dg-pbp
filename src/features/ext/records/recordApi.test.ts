import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './recordApi'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

type Result = { data?: unknown; error?: unknown }
type Call = { table: string; method: string; args: unknown[] }

/** Chainable query builders, one result per table. */
function mockTables(results: Record<string, Result>) {
  const calls: Call[] = []
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete', 'single']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args })
        return builder
      })
    }
    const result = results[table] ?? {}
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
    return builder
  }) as never)
  return calls
}

const row = { id: 'r1', kind: 'location', name: 'Morgue', picture_url: null, provenance: 'canon', visibility: 'selected', updated_at: 't' }

describe('recordApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists records; the GM also gets tags and chosen players', async () => {
    const calls = mockTables({
      ext_records: { data: [row, { ...row, id: 'bad', kind: 'npc' }, { ...row, id: 'r2', visibility: 'odd', provenance: 'source' }] },
      ext_record_tags: { data: [{ record_id: 'r1', tag_id: 't1' }] },
      ext_record_shares: { data: [{ record_id: 'r1', user_id: 'u1' }, { record_id: 'r1', user_id: 'u2' }] },
    })
    const list = await api.listRecords('ch', true)
    expect(list.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(list[0]).toMatchObject({ tagIds: ['t1'], sharedWith: ['u1', 'u2'], visibility: 'selected' })
    expect(list[1]).toMatchObject({ visibility: 'gm', provenance: 'source', tagIds: [] })
    expect(calls).toContainEqual({ table: 'ext_records', method: 'eq', args: ['channel_id', 'ch'] })
  })

  it('skips GM extras for players', async () => {
    const calls = mockTables({ ext_records: { data: [row] } })
    const list = await api.listRecords('ch', false)
    expect(list[0].sharedWith).toEqual([])
    expect(calls.some(c => c.table === 'ext_record_tags')).toBe(false)
  })

  it('throws readable errors', async () => {
    mockTables({ ext_records: { error: { message: 'boom' } } })
    await expect(api.listRecords('ch', false)).rejects.toThrow('boom')
    mockTables({ ext_records: { data: [row] }, ext_record_tags: { error: { message: 'tags' } } })
    await expect(api.listRecords('ch', true)).rejects.toThrow('tags')
    mockTables({ ext_records: { data: [row] }, ext_record_shares: { error: { message: 'shares' } } })
    await expect(api.listRecords('ch', true)).rejects.toThrow('shares')
    mockTables({ ext_record_fields: { error: { message: 'f' } }, ext_record_events: { error: { message: 'e' } } })
    await expect(api.listRecordFields('r1')).rejects.toThrow('f')
    await expect(api.listRecordEvents('r1')).rejects.toThrow('e')
    await expect(api.saveRecordFields('r1', 'ch', { deletes: ['x'], updates: [], inserts: [] })).rejects.toThrow('f')
  })

  it('creates, updates and deletes records', async () => {
    const calls = mockTables({ ext_records: { data: { id: 'new' } } })
    expect(await api.createRecord('ch', 'clue', '  Glove ', 'gm')).toBe('new')
    expect(calls).toContainEqual({ table: 'ext_records', method: 'insert', args: [{ channel_id: 'ch', kind: 'clue', name: 'Glove', created_by: 'gm' }] })
    await api.updateRecord('r1', { name: 'X' })
    await api.deleteRecord('r1')
    expect(calls.filter(c => c.method === 'update' || c.method === 'delete').map(c => c.method)).toEqual(['update', 'delete'])
  })

  it('shares through the database function', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await api.setRecordVisibility('r1', 'players', ['u1'])
    expect(supabase.rpc).toHaveBeenCalledWith('ext_set_record_visibility', { p_record_id: 'r1', p_visibility: 'players', p_player_ids: [] })
    await api.setRecordVisibility('r1', 'selected', ['u1'])
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_set_record_visibility', { p_record_id: 'r1', p_visibility: 'selected', p_player_ids: ['u1'] })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Only the GM can share records' } } as never)
    await expect(api.setRecordVisibility('r1', 'gm', [])).rejects.toThrow('Only the GM')
  })

  it('reads fields and history', async () => {
    mockTables({
      ext_record_fields: { data: [{ id: 'f1', record_id: 'r1', item_type: 'heading', field_key: null, label: 'H', body: '', visibility: 'players', sort_order: 10 }, { id: 'f2', record_id: 'r1', item_type: 'field', field_key: 'gm_notes', label: 'GM notes', body: 'x', visibility: 'gm', sort_order: 90 }] },
      ext_record_events: { data: [{ id: 'e1', event_type: 'created', details: { kind: 'clue' }, actor_id: 'gm', created_at: 't' }, { id: 'e2', event_type: 'renamed', details: [1], actor_id: null, created_at: 't' }] },
    })
    const fields = await api.listRecordFields('r1')
    expect(fields.map(f => [f.itemType, f.visibility, f.private])).toEqual([['heading', 'players', false], ['field', 'gm', false]])
    const events = await api.listRecordEvents('r1')
    expect(events.map(e => e.details)).toEqual([{ kind: 'clue' }, {}])
  })

  it('saves field changes without the character-only Private flag', async () => {
    const calls = mockTables({})
    await api.saveRecordFields('r1', 'ch', {
      deletes: ['f9'],
      updates: [{ id: 'f1', patch: { body: 'new', private: false } }],
      inserts: [{ item_type: 'field', label: 'Extra', body: '', visibility: 'gm', private: false, sort_order: 30 }],
    })
    expect(calls).toContainEqual({ table: 'ext_record_fields', method: 'in', args: ['id', ['f9']] })
    expect(calls).toContainEqual({ table: 'ext_record_fields', method: 'update', args: [{ body: 'new' }] })
    expect(calls).toContainEqual({
      table: 'ext_record_fields',
      method: 'insert',
      args: [[{ item_type: 'field', label: 'Extra', body: '', visibility: 'gm', sort_order: 30, record_id: 'r1', channel_id: 'ch' }]],
    })
  })

  it('adds and removes tags', async () => {
    const calls = mockTables({})
    await api.setRecordTags('r1', ['t1'], ['t2'])
    expect(calls).toContainEqual({ table: 'ext_record_tags', method: 'in', args: ['tag_id', ['t2']] })
    expect(calls).toContainEqual({ table: 'ext_record_tags', method: 'insert', args: [[{ record_id: 'r1', tag_id: 't1' }]] })
    mockTables({ ext_record_tags: { error: { message: 'nope' } } })
    await expect(api.setRecordTags('r1', ['t1'], [])).rejects.toThrow('nope')
  })
})
