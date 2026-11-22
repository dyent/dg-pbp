import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import { listCharacters } from '../characters/characterApi'
import { listRecords } from '../records/recordApi'
import type { CampaignRecord } from '../records/recordModel'
import { aliasTagId, fetchNpcLabels, listAliasTags, listTaggableNpcs, listTaggableRecords } from './npcTagApi'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('../characters/characterApi', () => ({ listCharacters: vi.fn() }))
vi.mock('../records/recordApi', () => ({ listRecords: vi.fn() }))

type Result = { data?: unknown; error?: unknown }

function mockTables(results: Record<string, Result>) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) builder[m] = vi.fn(() => builder)
    const r = results[table] ?? {}
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(resolve)
    return builder
  }) as never)
}

const record: CampaignRecord = { id: 'r1', kind: 'location', name: 'Morgue', pictureUrl: null, provenance: 'canon', visibility: 'gm', updatedAt: 't', tagIds: [], sharedWith: [] }

describe('npcTagApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists NPCs, with aliases for the GM only', async () => {
    vi.mocked(listCharacters).mockResolvedValue([
      { id: 'c1', kind: 'npc', inPlay: true, name: 'Dr Hale', portraitUrl: null, status: null, ownerId: null, isMine: false, updatedAt: 't', aliases: ['Doc'] },
      { id: 'c2', kind: 'pc', inPlay: true, name: 'Reyes', portraitUrl: null, status: null, ownerId: 'u1', isMine: false, updatedAt: 't' },
    ])
    expect(await listTaggableNpcs('ch', true, 'gm')).toEqual([{ id: 'c1', name: 'Dr Hale', portraitUrl: null, aliases: ['Doc'] }])
    expect((await listTaggableNpcs('ch', false, 'u1'))[0].aliases).toEqual([])
  })

  it('lists records with their kind, and the GM their aliases', async () => {
    vi.mocked(listRecords).mockResolvedValue([record, { ...record, id: 'r2', name: 'Glove', kind: 'clue' }])
    mockTables({ ext_record_aliases: { data: [{ record_id: 'r1', alias: 'The Slab', sort_order: 1 }, { record_id: 'r1', alias: 'Cold Room', sort_order: 2 }] } })
    expect(await listTaggableRecords('ch', true)).toEqual([
      { id: 'r1', name: 'Morgue', portraitUrl: null, recordKind: 'location', aliases: ['The Slab', 'Cold Room'] },
      { id: 'r2', name: 'Glove', portraitUrl: null, recordKind: 'clue', aliases: [] },
    ])
    vi.mocked(supabase.from).mockClear()
    await listTaggableRecords('ch', false)
    expect(supabase.from).not.toHaveBeenCalled()
    mockTables({ ext_record_aliases: { error: { message: 'boom' } } })
    await expect(listTaggableRecords('ch', true)).rejects.toThrow('boom')
  })

  it('reads NPC and record alias tags together', async () => {
    mockTables({
      ext_npc_alias_tags: { data: [{ id: 't1', character_id: 'c1', alias: 'Doc' }] },
      ext_record_alias_tags: { data: [{ id: 't2', record_id: 'r1', alias: 'The Slab' }] },
    })
    expect(await listAliasTags('ch')).toEqual([
      { id: 't1', targetId: 'c1', alias: 'Doc' },
      { id: 't2', targetId: 'r1', alias: 'The Slab' },
    ])
    mockTables({ ext_npc_alias_tags: { error: { message: 'npc' } } })
    await expect(listAliasTags('ch')).rejects.toThrow('npc')
    mockTables({ ext_record_alias_tags: { error: { message: 'rec' } } })
    await expect(listAliasTags('ch')).rejects.toThrow('rec')
  })

  it('asks the right function for an alias tag id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'tag', error: null } as never)
    expect(await aliasTagId({ id: 'r1', name: 'Morgue', portraitUrl: null, recordKind: 'location' }, 'The Slab')).toBe('tag')
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_record_alias_tag', { p_record_id: 'r1', p_alias: 'The Slab' })
    await aliasTagId({ id: 'c1', name: 'Dr Hale', portraitUrl: null }, 'Doc')
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_npc_alias_tag', { p_character_id: 'c1', p_alias: 'Doc' })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Only the GM can tag by alias' } } as never)
    await expect(aliasTagId({ id: 'c1', name: 'Dr Hale', portraitUrl: null }, 'Doc')).rejects.toThrow('Only the GM')
  })

  it('fetches labels of hidden NPCs', async () => {
    expect(await fetchNpcLabels('ch', [])).toEqual([])
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ id: 'c9', name: 'Moreau', portrait_url: '' }], error: null } as never)
    expect(await fetchNpcLabels('ch', ['c9'])).toEqual([{ id: 'c9', name: 'Moreau', portraitUrl: null }])
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'x' } } as never)
    await expect(fetchNpcLabels('ch', ['c9'])).rejects.toThrow('x')
  })
})
