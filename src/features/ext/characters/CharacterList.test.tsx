// cspell:words Okafor okafor
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CharacterList } from './CharacterList'
import { Portrait, RoleBadge, StatusBadge } from './CharacterBadges'
import type { CharacterSummary } from './characterModel'

function make(overrides: Partial<CharacterSummary>): CharacterSummary {
  return { id: 'x', kind: 'pc', inPlay: true, name: 'X', portraitUrl: null, status: 'active', ownerId: null, isMine: false, updatedAt: 't', ...overrides }
}

const characters = [
  make({ id: 'p1', name: 'Agent Reyes', ownerId: 'u1', isMine: true }),
  make({ id: 'p2', name: 'Agent Okafor', ownerId: 'u2', inPlay: false, status: 'deceased', revealed: false }),
  make({ id: 'n1', kind: 'npc', name: 'Dr Hale', aliases: ['The Doctor'], tagIds: ['t1'], status: 'missing' }),
  make({ id: 'n2', kind: 'npc', name: 'Sheriff Boyd', tagIds: [] }),
]

function setup(overrides: Partial<React.ComponentProps<typeof CharacterList>> = {}) {
  const props = {
    characters,
    tags: [{ id: 't1', name: 'Witness' }],
    isGM: true,
    canCreate: true,
    kind: 'pc' as const,
    onKindChange: vi.fn(),
    selectedId: null,
    onSelect: vi.fn(),
    ownerName: (id: string) => (id === 'u2' ? 'Alex' : 'Someone'),
    onCreate: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  render(<CharacterList {...props} />)
  return props
}

describe('CharacterList', () => {
  it('groups your own characters first and shows role, status, owner and hidden badges', () => {
    setup()
    expect(screen.getByText('Your characters')).toBeInTheDocument()
    expect(screen.getByText('Others')).toBeInTheDocument()
    expect(screen.getByText('Agent Reyes')).toBeInTheDocument()
    expect(screen.getByText('Retired')).toBeInTheDocument()
    // Agent Reyes: role badge "Active" and status badge "Active".
    expect(screen.getAllByText('Active')).toHaveLength(2)
    expect(screen.getByText('Deceased')).toBeInTheDocument()
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Hidden')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'PCs (2)' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Dr Hale')).not.toBeInTheDocument()
  })

  it('switches tabs and selects characters', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('tab', { name: 'NPCs (2)' }))
    expect(props.onKindChange).toHaveBeenCalledWith('npc')
    fireEvent.click(screen.getByText('Agent Reyes'))
    expect(props.onSelect).toHaveBeenCalledWith('p1')
  })

  it('searches names and aliases and filters NPCs by tag', () => {
    setup({ kind: 'npc' })
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'doctor' } })
    expect(screen.getByText('Dr Hale')).toBeInTheDocument()
    expect(screen.queryByText('Sheriff Boyd')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'nobody' } })
    expect(screen.getByText('No characters match.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 't1' } })
    expect(screen.getByText('Dr Hale')).toBeInTheDocument()
    expect(screen.queryByText('Sheriff Boyd')).not.toBeInTheDocument()
  })

  it('adds a character and clears the box on success', async () => {
    const props = setup({ kind: 'npc' })
    const input = screen.getByLabelText('New NPC name')
    fireEvent.change(input, { target: { value: '  Agent Smith ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith('npc', 'Agent Smith'))
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('keeps the name when adding fails, and ignores blank names', async () => {
    const props = setup({ onCreate: vi.fn().mockResolvedValue(false) })
    const input = screen.getByLabelText('New PC name')
    fireEvent.submit(input.closest('form')!)
    expect(props.onCreate).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'Agent Smith' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(props.onCreate).toHaveBeenCalled())
    expect(input).toHaveValue('Agent Smith')
  })

  it('shows player empty states without GM tools', () => {
    setup({ characters: [], isGM: false, canCreate: false })
    expect(screen.getByText(/Your GM will set your character up/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Search characters')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })

  it.each([
    [{ kind: 'pc' as const, isGM: true }, /No PCs yet/],
    [{ kind: 'npc' as const, isGM: true }, /No NPCs yet/],
    [{ kind: 'npc' as const, isGM: false }, /No NPCs revealed yet/],
  ])('shows the right empty state for %o', (props, text) => {
    setup({ characters: [], ...props })
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('marks the selected character', () => {
    setup({ selectedId: 'p1' })
    expect(screen.getByText('Agent Reyes').closest('button')).toHaveAttribute('aria-current', 'true')
  })
})

describe('badges', () => {
  it('renders nothing for a hidden status, and an initial without a portrait', () => {
    const { container } = render(<StatusBadge character={make({ status: null })} />)
    expect(container).toBeEmptyDOMElement()
    render(<Portrait character={{ name: '', portraitUrl: null }} size="sm" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('labels Reserve PCs, and in-play PCs whose status is hidden', () => {
    render(<RoleBadge character={make({ status: 'backup' })} />)
    expect(screen.getByText('Reserve')).toHaveAttribute('title', expect.stringMatching(/can’t post as them/))
    render(<RoleBadge character={make({ status: null })} />)
    expect(screen.getByText('In play')).toBeInTheDocument()
    render(<RoleBadge character={make({ kind: 'npc' })} />)
    expect(screen.getByText('NPC')).toBeInTheDocument()
  })

  it('renders a portrait image when there is one', () => {
    const { container } = render(<Portrait character={{ name: 'A', portraitUrl: 'https://img/a.png' }} size="lg" />)
    expect(container.firstChild).toBeTruthy()
  })
})
