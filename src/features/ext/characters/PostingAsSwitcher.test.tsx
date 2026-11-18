// cspell:words Okafor okafor
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { PostingAsSwitcher } from './PostingAsSwitcher'
import { usePostingIdentities } from '../authorship/usePostingIdentities'
import type { CharacterSummary } from './characterModel'

vi.mock('../authorship/usePostingIdentities', () => ({ usePostingIdentities: vi.fn() }))

function make(overrides: Partial<CharacterSummary>): CharacterSummary {
  return { id: 'x', kind: 'pc', inPlay: true, name: 'X', portraitUrl: null, status: 'active', ownerId: 'u1', isMine: true, updatedAt: 't', ...overrides }
}

const characters = [
  make({ id: 'reyes', name: 'Reyes' }),
  make({ id: 'okafor', name: 'Okafor' }),
  make({ id: 'hurt', name: 'Hurt', status: 'incapacitated' }),
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

describe('PostingAsSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePostingIdentities).mockReturnValue({ identities: [identity('reyes', 5), identity('okafor'), identity('theirs', null, 'u2')], error: null })
  })

  it('shows the current character and offers only my other active in-play PCs', () => {
    setup()
    expect(screen.getByTestId('posting-as')).toHaveTextContent("You're posting as Okafor.")
    const options = [...screen.getByLabelText('Switch to character').querySelectorAll('option')].map(o => o.textContent)
    expect(options).toEqual(['Switch to…', 'Reyes'])
  })

  it('switches and confirms', async () => {
    const props = setup()
    expect(screen.getByRole('button', { name: 'Switch' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Switch to character'), { target: { value: 'reyes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    await waitFor(() => expect(props.onSwitch).toHaveBeenCalledWith('reyes'))
    expect(await screen.findByText("You're now posting as Reyes.")).toBeInTheDocument()
  })

  it('reports a failed switch', async () => {
    setup({ onSwitch: vi.fn().mockRejectedValue(new Error('This character is not currently active')) })
    fireEvent.change(screen.getByLabelText('Switch to character'), { target: { value: 'reyes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    expect(await screen.findByText('This character is not currently active')).toBeInTheDocument()
  })

  it('falls back to a generic error message', async () => {
    setup({ onSwitch: vi.fn().mockRejectedValue('weird') })
    fireEvent.change(screen.getByLabelText('Switch to character'), { target: { value: 'reyes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    expect(await screen.findByText('Could not switch character.')).toBeInTheDocument()
  })

  it('mentions a non-active current character and posting under your own name', () => {
    vi.mocked(usePostingIdentities).mockReturnValue({ identities: [identity('hurt')], error: null })
    const { unmount } = setup()
    expect(screen.getByTestId('posting-as')).toHaveTextContent('Hurt (Incapacitated).')
    unmount()
    vi.mocked(usePostingIdentities).mockReturnValue({ identities: [], error: null })
    setup()
    expect(screen.getByTestId('posting-as')).toHaveTextContent('posting under your own name')
  })

  it('hides the switch in archived campaigns', () => {
    setup({ disabled: true })
    expect(screen.queryByLabelText('Switch to character')).not.toBeInTheDocument()
  })

  it('renders nothing without own in-play PCs or when signed out', () => {
    const { unmount } = setup({ characters: [characters[3], characters[4]] })
    expect(screen.queryByTestId('posting-as')).toBeNull()
    unmount()
    setup({ myUserId: undefined })
    expect(screen.queryByTestId('posting-as')).toBeNull()
  })
})
