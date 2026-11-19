import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { PostAuthorshipContext } from '../authorship/authorshipContext'
import type { CharacterEvent, CharacterSummary } from '../characters/characterModel'
import * as api from './activityApi'
import { CharacterActivity } from './CharacterActivity'
import type { ActivityNote, ActivityPost } from './activityModel'
import { OpenPostContext } from './openPostContext'
import { useCharacterActivity } from './useCharacterActivity'

vi.mock('./useCharacterActivity', () => ({ useCharacterActivity: vi.fn() }))
vi.mock('./activityApi', () => ({
  POSTS_PAGE: 50,
  addNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}))
// Campaign date: Tue 14 Oct 1997 (day 10148) from the start.
vi.mock('../calendar/calendarContext', () => ({
  useCalendar: () => ({
    changes: [{ id: 'k1', subChannelId: null, kind: 'set', dayNumber: 10148, shiftAmount: null, shiftUnit: null, createdAt: '2026-01-01T00:00:00Z' }],
    reload: () => {},
  }),
}))

const hale: CharacterSummary = { id: 'c1', kind: 'npc', inPlay: true, name: 'Dr Hale', portraitUrl: null, status: 'active', ownerId: null, isMine: false, updatedAt: 't', aliases: ['The Doctor'] }

const posts: ActivityPost[] = [
  { id: 'm2', kind: 'mentioned', senderId: 'u1', type: 'regular', content: 'I ask Dr Hale about the body. ' + 'x'.repeat(300), npcName: null, subChannelId: 'r1', whisper: true, createdAt: '2026-11-19T12:00:00Z' },
  { id: 'm1', kind: 'spoke', senderId: 'gm', type: 'npc', content: 'The body was moved.', npcName: 'Dr Hale', subChannelId: null, whisper: false, createdAt: '2026-11-19T10:00:00Z' },
]
const notes: ActivityNote[] = [
  { id: 'n1', authorId: 'u1', authorCharacterName: 'Agent Reyes', body: 'Has a limp', visibility: 'everyone', inGameDay: 10150, createdAt: '2026-11-19T11:00:00Z', edited: true },
  { id: 'n2', authorId: 'gm', authorCharacterName: null, body: 'Cult leader', visibility: 'gm', inGameDay: null, createdAt: '2026-11-19T09:00:00Z', edited: false },
]
const events: CharacterEvent[] = [{ id: 'e1', eventType: 'status_changed', details: { from: 'active', to: 'missing' }, note: null, visibility: 'players', actorId: 'gm', createdAt: '2026-11-19T08:00:00Z' }]

const reload = vi.fn()
const loadOlder = vi.fn()
const nameOf = (id: string) => (id === 'u1' ? 'Sam' : 'GM')

function mockActivity(overrides: Partial<ReturnType<typeof useCharacterActivity>> = {}) {
  vi.mocked(useCharacterActivity).mockReturnValue({
    posts, notes, rooms: new Map([['r1', 'Morgue']]), morePosts: false, loading: false, loadingOlder: false, error: null, reload, loadOlder, ...overrides,
  })
}

function setup(props: Partial<React.ComponentProps<typeof CharacterActivity>> = {}, openPost: ((id: string, sub: string | null) => void) | null = null) {
  const all = { channelId: 'ch1', character: hale, isGM: true, isArchived: false, myUserId: 'gm', events, nameOf, ...props }
  render(
    <ToastProvider>
      <PostAuthorshipContext.Provider value={(userId) => (userId === 'u1' ? { characterId: 'r', name: 'Agent Reyes', portraitUrl: null } : null)}>
        <OpenPostContext.Provider value={openPost}>
          <CharacterActivity {...all} />
        </OpenPostContext.Provider>
      </PostAuthorshipContext.Provider>
    </ToastProvider>,
  )
  return all
}

describe('CharacterActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.addNote).mockResolvedValue(undefined)
    vi.mocked(api.updateNote).mockResolvedValue(undefined)
    vi.mocked(api.deleteNote).mockResolvedValue(undefined)
    mockActivity()
  })

  it('lists posts, notes and changes newest first with real and in-game dates', () => {
    setup()
    const items = within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items[0]).toHaveTextContent('Mentioned by Agent Reyes in Morgue')
    expect(items[0]).toHaveTextContent('Whisper')
    expect(items[0]).toHaveTextContent('In game: Tue 14 Oct 1997')
    expect(items[1]).toHaveTextContent('Note by Sam (as Agent Reyes)')
    expect(items[1]).toHaveTextContent('In game: Thu 16 Oct 1997')
    expect(items[1]).toHaveTextContent('(edited)')
    expect(items[2]).toHaveTextContent('Dr Hale spoke in Main')
    expect(items[3]).toHaveTextContent('Note by GM')
    expect(items[4]).toHaveTextContent('Status')
  })

  it('searches aliases for the GM only', () => {
    setup()
    expect(vi.mocked(useCharacterActivity).mock.calls[0]).toEqual(['ch1', 'c1', 'Dr Hale', ['Dr Hale', 'The Doctor']])
    vi.clearAllMocks()
    mockActivity()
    setup({ isGM: false, myUserId: 'u1' })
    expect(vi.mocked(useCharacterActivity).mock.calls[0]).toEqual(['ch1', 'c1', 'Dr Hale', ['Dr Hale']])
  })

  it('filters entries', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Mentions' }))
    expect(within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    expect(within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }))
    expect(within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Posts' }))
    expect(screen.getByRole('button', { name: 'Posts' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('expands long posts and goes to a post', () => {
    const openPost = vi.fn()
    setup({}, openPost)
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Go to post' })[0])
    expect(openPost).toHaveBeenCalledWith('m2', 'r1')
  })

  it('hides "Go to post" without a chat to jump to', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Go to post' })).not.toBeInTheDocument()
  })

  it('adds a GM note with the campaign date as default', async () => {
    setup()
    expect(screen.getByLabelText('In-game date')).toHaveValue('1997-10-14')
    const options = [...screen.getByLabelText('Who can see it').querySelectorAll('option')].map(o => o.textContent)
    expect(options).toEqual(['GM only', 'Everyone'])
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('New note'), { target: { value: ' Seen at the docks ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(api.addNote).toHaveBeenCalledWith('c1', 'Seen at the docks', 'gm', 10148))
    expect(await screen.findByText('Note added.')).toBeInTheDocument()
    expect(reload).toHaveBeenCalled()
    expect(screen.getByLabelText('New note')).toHaveValue('')
  })

  it('lets a player write for themselves and the GM, without a date or with a valid one', async () => {
    setup({ isGM: false, myUserId: 'u1' })
    const options = [...screen.getByLabelText('Who can see it').querySelectorAll('option')].map(o => o.textContent)
    expect(options).toEqual(['Me and the GM', 'Everyone'])
    fireEvent.change(screen.getByLabelText('New note'), { target: { value: 'Nervous' } })
    fireEvent.change(screen.getByLabelText('In-game date'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(api.addNote).toHaveBeenCalledWith('c1', 'Nervous', 'author', null))
  })

  it('reports a failed note and keeps the text', async () => {
    vi.mocked(api.addNote).mockRejectedValue(new Error('A note must be 1 to 2000 characters'))
    setup()
    fireEvent.change(screen.getByLabelText('New note'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('A note must be 1 to 2000 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('New note')).toHaveValue('x')
  })

  it('edits your own note', async () => {
    setup({ isGM: false, myUserId: 'u1' })
    const mine = within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')[1]
    fireEvent.click(within(mine).getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('In-game date', { selector: '[aria-label="Edit note"] input' })).toHaveValue('1997-10-16')
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'Has a bad limp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateNote).toHaveBeenCalledWith('n1', 'Has a bad limp', 'everyone', 10150))
    await waitFor(() => expect(screen.queryByLabelText('Note text')).not.toBeInTheDocument())
  })

  it('cancels an edit', () => {
    setup({ myUserId: 'u1', isGM: false })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Note text')).not.toBeInTheDocument()
  })

  it('lets the GM delete any note after confirming, and reports failures', async () => {
    setup()
    const playerNote = within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')[1]
    expect(within(playerNote).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    fireEvent.click(within(playerNote).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(playerNote).getByRole('button', { name: 'Keep' }))
    fireEvent.click(within(playerNote).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(playerNote).getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(api.deleteNote).toHaveBeenCalledWith('n1'))
    expect(await screen.findByText('Note deleted.')).toBeInTheDocument()
    vi.mocked(api.deleteNote).mockRejectedValue(new Error('This campaign is archived'))
    fireEvent.click(within(playerNote).getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByText('This campaign is archived')).toBeInTheDocument()
  })

  it('shows other players no edit or delete, and nothing to change in archived campaigns', () => {
    setup({ isGM: false, myUserId: 'u2' })
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('New note')).toBeInTheDocument()
  })

  it('hides the note form in archived campaigns', () => {
    setup({ isArchived: true })
    expect(screen.queryByLabelText('New note')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('loads older posts', () => {
    mockActivity({ morePosts: true })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Load older posts' }))
    expect(loadOlder).toHaveBeenCalled()
    mockActivity({ morePosts: true, loadingOlder: true })
  })

  it('shows loading, empty and error states', () => {
    mockActivity({ loading: true, posts: [], notes: [] })
    const { unmount } = render(<ToastProvider><CharacterActivity channelId="ch1" character={hale} isGM isArchived={false} myUserId="gm" events={[]} nameOf={nameOf} /></ToastProvider>)
    expect(screen.getByLabelText('Loading activity')).toBeInTheDocument()
    unmount()
    mockActivity({ posts: [], notes: [], error: new Error('x') })
    render(<ToastProvider><CharacterActivity channelId="ch1" character={hale} isGM isArchived={false} myUserId="gm" events={[]} nameOf={nameOf} /></ToastProvider>)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    expect(screen.getByText('No notes yet.')).toBeInTheDocument()
  })
})
