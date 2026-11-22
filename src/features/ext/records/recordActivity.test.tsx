import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import * as characterApi from '../characters/characterApi'
import * as api from './recordApi'
import * as activityApi from './recordActivityApi'
import { NpcTagProvider } from '../npcTags/npcTagContext'
import { listTaggableRecords } from '../npcTags/npcTagApi'
import { CaseFileEntry } from './CaseFileEntry'
import { RecordActivity } from './RecordActivity'
import { requestRecord } from './recordOpener'
import type { CampaignRecord } from './recordModel'

vi.mock('../npcTags/npcTagApi', () => ({
  listTaggableNpcs: vi.fn(async () => []),
  listTaggableRecords: vi.fn(async () => []),
  fetchNpcLabels: vi.fn(async () => []),
  listAliasTags: vi.fn(async () => []),
  aliasTagId: vi.fn(),
}))
vi.mock('../authorship/authorshipContext', () => ({ useAuthorLookup: () => () => null }))

vi.mock('./recordApi', () => ({
  listRecords: vi.fn(),
  listRecordFields: vi.fn(async () => []),
  listRecordEvents: vi.fn(async () => []),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  setRecordVisibility: vi.fn(),
  saveRecordFields: vi.fn(),
  setRecordTags: vi.fn(),
}))
vi.mock('./recordActivityApi', () => ({
  listRecordAliases: vi.fn(),
  setRecordAliases: vi.fn(),
  listRecordPosts: vi.fn(),
  listRecordNotes: vi.fn(),
  addRecordNote: vi.fn(),
  updateRecordNote: vi.fn(),
  deleteRecordNote: vi.fn(),
}))
vi.mock('../activity/activityApi', () => ({ POSTS_PAGE: 50, listRoomNames: vi.fn(async () => new Map([['room1', 'Morgue scene']])) }))
vi.mock('../characters/characterApi', () => ({ listTags: vi.fn(async () => []), createTag: vi.fn() }))
vi.mock('../../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadEnabled: false, settingsLoading: false, uploading: false, uploadImage: vi.fn() }),
}))

const morgue: CampaignRecord = {
  id: 'r1', kind: 'location', name: 'Morgue', pictureUrl: null, provenance: 'canon',
  visibility: 'players', updatedAt: 't', tagIds: [], sharedWith: [],
}
const glove: CampaignRecord = { ...morgue, id: 'r2', kind: 'clue', name: 'Bloody glove' }
const nameOf = (id: string) => ({ gm: 'You', u1: 'Sam' })[id] ?? id

function renderActivity(props: Partial<React.ComponentProps<typeof RecordActivity>> = {}) {
  const all = {
    channelId: 'ch', record: morgue, aliases: ['The Slab'], isGM: true, isArchived: false, myUserId: 'gm',
    events: [{ id: 'e1', eventType: 'renamed', details: { from: 'Old', to: 'Morgue' }, actorId: 'gm', createdAt: '2026-11-20T10:00:00Z' }],
    nameOf, ...props,
  }
  render(
    <ToastProvider>
      <RecordActivity {...all} />
    </ToastProvider>,
  )
  return all
}

describe('RecordActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(activityApi.listRecordPosts).mockResolvedValue([
      { id: 'p1', kind: 'mentioned', senderId: 'u1', type: 'regular', content: 'Back to the **morgue**.', npcName: null, subChannelId: 'room1', whisper: false, createdAt: '2026-11-22T10:00:00Z' },
    ])
    vi.mocked(activityApi.listRecordNotes).mockResolvedValue([
      { id: 'n1', authorId: 'u1', authorCharacterName: 'Agent Reyes', body: 'Back door unlocked', visibility: 'everyone', inGameDay: null, createdAt: '2026-11-21T10:00:00Z', edited: false },
    ])
    for (const fn of [activityApi.addRecordNote, activityApi.updateRecordNote, activityApi.deleteRecordNote]) vi.mocked(fn).mockResolvedValue(undefined)
  })

  it('lists mentions, notes and history, and searches the aliases for the GM', async () => {
    renderActivity()
    expect(await screen.findByText(/Mentioned by Sam in Morgue scene/)).toBeInTheDocument()
    expect(screen.getByText('Back door unlocked')).toBeInTheDocument()
    expect(screen.getByText('Renamed from "Old" to "Morgue".')).toBeInTheDocument()
    expect(activityApi.listRecordPosts).toHaveBeenCalledWith('ch', 'r1', ['Morgue', 'The Slab'], null)
    const filters = within(screen.getByRole('group', { name: 'Show' })).getAllByRole('button').map(b => b.textContent)
    expect(filters).toEqual(['All', 'Mentions', 'Notes', 'Changes'])
  })

  it('never searches aliases for players', async () => {
    renderActivity({ isGM: false, myUserId: 'u1', events: [] })
    await screen.findByText(/Mentioned by Sam/)
    expect(activityApi.listRecordPosts).toHaveBeenCalledWith('ch', 'r1', ['Morgue'], null)
  })

  it('adds, edits and deletes notes on the record', async () => {
    renderActivity({ isGM: false, myUserId: 'u1', events: [] })
    fireEvent.change(await screen.findByLabelText('New note'), { target: { value: 'Smells of bleach' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(activityApi.addRecordNote).toHaveBeenCalledWith('r1', 'Smells of bleach', 'author', null))

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'Back door locked now' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(activityApi.updateRecordNote).toHaveBeenCalledWith('n1', 'Back door locked now', 'everyone', null))

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(activityApi.deleteRecordNote).toHaveBeenCalledWith('n1'))
  })

  it('loads older posts', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`, kind: 'mentioned' as const, senderId: 'u1', type: 'regular', content: `Morgue ${i}`, npcName: null,
      subChannelId: null, whisper: false, createdAt: new Date(Date.UTC(2026, 10, 22, 10, 59 - i)).toISOString(),
    }))
    vi.mocked(activityApi.listRecordPosts).mockResolvedValueOnce(page).mockResolvedValueOnce([])
    renderActivity({ events: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Load older posts' }))
    await waitFor(() => expect(activityApi.listRecordPosts).toHaveBeenLastCalledWith('ch', 'r1', ['Morgue', 'The Slab'], page[49].createdAt))
  })
})

describe('Record aliases and opening records', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listRecords).mockResolvedValue([morgue, glove])
    vi.mocked(api.listRecordFields).mockResolvedValue([])
    vi.mocked(api.listRecordEvents).mockResolvedValue([])
    vi.mocked(activityApi.listRecordAliases).mockResolvedValue(['The Slab'])
    vi.mocked(activityApi.setRecordAliases).mockResolvedValue(undefined)
    vi.mocked(activityApi.listRecordPosts).mockResolvedValue([])
    vi.mocked(activityApi.listRecordNotes).mockResolvedValue([])
    vi.mocked(characterApi.listTags).mockResolvedValue([])
  })

  function Entry() {
    return (
      <ToastProvider>
        <CaseFileEntry channelId="ch" isGM isArchived={false} gmId="gm" myUserId="gm" members={[]} className="" />
      </ToastProvider>
    )
  }

  it('opens on a record asked for from the chat, and saves its aliases', async () => {
    render(<Entry />)
    act(() => requestRecord('r1'))
    expect(await screen.findByRole('heading', { name: 'Morgue' })).toBeInTheDocument()
    const box = await screen.findByLabelText('Aliases (GM only)')
    expect(box).toHaveValue('The Slab')
    fireEvent.change(box, { target: { value: Array.from({ length: 11 }, (_, i) => `a${i}`).join(', ') } })
    expect(screen.getByText('At most 10 aliases.')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'x'.repeat(41) } })
    expect(screen.getByText('Aliases can be at most 40 characters.')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: ' The Slab ,  Cold Room ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save aliases' }))
    await waitFor(() => expect(activityApi.setRecordAliases).toHaveBeenCalledWith('r1', ['The Slab', 'Cold Room']))
    expect(await screen.findByText('Aliases saved.')).toBeInTheDocument()
  })

  it('switches the open panel when a record tag in its Activity is clicked, and reloads tags on close', async () => {
    const MORGUE = '00000000-0000-0000-0000-00000000c001'
    const GLOVE = '00000000-0000-0000-0000-00000000c002'
    vi.mocked(api.listRecords).mockResolvedValue([{ ...morgue, id: MORGUE }, { ...glove, id: GLOVE }])
    vi.mocked(listTaggableRecords).mockResolvedValue([
      { id: MORGUE, name: 'Morgue', portraitUrl: null, recordKind: 'location' },
      { id: GLOVE, name: 'Bloody glove', portraitUrl: null, recordKind: 'clue' },
    ])
    vi.mocked(activityApi.listRecordPosts).mockResolvedValue([
      { id: 'p1', kind: 'mentioned', senderId: 'u1', type: 'regular', content: `Found a [Bloody glove](rec:${GLOVE}) here.`, npcName: null, subChannelId: null, whisper: false, createdAt: '2026-11-22T10:00:00Z' },
    ])
    render(
      <NpcTagProvider channelId="ch" isGM myUserId="gm">
        <Entry />
      </NpcTagProvider>,
    )
    await waitFor(() => expect(listTaggableRecords).toHaveBeenCalledTimes(1))
    act(() => requestRecord(MORGUE))
    fireEvent.click(await screen.findByRole('tab', { name: 'Activity' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Bloody glove' }))
    expect(await screen.findByRole('heading', { name: 'Bloody glove' })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close case file' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(listTaggableRecords).toHaveBeenCalledTimes(2))
  })
})
