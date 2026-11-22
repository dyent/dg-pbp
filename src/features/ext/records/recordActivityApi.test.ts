import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './recordActivityApi'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

type Result = { data?: unknown; error?: unknown }

function mockTable(result: Result) {
  const calls: { method: string; args: unknown[] }[] = []
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    calls.push({ method: 'from', args: [table] })
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args })
        return builder
      })
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
    return builder
  }) as never)
  return calls
}

const ok = { data: null, error: null } as never
const bad = { data: null, error: { message: 'You can only edit your own notes' } } as never

describe('recordActivityApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists posts about a record as mentions', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: 'm1', kind: 'mentioned', sender_id: 'u1', type: 'regular', content: 'Morgue', npc_name: null, sub_channel_id: null, whisper_to: 'u2', created_at: 't' }],
      error: null,
    } as never)
    const posts = await api.listRecordPosts('ch', 'r1', ['Morgue'], 'before')
    expect(supabase.rpc).toHaveBeenCalledWith('ext_record_posts', { p_channel_id: 'ch', p_record_id: 'r1', p_terms: ['Morgue'], p_before: 'before', p_limit: 50 })
    expect(posts[0]).toMatchObject({ id: 'm1', kind: 'mentioned', whisper: true })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    expect(await api.listRecordPosts('ch', 'r1', [])).toEqual([])
    vi.mocked(supabase.rpc).mockResolvedValue(bad)
    await expect(api.listRecordPosts('ch', 'r1', [])).rejects.toThrow()
  })

  it('lists notes and aliases', async () => {
    const calls = mockTable({
      data: [{ id: 'n1', author_id: 'u1', author_character_name: 'Reyes', body: 'b', visibility: 'odd', in_game_day: 5, created_at: 'a', updated_at: 'b', alias: 'x' }],
    })
    const notes = await api.listRecordNotes('r1')
    expect(notes[0]).toMatchObject({ visibility: 'gm', edited: true, inGameDay: 5 })
    expect(calls).toContainEqual({ method: 'from', args: ['ext_record_notes'] })
    expect(await api.listRecordAliases('r1')).toEqual(['x'])
    mockTable({ error: { message: 'boom' } })
    await expect(api.listRecordNotes('r1')).rejects.toThrow('boom')
    await expect(api.listRecordAliases('r1')).rejects.toThrow('boom')
  })

  it('writes notes and aliases through the database functions', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue(ok)
    await api.addRecordNote('r1', 'Text', 'author', 5)
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_add_record_note', { p_record_id: 'r1', p_body: 'Text', p_visibility: 'author', p_in_game_day: 5 })
    await api.updateRecordNote('n1', 'New', 'everyone', null)
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_update_record_note', { p_note_id: 'n1', p_body: 'New', p_visibility: 'everyone', p_in_game_day: null })
    await api.deleteRecordNote('n1')
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_delete_record_note', { p_note_id: 'n1' })
    await api.setRecordAliases('r1', ['The Slab'])
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_set_record_aliases', { p_record_id: 'r1', p_aliases: ['The Slab'] })

    vi.mocked(supabase.rpc).mockResolvedValue(bad)
    await expect(api.addRecordNote('r1', 'x', 'author', null)).rejects.toThrow('own notes')
    await expect(api.updateRecordNote('n1', 'x', 'author', null)).rejects.toThrow()
    await expect(api.deleteRecordNote('n1')).rejects.toThrow()
    await expect(api.setRecordAliases('r1', [])).rejects.toThrow()
  })
})
