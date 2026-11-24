// cspell:words unlinkify
// @tags in Activity notes: typing `@` offers NPCs and records, saving turns them into tags,
// notes show them as chips, and editing turns them back into `@Name`.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import * as activityApi from '../activity/activityApi'
import { CharacterActivity } from '../activity/CharacterActivity'
import type { ActivityNote } from '../activity/activityModel'
import { useCharacterActivity } from '../activity/useCharacterActivity'
import type { CharacterSummary } from '../characters/characterModel'
import { fetchNpcLabels, listAliasTags, listTaggableNpcs, listTaggableRecords } from './npcTagApi'
import { NpcTagProvider } from './npcTagContext'
import { tagQueryBefore, unlinkifyNpcTags } from './npcTagModel'

vi.mock('../activity/useCharacterActivity', () => ({ useCharacterActivity: vi.fn() }))
vi.mock('../activity/activityApi', () => ({ POSTS_PAGE: 50, addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }))
vi.mock('../calendar/calendarContext', () => ({ useCalendar: () => ({ changes: [], reload: () => {} }) }))
vi.mock('./npcTagApi', () => ({
  listTaggableNpcs: vi.fn(),
  listTaggableRecords: vi.fn(),
  fetchNpcLabels: vi.fn(),
  listAliasTags: vi.fn(),
  aliasTagId: vi.fn(),
}))

const HALE = '00000000-0000-0000-0000-00000000a001'
const MORGUE = '00000000-0000-0000-0000-00000000c001'
const reyes: CharacterSummary = { id: 'c2', kind: 'pc', inPlay: true, name: 'Agent Reyes', portraitUrl: null, status: 'active', ownerId: 'gm', isMine: true, updatedAt: 't', aliases: [] }
const tagged: ActivityNote = {
  id: 'n1', authorId: 'gm', authorCharacterName: null, body: `Saw [Dr Hale](npc:${HALE}) leave.`, visibility: 'gm', inGameDay: null, createdAt: '2026-11-19T11:00:00Z', edited: false,
}

function mockNotes(notes: ActivityNote[]) {
  vi.mocked(useCharacterActivity).mockReturnValue({
    posts: [], notes, rooms: new Map(), morePosts: false, loading: false, loadingOlder: false, error: null, reload: vi.fn(), loadOlder: vi.fn(),
  })
}

function setup() {
  render(
    <ToastProvider>
      <NpcTagProvider channelId="ch1" isGM myUserId="gm">
        <CharacterActivity channelId="ch1" character={reyes} isGM isArchived={false} myUserId="gm" events={[]} nameOf={() => 'GM'} />
      </NpcTagProvider>
    </ToastProvider>,
  )
}

describe('tags in notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listTaggableNpcs).mockResolvedValue([{ id: HALE, name: 'Dr Hale', portraitUrl: null, aliases: [] }])
    vi.mocked(listTaggableRecords).mockResolvedValue([{ id: MORGUE, name: 'Morgue', portraitUrl: null, recordKind: 'location' }])
    vi.mocked(listAliasTags).mockResolvedValue([])
    vi.mocked(fetchNpcLabels).mockResolvedValue([])
    vi.mocked(activityApi.addNote).mockResolvedValue(undefined)
    vi.mocked(activityApi.updateNote).mockResolvedValue(undefined)
    mockNotes([])
  })

  it('offers NPCs and records after @ and saves them as tags', async () => {
    setup()
    const box = screen.getByLabelText('New note') as HTMLTextAreaElement
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tag an NPC or record' })).toBeInTheDocument())

    fireEvent.change(box, { target: { value: 'Met @dr', selectionStart: 7 } })
    const list = screen.getByRole('listbox', { name: 'NPCs and records to tag' })
    expect(within(list).getAllByRole('option').map(o => o.textContent)).toEqual(['DDr HaleNPC']) // portrait initial, name, kind
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.value).toBe('Met @Dr Hale ')
    expect(screen.queryByRole('listbox', { name: 'NPCs and records to tag' })).not.toBeInTheDocument()

    fireEvent.change(box, { target: { value: 'Met @Dr Hale at @m', selectionStart: 18 } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /Morgue/ }))
    expect(box.value).toBe('Met @Dr Hale at @Morgue ')

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() =>
      expect(activityApi.addNote).toHaveBeenCalledWith('c2', `Met [Dr Hale](npc:${HALE}) at [Morgue](rec:${MORGUE})`, 'gm', null),
    )
  })

  it('moves through the list with the arrow keys and closes it with Escape', async () => {
    vi.mocked(listTaggableNpcs).mockResolvedValue([
      { id: HALE, name: 'Dr Hale', portraitUrl: null, aliases: [] },
      { id: '00000000-0000-0000-0000-00000000a002', name: 'Dr Moss', portraitUrl: null, aliases: [] },
    ])
    setup()
    const box = screen.getByLabelText('New note') as HTMLTextAreaElement
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tag an NPC or record' })).toBeInTheDocument())
    fireEvent.change(box, { target: { value: '@Dr', selectionStart: 3 } })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Dr Moss/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(box, { key: 'ArrowUp' })
    expect(screen.getByRole('option', { name: /Dr Hale/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: 'NPCs and records to tag' })).not.toBeInTheDocument()
  })

  it('inserts a tag from the tag button', async () => {
    setup()
    const box = screen.getByLabelText('New note') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Ask', selectionStart: 3 } })
    fireEvent.click(await screen.findByRole('button', { name: 'Tag an NPC or record' }))
    fireEvent.click(screen.getByRole('option', { name: /Dr Hale/ }))
    expect(box.value).toBe('Ask @Dr Hale ')
  })

  it('shows tags in notes as chips and edits them as @Name', async () => {
    mockNotes([tagged])
    setup()
    expect(await screen.findByRole('button', { name: /Dr Hale/ })).toBeInTheDocument()
    expect(screen.getByTestId('activity-note-body')).toHaveTextContent(/^Saw D?Dr Hale leave.$/)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const box = screen.getByLabelText('Note text') as HTMLTextAreaElement
    expect(box.value).toBe('Saw @Dr Hale leave.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(activityApi.updateNote).toHaveBeenCalledWith('n1', `Saw [Dr Hale](npc:${HALE}) leave.`, 'gm', null))
  })

  it('refuses a note that grows too long once its tags are added', async () => {
    setup()
    const box = screen.getByLabelText('New note') as HTMLTextAreaElement
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tag an NPC or record' })).toBeInTheDocument())
    fireEvent.change(box, { target: { value: `@Dr Hale ${'x'.repeat(1985)}`, selectionStart: 0 } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('This note is too long once its tags are added. Shorten it a little.')).toBeInTheDocument()
    expect(activityApi.addNote).not.toHaveBeenCalled()
  })
})

describe('note tag helpers', () => {
  it('turns tags back into @Name and leaves other links alone', () => {
    expect(unlinkifyNpcTags(`[Dr Hale](npc:${HALE}), [Morgue](rec:${MORGUE}) and [site](https://example.test)`)).toBe(
      '@Dr Hale, @Morgue and [site](https://example.test)',
    )
    expect(unlinkifyNpcTags('[Bad](npc:00000000-0000-0000-0000-zzzzzzzzzzzz)')).toBe('[Bad](npc:00000000-0000-0000-0000-zzzzzzzzzzzz)')
  })

  it.each([
    ['@', ''],
    ['Met @Dr H', 'Dr H'],
    ['email me@home', null],
    ['@Dr Hale.', null],
    ['@Dr  ', null],
    ['no tag', null],
    ['line\n@Mo', 'Mo'],
  ])('reads the tag being typed in %j', (text, query) => {
    expect(tagQueryBefore(text)).toBe(query)
  })
})
