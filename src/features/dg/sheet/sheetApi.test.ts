import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './sheetApi'
import { useSheet, withPool } from './useSheet'
import { newAgentSheet } from './sheetModel'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

function mockFrom(result: { error?: unknown } = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['insert', 'update', 'delete', 'eq']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    })
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: result.error ?? null }).then(resolve)
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    calls.push({ method: 'from', args: [table] })
    return builder
  }) as never)
  return calls
}

const readRow = {
  character_id: 'c1',
  data: { format: 'agent' },
  updated_at: '2026-11-18T10:00:00Z',
  updated_by: 'u1',
  hp_max_calc: 12,
  wp_max_calc: 13,
  san_start_calc: 65,
  san_max_calc: 99,
  breaking_point_start_calc: 52,
}

describe('sheetApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads a sheet with the database-calculated values', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [readRow], error: null } as never)
    const row = await api.getSheet('c1')
    expect(supabase.rpc).toHaveBeenCalledWith('dg_get_sheet', { p_character_id: 'c1' })
    expect(row).toEqual({
      characterId: 'c1',
      data: { format: 'agent' },
      calc: { hpMax: 12, wpMax: 13, sanStart: 65, sanMax: 99, breakingPointStart: 52 },
      updatedAt: '2026-11-18T10:00:00Z',
      updatedBy: 'u1',
    })
  })

  it('returns null when there is no (visible) sheet and fills missing ids', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    expect(await api.getSheet('c1')).toBeNull()
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    expect(await api.getSheet('c1')).toBeNull()
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ ...readRow, character_id: null, updated_at: null }], error: null } as never)
    expect(await api.getSheet('c9')).toMatchObject({ characterId: 'c9', updatedAt: '' })
  })

  it('throws readable read errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'denied' } } as never)
    await expect(api.getSheet('c1')).rejects.toThrow('denied')
  })

  it('creates, saves and removes sheets', async () => {
    const sheet = newAgentSheet()
    let calls = mockFrom()
    await api.createSheet('c1', 'ch1', sheet)
    expect(calls).toContainEqual({ method: 'from', args: ['dg_character_sheets'] })
    expect(calls.find(c => c.method === 'insert')?.args[0]).toEqual({ character_id: 'c1', channel_id: 'ch1', data: sheet })

    calls = mockFrom()
    await api.saveSheet('c1', sheet)
    expect(calls.find(c => c.method === 'update')?.args[0]).toEqual({ data: sheet })
    expect(calls.find(c => c.method === 'eq')?.args).toEqual(['character_id', 'c1'])

    calls = mockFrom()
    await api.deleteSheet('c1')
    expect(calls.some(c => c.method === 'delete')).toBe(true)
  })

  it('throws readable write errors', async () => {
    mockFrom({ error: { message: 'Numbers on the sheet must be between 0 and 999 (hp.current)' } })
    await expect(api.saveSheet('c1', newAgentSheet())).rejects.toThrow(/between 0 and 999/)
    mockFrom({ error: { message: 'no' } })
    await expect(api.createSheet('c1', 'ch1', newAgentSheet())).rejects.toThrow('no')
    mockFrom({ error: { message: 'gm only' } })
    await expect(api.deleteSheet('c1')).rejects.toThrow('gm only')
  })
})

describe('useSheet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads, reloads and exposes writes bound to the character', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [readRow], error: null } as never)
    const { result } = renderHook(() => useSheet('c1', 'ch1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.row?.calc.hpMax).toBe(12)
    act(() => result.current.reload())
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(2))

    const calls = mockFrom()
    await result.current.save(newAgentSheet())
    await result.current.create(newAgentSheet())
    await result.current.remove()
    expect(calls.filter(c => c.method === 'from')).toHaveLength(3)
  })

  it('shows a quick HP change straight away, then saves just that value', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ ...readRow, data: { format: 'agent', hp: { current: 10, maxOverride: 12 } } }], error: null } as never)
    const { result } = renderHook(() => useSheet('c1', 'ch1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await act(() => result.current.setPool('hp', 7))
    expect(result.current.row?.data).toEqual({ format: 'agent', hp: { current: 7, maxOverride: 12 } })
    expect(supabase.rpc).toHaveBeenLastCalledWith('dg_set_pool', { p_character_id: 'c1', p_pool: 'hp', p_value: 7 })

    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Not allowed' } } as never)
    await expect(result.current.setPool('san', null)).rejects.toThrow('Not allowed')
  })

  it('withPool copes with missing or odd sheet data', () => {
    expect(withPool(null, 'san', 50)).toEqual({ san: { current: 50 } })
    expect(withPool([], 'wp', 3)).toEqual({ wp: { current: 3 } })
    expect(withPool({ wp: 'x', notes: 'n' }, 'wp', 3)).toEqual({ wp: { current: 3 }, notes: 'n' })
  })

  it('reports load errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'boom' } } as never)
    const { result } = renderHook(() => useSheet('c1', 'ch1'))
    await waitFor(() => expect(result.current.error?.message).toBe('boom'))
    spy.mockRestore()
  })

  it('ignores late results and errors after unmount', async () => {
    let resolve: (v: unknown) => void = () => {}
    vi.mocked(supabase.rpc).mockReturnValue(new Promise(r => { resolve = r }) as never)
    const first = renderHook(() => useSheet('c1', 'ch1'))
    first.unmount()
    resolve({ data: [readRow], error: null })

    let reject: (e: unknown) => void = () => {}
    vi.mocked(supabase.rpc).mockReturnValue(new Promise((_, r) => { reject = r }) as never)
    const second = renderHook(() => useSheet('c2', 'ch1'))
    second.unmount()
    reject(new Error('late'))
    await Promise.resolve()
    expect(second.result.current.error).toBeNull()
  })
})
