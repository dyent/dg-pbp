import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './calendarApi'
import { useCalendarChanges } from './useCalendarChanges'

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}))

function mockFrom(result: { data?: unknown; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    })
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    calls.push({ method: 'from', args: [table] })
    return builder
  }) as never)
  return calls
}

function mockRealtime() {
  const handlers: Array<() => void> = []
  const filters: Array<Record<string, unknown>> = []
  const channel = {
    on: vi.fn().mockImplementation((_event: string, filter: Record<string, unknown>, cb: () => void) => {
      handlers.push(cb)
      filters.push(filter)
      return channel
    }),
    subscribe: vi.fn().mockImplementation((cb: (status: string) => void) => {
      cb('SUBSCRIBED')
      return channel
    }),
    unsubscribe: vi.fn(),
  }
  vi.mocked(supabase.channel).mockReturnValue(channel as never)
  return { channel, handlers, filters }
}

const rows = [
  { id: 'c2', sub_channel_id: 'r1', kind: 'shift', day_number: 5, shift_amount: 2, shift_unit: 'week', created_at: '2026-11-19T10:05:00Z' },
  { id: 'c1', sub_channel_id: null, kind: 'set', day_number: 1, shift_amount: null, shift_unit: null, created_at: '2026-11-19T10:01:00Z' },
  { id: 'c3', sub_channel_id: 'r1', kind: 'clear', day_number: null, shift_amount: null, shift_unit: 'fortnight', created_at: '2026-11-19T10:09:00Z' },
]

describe('calendarApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists changes for a campaign', async () => {
    const calls = mockFrom({ data: rows })
    const list = await api.listChanges('ch')
    expect(calls).toContainEqual({ method: 'from', args: ['ext_calendar_changes'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['channel_id', 'ch'] })
    expect(list[0]).toEqual({ id: 'c2', subChannelId: 'r1', kind: 'shift', dayNumber: 5, shiftAmount: 2, shiftUnit: 'week', createdAt: '2026-11-19T10:05:00Z' })
    expect(list[2].shiftUnit).toBeNull()
    mockFrom({ error: { message: 'boom' } })
    await expect(api.listChanges('ch')).rejects.toThrow('boom')
  })

  it('calls the GM functions', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await api.setDate('ch', null, 10)
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_set_in_game_date', { p_channel_id: 'ch', p_sub_channel_id: null, p_day_number: 10 })
    await api.shiftDate('ch', 'r1', -3, 'month')
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_shift_in_game_date', { p_channel_id: 'ch', p_sub_channel_id: 'r1', p_amount: -3, p_unit: 'month' })
    await api.clearRoomDate('ch', 'r1')
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_clear_room_date', { p_channel_id: 'ch', p_sub_channel_id: 'r1' })
    await api.undoChange('c9')
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_undo_in_game_date_change', { p_change_id: 'c9' })
  })

  it('throws readable errors from the GM functions', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Only the GM can change the in-game date' } } as never)
    await expect(api.setDate('ch', null, 1)).rejects.toThrow('Only the GM')
    await expect(api.shiftDate('ch', null, 1, 'day')).rejects.toThrow('Only the GM')
    await expect(api.clearRoomDate('ch', 'r1')).rejects.toThrow('Only the GM')
    await expect(api.undoChange('c1')).rejects.toThrow('Only the GM')
  })
})

describe('useCalendarChanges', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads sorted changes and reloads on live updates', async () => {
    mockFrom({ data: rows })
    const { handlers, filters, channel } = mockRealtime()
    const { result, unmount } = renderHook(() => useCalendarChanges('ch'))
    await waitFor(() => expect(result.current.changes.map(c => c.id)).toEqual(['c1', 'c2', 'c3']))
    expect(filters[0]).toMatchObject({ table: 'ext_calendar_changes', filter: 'channel_id=eq.ch' })

    mockFrom({ data: [rows[1]] })
    act(() => handlers[0]())
    await waitFor(() => expect(result.current.changes.map(c => c.id)).toEqual(['c1']))
    unmount()
    expect(channel.unsubscribe).toHaveBeenCalled()
  })

  it('stays empty without a campaign or when loading fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useCalendarChanges(undefined))
    expect(result.current.changes).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()

    mockFrom({ error: { message: 'offline' } })
    mockRealtime()
    const failing = renderHook(() => useCalendarChanges('ch'))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(failing.result.current.changes).toEqual([])
    spy.mockRestore()
  })
})
