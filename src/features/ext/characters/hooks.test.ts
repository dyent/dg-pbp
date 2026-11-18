import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as api from './characterApi'
import { useCharacterList } from './useCharacterList'
import { useCharacterProfile } from './useCharacterProfile'
import { useCharacterActions } from './useCharacterActions'

vi.mock('./characterApi', () => ({
  listCharacters: vi.fn(),
  listTags: vi.fn(),
  listFields: vi.fn(),
  listEvents: vi.fn(),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  updateMyCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  setRole: vi.fn(),
  setMyStatus: vi.fn(),
  postAs: vi.fn(),
  saveFields: vi.fn(),
  addNote: vi.fn(),
  createTag: vi.fn(),
  setCharacterTags: vi.fn(),
}))

const character = { id: 'c1', kind: 'pc', inPlay: true, name: 'Reyes', portraitUrl: null, status: 'active', ownerId: null, isMine: false, updatedAt: 't' } as const

describe('useCharacterList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads characters and, for the GM, tags', async () => {
    vi.mocked(api.listCharacters).mockResolvedValue([character])
    vi.mocked(api.listTags).mockResolvedValue([{ id: 't1', name: 'Witness' }])
    const { result } = renderHook(() => useCharacterList('ch1', true, 'gm'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.characters).toEqual([character])
    expect(result.current.tags).toEqual([{ id: 't1', name: 'Witness' }])
    expect(api.listCharacters).toHaveBeenCalledWith('ch1', true, 'gm')
  })

  it('does not ask for tags as a player, and reloads on demand', async () => {
    vi.mocked(api.listCharacters).mockResolvedValue([])
    const { result } = renderHook(() => useCharacterList('ch1', false, 'u1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(api.listTags).not.toHaveBeenCalled()
    act(() => result.current.reload())
    await waitFor(() => expect(api.listCharacters).toHaveBeenCalledTimes(2))
  })

  it('reports load errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.listCharacters).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useCharacterList('ch1', false, 'u1'))
    await waitFor(() => expect(result.current.error?.message).toBe('boom'))
    expect(result.current.loading).toBe(false)
    spy.mockRestore()
  })

  it('ignores results that arrive after unmount', async () => {
    let resolve: (v: never[]) => void = () => {}
    vi.mocked(api.listCharacters).mockReturnValue(new Promise(r => { resolve = r }))
    const { result, unmount } = renderHook(() => useCharacterList('ch1', false, 'u1'))
    unmount()
    resolve([])
    await Promise.resolve()
    expect(result.current.loading).toBe(true)
  })

  it('ignores errors that arrive after unmount', async () => {
    let reject: (e: Error) => void = () => {}
    vi.mocked(api.listCharacters).mockReturnValue(new Promise((_, r) => { reject = r }))
    const { result, unmount } = renderHook(() => useCharacterList('ch1', false, 'u1'))
    unmount()
    reject(new Error('late'))
    await Promise.resolve()
    expect(result.current.error).toBeNull()
  })
})

describe('useCharacterProfile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads fields and history for a character', async () => {
    vi.mocked(api.listFields).mockResolvedValue([])
    vi.mocked(api.listEvents).mockResolvedValue([])
    const { result } = renderHook(() => useCharacterProfile('c1'))
    await waitFor(() => expect(api.listEvents).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.reload())
    await waitFor(() => expect(api.listFields).toHaveBeenCalledTimes(2))
  })

  it('does nothing without a character', () => {
    const { result } = renderHook(() => useCharacterProfile(null))
    expect(result.current.fields).toEqual([])
    expect(api.listFields).not.toHaveBeenCalled()
  })

  it('reports load errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.listFields).mockRejectedValue(new Error('denied'))
    vi.mocked(api.listEvents).mockResolvedValue([])
    const { result } = renderHook(() => useCharacterProfile('c1'))
    await waitFor(() => expect(result.current.error?.message).toBe('denied'))
    spy.mockRestore()
  })

  it('ignores late results and errors after unmount', async () => {
    let resolve: (v: never[]) => void = () => {}
    vi.mocked(api.listFields).mockReturnValue(new Promise(r => { resolve = r }))
    vi.mocked(api.listEvents).mockResolvedValue([])
    const first = renderHook(() => useCharacterProfile('c1'))
    first.unmount()
    resolve([])

    let reject: (e: Error) => void = () => {}
    vi.mocked(api.listFields).mockReturnValue(new Promise((_, r) => { reject = r }))
    const second = renderHook(() => useCharacterProfile('c2'))
    second.unmount()
    reject(new Error('late'))
    await Promise.resolve()
    expect(second.result.current.error).toBeNull()
  })
})

describe('useCharacterActions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('binds campaign and user to the writes that need them', async () => {
    const { result } = renderHook(() => useCharacterActions('ch1', 'gm'))
    await result.current.create('npc', 'Hale')
    expect(api.createCharacter).toHaveBeenCalledWith('ch1', 'npc', 'Hale', 'gm')
    await result.current.saveFields('c1', { deletes: [], updates: [], inserts: [] })
    expect(api.saveFields).toHaveBeenCalledWith('c1', 'ch1', { deletes: [], updates: [], inserts: [] })
    await result.current.addNote('c1', 'note')
    expect(api.addNote).toHaveBeenCalledWith('c1', 'ch1', 'note', 'gm')
    await result.current.createTag('Witness')
    expect(api.createTag).toHaveBeenCalledWith('ch1', 'Witness')
    expect(result.current.postAs).toBe(api.postAs)
  })

  it('refuses user-bound writes when signed out', () => {
    const { result } = renderHook(() => useCharacterActions('ch1', undefined))
    expect(() => result.current.create('pc', 'X')).toThrow(/signed in/)
    expect(() => result.current.addNote('c1', 'x')).toThrow(/signed in/)
  })
})
