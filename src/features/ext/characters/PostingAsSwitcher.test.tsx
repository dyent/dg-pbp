// cspell:words Okafor okafor
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { PostingAsSwitcher } from './PostingAsSwitcher'
import { usePostingIdentities } from '../authorship/usePostingIdentities'
import type { CharacterSummary } from './characterModel'

vi.mock('../authorship/usePostingIdentities', () => ({ usePostingIdentities: vi.fn() }))

function make(overrides: Partial<CharacterSummary>): CharacterSummary {
  return { id: 'x', kind: 'pc', inPlay: true, name: 'X', portraitUrl: null, status: 'backup', ownerId: 'u1', isMine: true, updatedAt: 't', ...overrides }
}

const characters = [
  make({ id: 'reyes', name: 'Reyes' }),
  make({ id: 'okafor', name: 'Okafor', status: 'active' }),
  make({ id: 'hurt', name: 'Hurt', status: 'incapacitated' }),
  make({ id: 'gone', name: 'Gone', status: 'missing' }),
  make({ id: 'old', name: 'Old', inPlay: false }),
  make({ id: 'theirs', name: 'Theirs', isMine: false, ownerId: 'u2' }),
]

function identity(characterId: string, endedAt: number | null = null, userId = 'u1') {
  return { userId, characterId, name: characterId, portraitUrl: null, startedAt: 0, endedAt }
}

function setup(props: Partial<React.ComponentProps<typeof PostingAsSwitcher>> = {}) {
  const all = { channelId: 'ch1', myUserId: 'u1', characters, disabled: false, onSwitch: vi.fn().mockResolvedValue(undefined), ...props }
  const view = render(
    <ToastProvider>
      <PostingAsSwitcher {...all} />
    </ToastProvider>,
  )
  return { ...all, ...view }
}

const picker = () => screen.getByLabelText('Make a character active')

describe('PostingAsSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePostingIdentities).mockReturnValue({ identities: [identity('reyes', 5), identity('okafor'), identity('theirs', null, 'u2')], error: null })
  })

  it('shows the active character and offers my Reserve PCs the player may activate', () => {
    setup()
    expect(screen.getByTestId('posting-as')).toHaveTextContent("You're posting as Okafor.")
    const options = [...picker().querySelectorAll('option')].map(o => o.textContent)
    expect(options).toEqual(['Make active…', 'Reyes', 'Hurt'])
  })

  it('makes a character active and confirms', async () => {
    const props = setup()
    expect(screen.getByRole('button', { name: 'Make active' })).toBeDisabled()
    fireEvent.change(picker(), { target: { value: 'reyes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make active' }))
    await waitFor(() => expect(props.onSwitch).toHaveBeenCalledWith('reyes'))
    expect(await screen.findByText("You're now posting as Reyes.")).toBeInTheDocument()
  })

  it('reports a failed switch', async () => {
    setup({ onSwitch: vi.fn().mockRejectedValue(new Error('A player can have at most 3 reserve characters; retire one first')) })
    fireEvent.change(picker(), { target: { value: 'reyes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make active' }))
    expect(await screen.findByText('A player can have at most 3 reserve characters; retire one first')).toBeInTheDocument()
  })

  it('falls back to a generic error message', async () => {
    setup({ onSwitch: vi.fn().mockRejectedValue('weird') })
    fireEvent.change(picker(), { target: { value: 'reyes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make active' }))
    expect(await screen.findByText('Could not switch character.')).toBeInTheDocument()
  })

  it('says when the player posts under their own name', () => {
    vi.mocked(usePostingIdentities).mockReturnValue({ identities: [], error: null })
    setup()
    expect(screen.getByTestId('posting-as')).toHaveTextContent('posting under your own name')
  })

  it('hides the switch in archived campaigns', () => {
    setup({ disabled: true })
    expect(screen.queryByLabelText('Make a character active')).not.toBeInTheDocument()
  })

  it('renders nothing without own in-play PCs or when signed out', () => {
    const { unmount } = setup({ characters: [characters[4], characters[5]] })
    expect(screen.queryByTestId('posting-as')).toBeNull()
    unmount()
    setup({ myUserId: undefined })
    expect(screen.queryByTestId('posting-as')).toBeNull()
  })
})
