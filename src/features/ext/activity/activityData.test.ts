// cspell:words Okafor
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './activityApi'
import { buildActivity, isNoteVisibility, noteChoices, searchTerms, type ActivityNote, type ActivityPost } from './activityModel'
import { useCharacterActivity } from './useCharacterActivity'
import type { CharacterEvent, CharacterSummary } from '../characters/characterModel'

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

/** Each table returns its own rows; calls are recorded. */
function mockTables(tables: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = tables[table] ?? { data: [] }
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args })
        return builder
      })
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
    return builder
  }) as never)
  return calls
}

const postRow = (id: string, kind: string, at: string, extra: Record<string, unknown> = {}) => ({
  id, kind, sender_id: 'u1', type: 'regular', content: `post ${id}`, npc_name: null, sub_channel_id: null, whisper_to: null, created_at: at, ...extra,
})

const noteRow = { id: 'n1', author_id: 'u1', author_character_name: 'Reyes', body: 'Has a limp', visibility: 'everyone', in_game_day: 10144, created_at: '2026-11-19T10:00:00Z', updated_at: '2026-11-19T11:00:00Z' }

describe('activityApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists notes, newest first, as app objects', async () => {
    const calls = mockTables({ ext_character_notes: { data: [noteRow, { ...noteRow, id: 'n2', visibility: 'odd', updated_at: noteRow.created_at }] } })
    const notes = await api.listNotes('c1')
    expect(notes[0]).toEqual({ id: 'n1', authorId: 'u1', authorCharacterName: 'Reyes', body: 'Has a limp', visibility: 'everyone', inGameDay: 10144, createdAt: noteRow.created_at, edited: true })
    expect(notes[1]).toMatchObject({ visibility: 'gm', edited: false })
    expect(calls).toContainEqual({ table: 'ext_character_notes', method: 'eq', args: ['character_id', 'c1'] })
  })

  it('lists posts through the database search, dropping unknown kinds', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [postRow('m1', 'spoke', 't1', { whisper_to: 'u2', sub_channel_id: 'r1' }), postRow('m2', 'weird', 't2')], error: null } as never)
    const posts = await api.listPosts('ch1', 'c1', 'Dr Hale', ['Dr Hale'], '2026-01-01')
    expect(supabase.rpc).toHaveBeenCalledWith('ext_character_posts', {
      p_channel_id: 'ch1', p_character_id: 'c1', p_npc_name: 'Dr Hale', p_terms: ['Dr Hale'], p_before: '2026-01-01', p_limit: api.POSTS_PAGE,
    })
    expect(posts).toEqual([{ id: 'm1', kind: 'spoke', senderId: 'u1', type: 'regular', content: 'post m1', npcName: null, subChannelId: 'r1', whisper: true, createdAt: 't1' }])
  })

  it('reads room names', async () => {
    mockTables({ sub_channels: { data: [{ id: 'r1', name: 'Morgue' }] } })
    expect((await api.listRoomNames('ch1')).get('r1')).toBe('Morgue')
  })

  it('adds, edits and deletes notes through the database functions', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await api.addNote('c1', 'Text', 'author', 5)
    await api.updateNote('n1', 'New', 'everyone', null)
    await api.deleteNote('n1')
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'ext_add_character_note', { p_character_id: 'c1', p_body: 'Text', p_visibility: 'author', p_in_game_day: 5 })
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'ext_update_character_note', { p_note_id: 'n1', p_body: 'New', p_visibility: 'everyone', p_in_game_day: null })
    expect(supabase.rpc).toHaveBeenNthCalledWith(3, 'ext_delete_character_note', { p_note_id: 'n1' })
  })

  it('turns database errors into readable errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'You can only edit your own notes' } } as never)
    await expect(api.updateNote('n1', 'x', 'author', null)).rejects.toThrow('You can only edit your own notes')
    await expect(api.addNote('c1', 'x', 'author', null)).rejects.toThrow('You can only edit your own notes')
    await expect(api.deleteNote('n1')).rejects.toThrow()
    await expect(api.listPosts('ch1', 'c1', null, [])).rejects.toThrow()
    mockTables({ ext_character_notes: { error: { message: 'boom' } }, sub_channels: { error: { message: 'boom' } } })
    await expect(api.listNotes('c1')).rejects.toThrow('boom')
    await expect(api.listRoomNames('ch1')).rejects.toThrow('boom')
  })
})

describe('activityModel', () => {
  const post = (id: string, kind: ActivityPost['kind'], at: string): ActivityPost => ({ id, kind, senderId: 'u1', type: 'regular', content: id, npcName: null, subChannelId: null, whisper: false, createdAt: at })
  const note: ActivityNote = { id: 'n1', authorId: 'u1', authorCharacterName: null, body: 'b', visibility: 'author', inGameDay: null, createdAt: '2026-11-19T10:30:00Z', edited: false }
  const oldNote: ActivityNote = { ...note, id: 'n0', createdAt: '2026-11-01T00:00:00Z' }
  const event: CharacterEvent = { id: 'e1', eventType: 'note', details: {}, note: 'x', visibility: 'gm', actorId: null, createdAt: '2026-11-19T09:30:00Z' }
  const posts = [post('m3', 'mentioned', '2026-11-19T11:00:00Z'), post('m2', 'spoke', '2026-11-19T10:00:00Z'), post('m1', 'posted', '2026-11-19T09:00:00Z')]

  it('merges posts, notes and changes newest first', () => {
    const ids = buildActivity(posts, [note, oldNote], [event], 'all', false).map(e => (e.kind === 'post' ? e.post.id : e.kind === 'note' ? e.note.id : e.event.id))
    expect(ids).toEqual(['m3', 'n1', 'm2', 'e1', 'm1', 'n0'])
  })

  it('holds back older notes and changes while older posts remain', () => {
    const ids = buildActivity(posts, [note, oldNote], [event], 'all', true).map(e => e.at)
    expect(ids).not.toContain(oldNote.createdAt)
    expect(buildActivity([], [oldNote], [], 'all', true)).toHaveLength(1)
  })

  it('filters by kind', () => {
    const kinds = (f: Parameters<typeof buildActivity>[3]) => buildActivity(posts, [note], [event], f, false).map(e => e.kind)
    expect(kinds('posts')).toEqual(['post', 'post'])
    expect(buildActivity(posts, [], [], 'mentions', false).map(e => (e.kind === 'post' ? e.post.id : ''))).toEqual(['m3'])
    expect(kinds('notes')).toEqual(['note'])
    expect(kinds('changes')).toEqual(['change'])
  })

  it('searches aliases for the GM only, skipping very short names', () => {
    const c = { id: 'c1', kind: 'npc', inPlay: true, name: ' Dr Hale ', portraitUrl: null, status: 'active', ownerId: null, isMine: false, updatedAt: 't', aliases: ['The Doctor', 'X', 'Dr Hale'] } as CharacterSummary
    expect(searchTerms(c, true)).toEqual(['Dr Hale', 'The Doctor'])
    expect(searchTerms(c, false)).toEqual(['Dr Hale'])
  })

  it('offers the right note audiences', () => {
    expect(noteChoices(true)).toEqual(['gm', 'everyone'])
    expect(noteChoices(false)).toEqual(['author', 'everyone'])
    expect(isNoteVisibility('author')).toBe(true)
    expect(isNoteVisibility(3)).toBe(false)
  })
})

describe('useCharacterActivity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads posts, notes and rooms, then older posts', async () => {
    mockTables({ ext_character_notes: { data: [noteRow] }, sub_channels: { data: [{ id: 'r1', name: 'Morgue' }] } })
    const full = Array.from({ length: api.POSTS_PAGE }, (_, i) => postRow(`m${i}`, 'mentioned', new Date(Date.UTC(2026, 10, 19, 12, 0, 0) - i * 1000).toISOString()))
    const tagged = { ...noteRow, id: 'tn1', body: 'Saw her at the morgue', about_type: 'record', about_id: 'r9', about_name: 'Morgue', about_kind: 'location' }
    const pages = [full, [postRow('old', 'posted', '2026-01-01T00:00:00Z'), full[0]]]
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) =>
      Promise.resolve(fn === 'ext_tagged_notes' ? { data: [tagged, noteRow], error: null } : { data: pages.shift(), error: null })) as never)
    const { result } = renderHook(() => useCharacterActivity('ch1', 'c1', 'Okafor', ['Okafor']))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.posts).toHaveLength(api.POSTS_PAGE)
    expect(result.current.morePosts).toBe(true)
    expect(result.current.notes[0].body).toBe('Has a limp')
    // Notes from elsewhere come after the subject's own, without repeats.
    expect(result.current.notes).toHaveLength(2)
    expect(result.current.notes[1]).toMatchObject({ id: 'tn1', about: { type: 'record', id: 'r9', name: 'Morgue', kind: 'location' } })
    expect(supabase.rpc).toHaveBeenCalledWith('ext_tagged_notes', { p_channel_id: 'ch1', p_character_id: 'c1' })
    expect(result.current.rooms.get('r1')).toBe('Morgue')
    await act(() => result.current.loadOlder())
    expect(result.current.posts).toHaveLength(api.POSTS_PAGE + 1)
    expect(result.current.morePosts).toBe(false)
    expect(vi.mocked(supabase.rpc).mock.calls.filter(c => c[0] === 'ext_character_posts')[1][1]).toMatchObject({ p_before: full.at(-1)?.created_at })
  })

  it('reports load errors and recovers on reload', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockTables({})
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'down' } } as never).mockResolvedValue({ data: [], error: null } as never)
    const { result } = renderHook(() => useCharacterActivity('ch1', 'c1', null, []))
    await waitFor(() => expect(result.current.error?.message).toBe('down'))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.morePosts).toBe(false)
    await act(() => result.current.loadOlder())
    spy.mockRestore()
  })

  it('reports a failed "load older"', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockTables({})
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [postRow('m1', 'spoke', 't')], error: null } as never).mockResolvedValueOnce({ data: null, error: { message: 'older failed' } } as never)
    const { result } = renderHook(() => useCharacterActivity('ch1', 'c1', null, ['x']))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.loadOlder())
    expect(result.current.error?.message).toBe('older failed')
    expect(result.current.loadingOlder).toBe(false)
    spy.mockRestore()
  })
})
