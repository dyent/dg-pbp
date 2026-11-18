import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { GmControls } from './GmControls'
import type { CharacterSummary } from './characterModel'
import type { CharacterActions } from './useCharacterActions'

const pc: CharacterSummary = {
  id: 'c1', kind: 'pc', inPlay: true, name: 'Reyes', portraitUrl: null, status: 'active', ownerId: 'u1', isMine: false, updatedAt: 't',
  revealed: true, statusVisible: true, aliases: ['Mara'], tagIds: [],
}
const npc: CharacterSummary = { ...pc, id: 'n1', kind: 'npc', name: 'Dr Hale', ownerId: null, tagIds: ['t1'] }

function actionsMock(): CharacterActions {
  return {
    create: vi.fn(),
    updateCharacter: vi.fn().mockResolvedValue(undefined),
    updateMyCharacter: vi.fn(),
    deleteCharacter: vi.fn().mockResolvedValue(undefined),
    setRole: vi.fn().mockResolvedValue(undefined),
    postAs: vi.fn(),
    saveFields: vi.fn(),
    addNote: vi.fn(),
    createTag: vi.fn().mockResolvedValue({ id: 't9', name: 'Federal' }),
    setCharacterTags: vi.fn().mockResolvedValue(undefined),
  }
}

function setup(character: CharacterSummary, runResult = true) {
  const actions = actionsMock()
  const run = vi.fn(async (action: () => Promise<unknown>) => {
    await action()
    return runResult
  })
  const onDeleted = vi.fn()
  const nameOf = (id: string) => ({ u1: 'Sam', u2: 'Alex', gone: 'A former player' })[id] ?? 'Someone'
  render(
    <GmControls
      character={character}
      players={[{ userId: 'u1', name: 'Sam' }, { userId: 'u2', name: 'Alex' }]}
      tags={[{ id: 't1', name: 'Witness' }, { id: 't2', name: 'Suspect' }]}
      nameOf={nameOf}
      actions={actions}
      run={run}
      onDeleted={onDeleted}
    />,
  )
  return { actions, run, onDeleted }
}

describe('GmControls: role', () => {
  it('shows no warning until the role changes, then explains and saves it with a note', async () => {
    const { actions } = setup(pc)
    expect(screen.queryByText('When you save:')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'pc_out_of_play' } })
    expect(screen.getByText('When you save:')).toBeInTheDocument()
    expect(screen.getByText(/Sam can no longer post as or edit Reyes/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Note for the history (optional)'), { target: { value: 'Sidelined' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }))
    await waitFor(() => expect(actions.setRole).toHaveBeenCalledWith('c1', 'pc', false, 'u1', 'Sidelined'))
    await waitFor(() => expect(screen.getByLabelText('Note for the history (optional)')).toHaveValue(''))
  })

  it('hands a PC to another player, or to nobody', async () => {
    const { actions } = setup(pc)
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'u2' } })
    expect(screen.getByText(/Alex can edit Reyes/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: '' } })
    expect(screen.getByText('No player controls Reyes.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }))
    await waitFor(() => expect(actions.setRole).toHaveBeenCalledWith('c1', 'pc', true, null, ''))
  })

  it('converts to an NPC (no player dropdown) and can cancel', () => {
    setup(pc)
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'npc' } })
    expect(screen.queryByLabelText('Player')).not.toBeInTheDocument()
    expect(screen.getByText('Reyes becomes an NPC.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Role')).toHaveValue('pc_in_play')
    expect(screen.queryByText('When you save:')).not.toBeInTheDocument()
  })

  it('keeps the note when saving fails', async () => {
    setup(pc, false)
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'pc_out_of_play' } })
    fireEvent.change(screen.getByLabelText('Note for the history (optional)'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save role' })).not.toBeDisabled())
    expect(screen.getByLabelText('Note for the history (optional)')).toHaveValue('x')
  })

  it('lists a former owner who has left the campaign', () => {
    setup({ ...pc, ownerId: 'gone', inPlay: false })
    expect(within(screen.getByLabelText('Player')).getByText('A former player')).toBeInTheDocument()
  })
})

describe('GmControls: status, reveal, aliases', () => {
  it('saves status and switches straight away', async () => {
    const { actions } = setup(pc)
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'missing' } })
    await waitFor(() => expect(actions.updateCharacter).toHaveBeenCalledWith('c1', { status: 'missing' }))
    fireEvent.click(screen.getByLabelText('Revealed to players'))
    await waitFor(() => expect(actions.updateCharacter).toHaveBeenCalledWith('c1', { revealed: false }))
    fireEvent.click(screen.getByLabelText('Players can see the status'))
    await waitFor(() => expect(actions.updateCharacter).toHaveBeenCalledWith('c1', { status_visible: false }))
  })

  it('explains that inactive PCs cannot be posted as', () => {
    setup({ ...pc, status: 'incapacitated' })
    expect(screen.getByText(/Only Active characters can be posted as/)).toBeInTheDocument()
  })

  it('reveals a hidden character', async () => {
    const { actions } = setup({ ...pc, revealed: false, status: null })
    expect(screen.getByLabelText('Status')).toHaveValue('active')
    fireEvent.click(screen.getByLabelText('Revealed to players'))
    await waitFor(() => expect(actions.updateCharacter).toHaveBeenCalledWith('c1', { revealed: true }))
  })

  it('saves aliases and validates them', async () => {
    const { actions } = setup(pc)
    const save = within(screen.getByRole('group', { name: 'Aliases' })).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Aliases'), { target: { value: 'Mara, M. Reyes ,' } })
    fireEvent.click(save)
    await waitFor(() => expect(actions.updateCharacter).toHaveBeenCalledWith('c1', { aliases: ['Mara', 'M. Reyes'] }))
    fireEvent.change(screen.getByLabelText('Aliases'), { target: { value: 'x'.repeat(41) } })
    expect(screen.getByText(/at most 40 characters/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Aliases'), { target: { value: Array.from({ length: 11 }, (_, i) => `a${i}`).join(',') } })
    expect(screen.getByText('At most 10 aliases.')).toBeInTheDocument()
  })
})

describe('GmControls: tags', () => {
  it('shows tags only for NPCs', () => {
    setup(pc)
    expect(screen.queryByRole('group', { name: 'Tags' })).not.toBeInTheDocument()
  })

  it('toggles tags on and off', async () => {
    const { actions } = setup(npc)
    expect(screen.getByRole('button', { name: 'Witness' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Witness' }))
    await waitFor(() => expect(actions.setCharacterTags).toHaveBeenCalledWith('n1', [], ['t1']))
    fireEvent.click(screen.getByRole('button', { name: 'Suspect' }))
    await waitFor(() => expect(actions.setCharacterTags).toHaveBeenCalledWith('n1', ['t2'], []))
  })

  it('creates a new tag and attaches it, or reuses an existing one', async () => {
    const { actions } = setup(npc)
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'Federal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    await waitFor(() => expect(actions.setCharacterTags).toHaveBeenCalledWith('n1', ['t9'], []))
    expect(actions.createTag).toHaveBeenCalledWith('Federal')
    await waitFor(() => expect(screen.getByLabelText('New tag')).toHaveValue(''))

    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'suspect' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    await waitFor(() => expect(actions.setCharacterTags).toHaveBeenCalledWith('n1', ['t2'], []))
    expect(actions.createTag).toHaveBeenCalledTimes(1)

    // Already attached: nothing to add.
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'Witness' } })
    fireEvent.submit(screen.getByLabelText('New tag').closest('form')!)
    await waitFor(() => expect(screen.getByLabelText('New tag')).toHaveValue(''))
    expect(actions.setCharacterTags).toHaveBeenCalledTimes(2)

    fireEvent.submit(screen.getByLabelText('New tag').closest('form')!)
    expect(actions.createTag).toHaveBeenCalledTimes(1)
  })

  it('suggests tags when there are none', () => {
    const actions = actionsMock()
    render(<GmControls character={npc} players={[]} tags={[]} nameOf={() => ''} actions={actions} run={vi.fn()} onDeleted={vi.fn()} />)
    expect(screen.getByText(/No tags yet/)).toBeInTheDocument()
  })

  it('keeps the tag text when adding fails', async () => {
    setup(npc, false)
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'Federal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add tag' })).not.toBeDisabled())
    expect(screen.getByLabelText('New tag')).toHaveValue('Federal')
  })
})

describe('GmControls: delete', () => {
  it('asks first, then deletes', async () => {
    const { actions, onDeleted } = setup(pc)
    fireEvent.click(screen.getByRole('button', { name: 'Delete character' }))
    expect(screen.getByText(/can't be deleted: change their status or role/)).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Reyes?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(actions.deleteCharacter).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })

  it('does not report deletion when it fails, and can be cancelled', async () => {
    const { onDeleted } = setup(pc, false)
    fireEvent.click(screen.getByRole('button', { name: 'Delete character' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Reyes?' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Delete Reyes?' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete character' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Reyes?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete Reyes?' })).not.toBeInTheDocument())
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
