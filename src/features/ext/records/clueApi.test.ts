import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './clueApi'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

type Result = { data?: unknown; error?: unknown }

function mockTables(...results: Result[]) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  let i = 0
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = results[Math.min(i++, results.length - 1)]
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete']) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: m, args })
        return builder
      })
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
    return builder
  }) as never)
  return calls
}

describe('clueApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads clue details, keeping only names the viewer may see', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ clue_status: 'resolved', found_by_character_id: 'c1', found_by_name: 'Reyes', found_at_record_id: null, found_at_name: null, found_day: 5 }],
      error: null,
    } as never)
    expect(await api.getClueDetails('r1')).toEqual({ status: 'resolved', foundBy: { id: 'c1', name: 'Reyes' }, foundAt: null, foundDay: 5 })
    expect(supabase.rpc).toHaveBeenCalledWith('ext_clue_details', { p_record_id: 'r1' })

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ clue_status: 'odd', found_by_character_id: null, found_by_name: null, found_at_record_id: 'r9', found_at_name: 'Attic', found_day: null }],
      error: null,
    } as never)
    expect(await api.getClueDetails('r1')).toEqual({ status: 'unexamined', foundBy: null, foundAt: { id: 'r9', name: 'Attic' }, foundDay: null })

    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    expect(await api.getClueDetails('r1')).toBeNull()
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'nope' } } as never)
    await expect(api.getClueDetails('r1')).rejects.toThrow('nope')
  })

  it('sets the status and the found details', async () => {
    let calls = mockTables({})
    await api.setClueStatus('r1', 'investigated')
    expect(calls).toContainEqual({ table: 'ext_records', method: 'update', args: [{ clue_status: 'investigated' }] })
    calls = mockTables({})
    await api.setClueFound('r1', { byId: 'c1', atId: null, day: 3 })
    expect(calls).toContainEqual({ table: 'ext_records', method: 'update', args: [{ found_by_character_id: 'c1', found_at_record_id: null, found_day: 3 }] })
    mockTables({ error: { message: 'denied' } })
    await expect(api.setClueStatus('r1', 'resolved')).rejects.toThrow('denied')
    await expect(api.setClueFound('r1', { byId: null, atId: null, day: null })).rejects.toThrow('denied')
  })

  it('lists PCs and locations for the GM', async () => {
    const calls = mockTables({ data: [{ id: 'c1', name: 'Reyes' }] }, { data: [{ id: 'r1', name: 'Morgue' }] })
    expect(await api.listFoundOptions('ch')).toEqual({ pcs: [{ id: 'c1', name: 'Reyes' }], locations: [{ id: 'r1', name: 'Morgue' }] })
    expect(calls).toContainEqual({ table: 'ext_characters', method: 'eq', args: ['kind', 'pc'] })
    expect(calls).toContainEqual({ table: 'ext_records', method: 'eq', args: ['kind', 'location'] })
    mockTables({ data: [] }, { error: { message: 'no locations' } })
    await expect(api.listFoundOptions('ch')).rejects.toThrow('no locations')
    mockTables({ error: { message: 'no pcs' } }, { data: [] })
    await expect(api.listFoundOptions('ch')).rejects.toThrow('no pcs')
  })

  it('manages checklist points', async () => {
    mockTables({ data: [{ id: 'p1', body: 'Hale', worked_out: true, sort_order: 0 }] })
    expect(await api.listCluePoints('r1')).toEqual([{ id: 'p1', body: 'Hale', workedOut: true, sortOrder: 0 }])
    mockTables({ data: null })
    expect(await api.listCluePoints('r1')).toEqual([])

    let calls = mockTables({})
    await api.addCluePoint('r1', 'ch', '  Hale  ', 2)
    expect(calls).toContainEqual({ table: 'ext_clue_points', method: 'insert', args: [{ record_id: 'r1', channel_id: 'ch', body: 'Hale', sort_order: 2 }] })
    calls = mockTables({})
    await api.updateCluePoint('p1', { body: ' Hale ' })
    expect(calls).toContainEqual({ table: 'ext_clue_points', method: 'update', args: [{ body: 'Hale' }] })
    calls = mockTables({})
    await api.updateCluePoint('p1', { worked_out: false })
    expect(calls).toContainEqual({ table: 'ext_clue_points', method: 'update', args: [{ worked_out: false }] })
    calls = mockTables({})
    await api.deleteCluePoint('p1')
    expect(calls.map(c => c.method)).toEqual(['delete', 'eq'])

    mockTables({ error: { message: 'archived' } })
    await expect(api.listCluePoints('r1')).rejects.toThrow('archived')
    await expect(api.addCluePoint('r1', 'ch', 'x', 0)).rejects.toThrow('archived')
    await expect(api.updateCluePoint('p1', { worked_out: true })).rejects.toThrow('archived')
    await expect(api.deleteCluePoint('p1')).rejects.toThrow('archived')
  })
})
