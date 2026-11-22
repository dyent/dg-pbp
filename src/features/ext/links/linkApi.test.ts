import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './linkApi'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

type Result = { data?: unknown; error?: unknown }

/** Each call to supabase.from gets the next result; records every builder call. */
function mockTables(...results: Result[]) {
  const calls: { method: string; args: unknown[] }[] = []
  let i = 0
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    calls.push({ method: 'from', args: [table] })
    const result = results[Math.min(i++, results.length - 1)]
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'insert', 'update', 'delete']) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args })
        return builder
      })
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
    return builder
  }) as never)
  return calls
}

const row = {
  id: 'l1',
  label: 'works at',
  visibility: 'players',
  outgoing: true,
  other_type: 'record',
  other_id: 'r1',
  other_name: 'Morgue',
  other_kind: 'location',
  other_picture_url: null,
}

describe('linkApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the links of a character or a record', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row], error: null } as never)
    const links = await api.listLinks({ type: 'character', id: 'c1' })
    expect(supabase.rpc).toHaveBeenCalledWith('ext_links_for', { p_character_id: 'c1' })
    expect(links).toEqual([
      { id: 'l1', label: 'works at', visibility: 'players', outgoing: true, other: { type: 'record', id: 'r1', name: 'Morgue', kind: 'location', pictureUrl: null } },
    ])

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ ...row, visibility: 'odd', other_type: 'character', other_kind: 'strange' }],
      error: null,
    } as never)
    const [odd] = await api.listLinks({ type: 'record', id: 'r9' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_links_for', { p_record_id: 'r9' })
    expect(odd).toMatchObject({ visibility: 'gm', other: { type: 'character', kind: 'npc' } })

    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    expect(await api.listLinks({ type: 'record', id: 'r9' })).toEqual([])
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'nope' } } as never)
    await expect(api.listLinks({ type: 'record', id: 'r9' })).rejects.toThrow('nope')
  })

  it('lists characters and records to link to', async () => {
    mockTables(
      { data: [{ id: 'c1', name: 'Reyes', kind: 'pc', portrait_url: null }, { id: 'c2', name: 'Hale', kind: 'npc', portrait_url: 'p.png' }] },
      { data: [{ id: 'r1', name: 'Morgue', kind: 'location', picture_url: null }, { id: 'r2', name: 'Bad', kind: 'nonsense', picture_url: null }] },
    )
    const targets = await api.listLinkTargets('ch')
    expect(targets).toEqual([
      { type: 'character', id: 'c1', name: 'Reyes', kind: 'pc', pictureUrl: null },
      { type: 'character', id: 'c2', name: 'Hale', kind: 'npc', pictureUrl: 'p.png' },
      { type: 'record', id: 'r1', name: 'Morgue', kind: 'location', pictureUrl: null },
    ])
    mockTables({ data: [] }, { error: { message: 'denied' } })
    await expect(api.listLinkTargets('ch')).rejects.toThrow('denied')
    mockTables({ error: { message: 'no characters' } }, { data: [] })
    await expect(api.listLinkTargets('ch')).rejects.toThrow('no characters')
  })

  it('adds a link with exactly one column per end', async () => {
    const calls = mockTables({})
    await api.addLink({
      channelId: 'ch',
      from: { type: 'character', id: 'c1' },
      to: { type: 'record', id: 'r1' },
      label: '  works at ',
      visibility: 'players',
      userId: 'gm',
    })
    expect(calls.find(c => c.method === 'insert')?.args[0]).toEqual({
      channel_id: 'ch',
      from_character_id: 'c1',
      from_record_id: null,
      to_character_id: null,
      to_record_id: 'r1',
      label: 'works at',
      visibility: 'players',
      created_by: 'gm',
    })
  })

  it('explains a duplicate link', async () => {
    mockTables({ error: { code: '23505', message: 'duplicate key value' } })
    await expect(
      api.addLink({ channelId: 'ch', from: { type: 'record', id: 'a' }, to: { type: 'record', id: 'b' }, label: 'x', visibility: 'gm', userId: 'gm' }),
    ).rejects.toThrow('These two are already linked with that label.')
  })

  it('updates and deletes links', async () => {
    let calls = mockTables({})
    await api.updateLink('l1', { label: ' knows ' })
    expect(calls.find(c => c.method === 'update')?.args[0]).toEqual({ label: 'knows' })
    calls = mockTables({})
    await api.updateLink('l1', { visibility: 'gm' })
    expect(calls.find(c => c.method === 'update')?.args[0]).toEqual({ visibility: 'gm' })
    calls = mockTables({})
    await api.deleteLink('l1')
    expect(calls.map(c => c.method)).toEqual(['from', 'delete', 'eq'])
    mockTables({ error: { message: 'archived' } })
    await expect(api.deleteLink('l1')).rejects.toThrow('archived')
    await expect(api.updateLink('l1', { visibility: 'gm' })).rejects.toThrow('archived')
  })
})
