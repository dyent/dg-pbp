import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePostingIdentities } from './usePostingIdentities'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    channel: vi.fn(),
  },
}))

const row = {
  user_id: 'u1',
  character_id: 'c1',
  name: 'Reyes',
  portrait_url: null,
  started_at: '2026-01-01T00:00:00Z',
  ended_at: null,
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

describe('usePostingIdentities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the campaign's posting identities", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row], error: null } as never)
    mockRealtime()

    const { result } = renderHook(() => usePostingIdentities('chan-1'))

    await waitFor(() => expect(result.current.identities).toHaveLength(1))
    expect(supabase.rpc).toHaveBeenCalledWith('ext_posting_identities', { p_channel_id: 'chan-1' })
    expect(result.current.identities[0].name).toBe('Reyes')
    expect(result.current.error).toBeNull()
  })

  it('keeps the list empty and reports the error when loading fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'boom' } } as never)
    mockRealtime()

    const { result } = renderHook(() => usePostingIdentities('chan-1'))

    await waitFor(() => expect(result.current.error?.message).toBe('boom'))
    expect(result.current.identities).toEqual([])
    consoleError.mockRestore()
  })

  it('reloads when a posting period changes in this campaign', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    const { handlers, filters } = mockRealtime()

    const { result } = renderHook(() => usePostingIdentities('chan-1'))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1))
    expect(filters[0]).toEqual({
      event: '*',
      schema: 'public',
      table: 'ext_posting_periods',
      filter: 'channel_id=eq.chan-1',
    })

    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row], error: null } as never)
    act(() => handlers[0]())

    await waitFor(() => expect(result.current.identities).toHaveLength(1))
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('gives each hook instance its own live-update channel', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    mockRealtime()

    renderHook(() => usePostingIdentities('chan-1'))
    renderHook(() => usePostingIdentities('chan-1'))
    await waitFor(() => expect(supabase.channel).toHaveBeenCalledTimes(2))

    const [first, second] = vi.mocked(supabase.channel).mock.calls.map(call => call[0])
    expect(first).toMatch(/^channel:chan-1:posting:/)
    expect(second).not.toBe(first)
  })

  it('unsubscribes from live updates on unmount', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    const { channel } = mockRealtime()

    const { unmount } = renderHook(() => usePostingIdentities('chan-1'))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    unmount()

    expect(channel.unsubscribe).toHaveBeenCalled()
  })

  it('does nothing without a campaign', () => {
    const { result } = renderHook(() => usePostingIdentities(undefined))

    expect(result.current.identities).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(supabase.channel).not.toHaveBeenCalled()
  })
})
