import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { CharacterProfile, profileTabs, viewColumns } from './CharacterProfile'
import { useCharacterProfile } from './useCharacterProfile'
import type { CharacterField, CharacterSummary } from './characterModel'
import type { CharacterActions } from './useCharacterActions'

vi.mock('./useCharacterProfile', () => ({ useCharacterProfile: vi.fn() }))
vi.mock('../links/linkApi', () => ({
  listLinks: vi.fn(async () => []),
  listLinkTargets: vi.fn(async () => []),
  addLink: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
}))
vi.mock('../../dg/sheet/CharacterSheet', () => ({
  CharacterSheet: ({ kind, canEdit, onEditingChange }: { kind: string; canEdit: boolean; onEditingChange: (e: boolean) => void }) => (
    <div data-testid="sheet">
      {kind} sheet, {canEdit ? 'editable' : 'read-only'}
      <button type="button" onClick={() => onEditingChange(true)}>Start sheet edit</button>
      <button type="button" onClick={() => onEditingChange(false)}>Stop sheet edit</button>
    </div>
  ),
}))
vi.mock('../activity/CharacterActivity', () => ({
  CharacterActivity: ({ events, myUserId }: { events: unknown[]; myUserId?: string }) => (
    <div data-testid="activity">{events.length} history entries, viewer {myUserId ?? 'unknown'}</div>
  ),
}))
vi.mock('../../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadEnabled: true, settingsLoading: false, uploading: false, uploadImage: vi.fn() }),
}))

const pc: CharacterSummary = {
  id: 'c1', kind: 'pc', inPlay: true, name: 'Agent Reyes', portraitUrl: null, status: 'active', ownerId: 'u1', isMine: true, updatedAt: 't',
}

function f(id: string, overrides: Partial<CharacterField> = {}): CharacterField {
  return { id, characterId: 'c1', channelId: 'ch1', itemType: 'field', fieldKey: null, label: id, body: '', visibility: 'players', private: false, sortOrder: 10, ...overrides }
}

const fields = [
  f('Occupation', { body: 'FBI Special Agent' }),
  f('Kit', { itemType: 'heading', sortOrder: 20 }),
  f('Secrets', { visibility: 'owner', private: true }),
  f('GM notes', { visibility: 'gm', body: 'Is a mole' }),
]

const reload = vi.fn()

function actionsMock(overrides: Partial<CharacterActions> = {}): CharacterActions {
  return {
    create: vi.fn(),
    updateCharacter: vi.fn().mockResolvedValue(undefined),
    updateMyCharacter: vi.fn().mockResolvedValue(undefined),
    deleteCharacter: vi.fn(),
    setRole: vi.fn(),
    setMyStatus: vi.fn().mockResolvedValue(undefined),
    postAs: vi.fn(),
    saveFields: vi.fn().mockResolvedValue(undefined),
    addNote: vi.fn().mockResolvedValue(undefined),
    createTag: vi.fn(),
    setCharacterTags: vi.fn(),
    ...overrides,
  }
}

function setup(props: Partial<React.ComponentProps<typeof CharacterProfile>> = {}, data: Partial<ReturnType<typeof useCharacterProfile>> = {}) {
  vi.mocked(useCharacterProfile).mockReturnValue({ fields, events: [], loading: false, error: null, reload, ...data })
  const all = {
    channelId: 'ch1',
    character: pc,
    isGM: false,
    isArchived: false,
    players: [{ userId: 'u1', name: 'Sam' }],
    tags: [],
    nameOf: (id: string) => (id === 'u1' ? 'Sam' : 'Someone'),
    actions: actionsMock(),
    onChanged: vi.fn(),
    onDeleted: vi.fn(),
    onEditingChange: vi.fn(),
    ...props,
  }
  render(
    <ToastProvider>
      <CharacterProfile {...all} />
    </ToastProvider>,
  )
  return all
}

describe('viewColumns', () => {
  it('shows the GM every column and players only what applies', () => {
    expect(viewColumns(pc, [], true)).toEqual(['players', 'owner', 'gm'])
    expect(viewColumns({ ...pc, kind: 'npc' }, [], true)).toEqual(['players', 'gm'])
    expect(viewColumns(pc, [], false)).toEqual(['players', 'owner'])
    expect(viewColumns({ ...pc, isMine: false }, [], false)).toEqual(['players'])
    expect(viewColumns({ ...pc, isMine: false, inPlay: false }, [f('M', { visibility: 'owner' })], false)).toEqual(['players', 'owner'])
  })
})

describe('profileTabs', () => {
  it('gives the sheet tab to the GM, the owner, and everyone once a PC is out of play', () => {
    expect(profileTabs(pc, true)).toEqual(['profile', 'sheet', 'activity'])
    expect(profileTabs({ ...pc, kind: 'npc', isMine: false }, true)).toEqual(['profile', 'sheet', 'activity'])
    expect(profileTabs(pc, false)).toEqual(['profile', 'sheet', 'activity'])
    expect(profileTabs({ ...pc, isMine: false }, false)).toEqual(['profile', 'activity'])
    expect(profileTabs({ ...pc, isMine: false, inPlay: false }, false)).toEqual(['profile', 'sheet', 'activity'])
    expect(profileTabs({ ...pc, kind: 'npc', isMine: false }, false)).toEqual(['profile', 'activity'])
  })
})

describe('CharacterProfile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the sheet tab and locks the panel while the sheet is edited', async () => {
    const props = setup({ isGM: true })
    fireEvent.click(screen.getByRole('tab', { name: 'Sheet' }))
    expect(screen.getByTestId('sheet')).toHaveTextContent('pc sheet, editable')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start sheet edit' }))
    await waitFor(() => expect(props.onEditingChange).toHaveBeenLastCalledWith(true))
    expect(screen.queryByTestId('gm-controls')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop sheet edit' }))
    await waitFor(() => expect(props.onEditingChange).toHaveBeenLastCalledWith(false))
    expect(screen.getByTestId('gm-controls')).toBeInTheDocument()
  })

  it('calls an NPC sheet "Stats" and hides it from players who may not read it', () => {
    setup({ isGM: true, character: { ...pc, kind: 'npc', ownerId: null, isMine: false } })
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }))
    expect(screen.getByTestId('sheet')).toHaveTextContent('npc sheet')
  })

  it('shows another player an in-play PC without a sheet tab', () => {
    setup({ character: { ...pc, isMine: false } })
    expect(screen.queryByRole('tab', { name: 'Sheet' })).not.toBeInTheDocument()
  })

  it('shows the owner their columns, headings and Private markers, but no GM tools', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Agent Reyes' })).toBeInTheDocument()
    expect(screen.getByText('Player: You')).toBeInTheDocument()
    expect(screen.getByText('FBI Special Agent')).toBeInTheDocument()
    expect(screen.getByText('Kit')).toBeInTheDocument()
    expect(screen.getByText('🔒 Private')).toBeInTheDocument()
    expect(screen.getByText('Only you and the GM.')).toBeInTheDocument()
    expect(screen.queryByText('Is a mole')).not.toBeInTheDocument()
    expect(screen.queryByTestId('gm-controls')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('shows the GM all columns and GM controls', () => {
    setup({ isGM: true, character: { ...pc, isMine: false } })
    expect(screen.getByText('Is a mole')).toBeInTheDocument()
    expect(screen.getByTestId('gm-controls')).toBeInTheDocument()
    expect(screen.getByText('Player: Sam')).toBeInTheDocument()
    expect(screen.getByText("This character's player and you.")).toBeInTheDocument()
  })

  it.each([
    [{ isGM: true, character: { ...pc, inPlay: false } }, /Retired: all players can read these/],
    [{ character: { ...pc, inPlay: false } }, /Retired: other players can read these/],
    [{ character: { ...pc, isMine: false, inPlay: false } }, /Shared now this character is retired/],
  ])('explains the Owner column for %o', (props, text) => {
    setup(props, { fields: [f('Motivations', { visibility: 'owner' })] })
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('is read-only for an out-of-play owner and in archived campaigns', () => {
    setup({ character: { ...pc, inPlay: false } })
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByText(/retired \(has left the story\), so you can read but not edit it/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
  })

  it('lets the owner move their PC between Active and Reserve', async () => {
    const props = setup()
    expect(screen.getByText(/Active: you post as this character/)).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Deceased' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'incapacitated' } })
    await waitFor(() => expect(props.actions.setMyStatus).toHaveBeenCalledWith('c1', 'incapacitated'))
    expect(await screen.findByText('Status set to Incapacitated.')).toBeInTheDocument()
    expect(props.onChanged).toHaveBeenCalled()
  })

  it('shows a Reserve hint', () => {
    setup({ character: { ...pc, status: 'backup' } })
    expect(screen.getByText(/Reserve: you keep this character/)).toBeInTheDocument()
  })

  it('shows a GM-set status read-only', () => {
    setup({ character: { ...pc, status: 'missing' } })
    expect(screen.getByText('Status: Missing. Only the GM can change this status.')).toBeInTheDocument()
  })

  it.each([
    [{ isGM: true }],
    [{ character: { ...pc, isMine: false } }],
    [{ isArchived: true }],
  ])('has no own-status picker for %o', props => {
    setup(props)
    expect(screen.queryByText(/you can post as this character/)).not.toBeInTheDocument()
  })

  it('hides editing and GM tools in an archived campaign', () => {
    setup({ isGM: true, isArchived: true })
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('gm-controls')).not.toBeInTheDocument()
  })

  it('shows empty, loading and error states', () => {
    setup({}, { fields: [] })
    expect(screen.getAllByText('Nothing here yet.')).toHaveLength(2)
  })

  it('shows a loading skeleton', () => {
    setup({}, { fields: [], loading: true })
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', () => {
    setup({}, { error: new Error('x') })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
  })

  it('edits, saves name, portrait and fields, then leaves edit mode', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(props.onEditingChange).toHaveBeenLastCalledWith(true))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Maria Reyes' } })
    fireEvent.change(screen.getByLabelText('Occupation text'), { target: { value: 'Retired' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.actions.updateMyCharacter).toHaveBeenCalledWith('c1', 'Maria Reyes', null))
    expect(props.actions.saveFields).toHaveBeenCalledWith('c1', expect.objectContaining({ updates: [{ id: 'Occupation', patch: { body: 'Retired' } }] }))
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument())
    expect(await screen.findByText('Character saved.')).toBeInTheDocument()
    expect(reload).toHaveBeenCalled()
    expect(props.onChanged).toHaveBeenCalled()
    expect(props.onEditingChange).toHaveBeenLastCalledWith(false)
  })

  it('skips writes when nothing changed', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument())
    expect(props.actions.updateMyCharacter).not.toHaveBeenCalled()
    expect(props.actions.saveFields).not.toHaveBeenCalled()
  })

  it('stays in edit mode and reports the error when saving fails', async () => {
    setup({ actions: actionsMock({ saveFields: vi.fn().mockRejectedValue(new Error('Not allowed')) }) })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Occupation text'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Not allowed')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('reports unexpected errors generically', async () => {
    setup({ actions: actionsMock({ updateMyCharacter: vi.fn().mockRejectedValue('weird') }) })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument()
  })

  it('cancels editing', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('shows the Activity tab with the history entries', () => {
    setup({ isGM: true, myUserId: 'gm' }, { events: [{ id: 'e1', eventType: 'note', details: {}, note: 'x', visibility: 'gm', actorId: 'gm', createdAt: 't' }] })
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(screen.getByTestId('activity')).toHaveTextContent('1 history entries, viewer gm')
    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }))
    expect(screen.getByText('FBI Special Agent')).toBeInTheDocument()
  })

  it('shows no player line for NPCs', () => {
    setup({ isGM: true, character: { ...pc, kind: 'npc', ownerId: null, isMine: false } })
    expect(screen.queryByText(/^Player:/)).not.toBeInTheDocument()
  })
})
