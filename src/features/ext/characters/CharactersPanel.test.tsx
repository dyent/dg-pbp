import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { CharactersPanel } from './CharactersPanel'
import { CharactersEntry } from './CharactersEntry'
import { useCharacterList } from './useCharacterList'
import { useCharacterActions } from './useCharacterActions'
import type { CharacterSummary } from './characterModel'

vi.mock('./useCharacterList', () => ({ useCharacterList: vi.fn() }))
vi.mock('./useCharacterActions', () => ({ useCharacterActions: vi.fn() }))
// The profile and switcher have their own tests; stub them to keep this about the shell.
vi.mock('./CharacterProfile', () => ({
  CharacterProfile: ({ character, onEditingChange, onDeleted, nameOf, players }: { character: CharacterSummary; onEditingChange: (e: boolean) => void; onDeleted: () => void; nameOf: (id: string) => string; players: { name: string }[] }) => (
    <div data-testid="profile">
      Profile of {character.name} owned by {character.ownerId ? nameOf(character.ownerId) : 'nobody'}
      <span data-testid="names">{['gm', 'u3', 'zzz'].map(nameOf).join('|')}</span>
      <span data-testid="players">{players.map(p => p.name).join('|')}</span>
      <button type="button" onClick={() => onEditingChange(true)}>Start editing</button>
      <button type="button" onClick={() => onEditingChange(false)}>Stop editing</button>
      <button type="button" onClick={onDeleted}>Deleted</button>
    </div>
  ),
}))
vi.mock('./PostingAsSwitcher', () => ({
  PostingAsSwitcher: ({ onSwitch }: { onSwitch: (id: string) => Promise<void> }) => (
    <button type="button" onClick={() => void onSwitch('c1')}>Switch stub</button>
  ),
}))

const reyes: CharacterSummary = { id: 'c1', kind: 'pc', inPlay: true, name: 'Agent Reyes', portraitUrl: null, status: 'active', ownerId: 'u1', isMine: false, updatedAt: 't' }

const reload = vi.fn()
const actions = { create: vi.fn(), postAs: vi.fn().mockResolvedValue(undefined) }

function mockList(overrides: Partial<ReturnType<typeof useCharacterList>> = {}) {
  vi.mocked(useCharacterList).mockReturnValue({ characters: [reyes], tags: [], loading: false, error: null, reload, ...overrides })
}

function renderPanel(props: Partial<React.ComponentProps<typeof CharactersPanel>> = {}) {
  const all = { channelId: 'ch1', isGM: true, isArchived: false, myUserId: 'gm', players: [], nameOf: (id: string) => `name:${id}`, onClose: vi.fn(), ...props }
  render(
    <ToastProvider>
      <CharactersPanel {...all} />
    </ToastProvider>,
  )
  return all
}

describe('CharactersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCharacterActions).mockReturnValue(actions as never)
    mockList()
  })

  it('opens a profile from the list and goes back on small screens', () => {
    renderPanel()
    expect(screen.getByText('Choose a character to see their profile.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Agent Reyes'))
    expect(screen.getByTestId('profile')).toHaveTextContent('Profile of Agent Reyes owned by name:u1')
    fireEvent.click(screen.getByRole('button', { name: '← List' }))
    expect(screen.queryByTestId('profile')).not.toBeInTheDocument()
  })

  it('creates a character, then selects it', async () => {
    actions.create.mockResolvedValue('c1')
    renderPanel()
    fireEvent.change(screen.getByLabelText('New PC name'), { target: { value: 'Agent Reyes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(actions.create).toHaveBeenCalledWith('pc', 'Agent Reyes'))
    expect(await screen.findByText('Agent Reyes added.')).toBeInTheDocument()
    expect(reload).toHaveBeenCalled()
    expect(screen.getByTestId('profile')).toBeInTheDocument()
  })

  it('reports a failed create', async () => {
    actions.create.mockRejectedValue(new Error('Name taken'))
    renderPanel()
    fireEvent.change(screen.getByLabelText('New PC name'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Name taken')).toBeInTheDocument()
  })

  it('reports an unexpected create error generically', async () => {
    actions.create.mockRejectedValue('weird')
    renderPanel()
    fireEvent.change(screen.getByLabelText('New PC name'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Could not add the character.')).toBeInTheDocument()
  })

  it('switches posting character and reloads', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Switch stub' }))
    await waitFor(() => expect(actions.postAs).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it('closes with the button or Escape, but not while editing', () => {
    const props = renderPanel()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Agent Reyes'))
    fireEvent.click(screen.getByRole('button', { name: 'Start editing' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Close characters' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '← List' })).toBeDisabled()
    expect(props.onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Stop editing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close characters' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('clears the selection when a character is deleted', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Agent Reyes'))
    fireEvent.click(screen.getByRole('button', { name: 'Deleted' }))
    expect(screen.queryByTestId('profile')).not.toBeInTheDocument()
  })

  it('shows loading and error states', () => {
    mockList({ loading: true })
    const { unmount } = render(
      <ToastProvider>
        <CharactersPanel channelId="ch1" isGM isArchived={false} myUserId="gm" players={[]} nameOf={id => id} onClose={vi.fn()} />
      </ToastProvider>,
    )
    expect(screen.getByLabelText('Loading characters')).toBeInTheDocument()
    unmount()
    mockList({ error: new Error('x') })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalled()
  })

  it('hides creation from players', () => {
    renderPanel({ isGM: false })
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })
})

describe('CharactersEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCharacterActions).mockReturnValue(actions as never)
    mockList()
  })

  const members = [
    { user_id: 'gm', character_name: 'GM', profile: { display_name: 'Dylan' } },
    { user_id: 'u1', character_name: 'Agent Reyes', profile: { display_name: 'Sam' } },
    { user_id: 'u2', character_name: 'Blocked', is_blocked: true, profile: null },
    { user_id: 'u3', character_name: '  ', profile: { display_name: null } },
  ]

  function renderEntry(myUserId = 'gm') {
    render(
      <ToastProvider>
        <CharactersEntry channelId="ch1" isGM isArchived={false} gmId="gm" myUserId={myUserId} members={members} className="menu-item" />
      </ToastProvider>,
    )
  }

  it('opens and closes the panel from the sidebar item', () => {
    renderEntry()
    const item = screen.getByRole('button', { name: 'Characters' })
    expect(item).toHaveClass('menu-item')
    fireEvent.click(item)
    expect(screen.getByRole('dialog', { name: 'Characters' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close characters' }))
    expect(screen.queryByRole('dialog', { name: 'Characters' })).not.toBeInTheDocument()
  })

  it('names owners by account name and labels the GM, you and former players', () => {
    renderEntry('u3')
    fireEvent.click(screen.getByRole('button', { name: 'Characters' }))
    fireEvent.click(screen.getByText('Agent Reyes'))
    expect(screen.getByTestId('profile')).toHaveTextContent('owned by Sam')
    expect(screen.getByTestId('names')).toHaveTextContent('Dylan (GM)|You|A former player')
    // Active players only, sorted; the GM and blocked members are left out.
    expect(screen.getByTestId('players')).toHaveTextContent('Player|Sam')
  })

  it('labels a GM without a name', () => {
    render(
      <ToastProvider>
        <CharactersEntry channelId="ch1" isGM isArchived={false} gmId="gm" myUserId="u1" members={[]} className="" />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Characters' }))
    fireEvent.click(screen.getByText('Agent Reyes'))
    expect(screen.getByTestId('profile')).toHaveTextContent('owned by You')
    expect(screen.getByTestId('names')).toHaveTextContent('GM|A former player|A former player')
    expect(vi.mocked(useCharacterList).mock.calls.at(-1)).toEqual(['ch1', true, 'u1'])
  })
})
