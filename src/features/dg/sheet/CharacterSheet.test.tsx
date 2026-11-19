// cspell:words Okafor okafor
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { PostAuthorshipContext } from '../../ext/authorship/authorshipContext'
import { useCharacterList } from '../../ext/characters/useCharacterList'
import { CharacterSheet } from './CharacterSheet'
import { MySheetButton } from './MySheetButton'
import { useSheet } from './useSheet'
import { newAgentSheet, newNpcBlock } from './sheetModel'
import type { CharacterSummary } from '../../ext/characters/characterModel'

vi.mock('./useSheet', () => ({ useSheet: vi.fn() }))
vi.mock('../../ext/characters/useCharacterList', () => ({ useCharacterList: vi.fn() }))

const calc = { hpMax: 12, wpMax: 13, sanStart: 65, sanMax: 99, breakingPointStart: 52 }
const reload = vi.fn()
const create = vi.fn()
const save = vi.fn()
const remove = vi.fn()
const setPool = vi.fn()

function mockSheet(overrides: Partial<ReturnType<typeof useSheet>> = {}) {
  vi.mocked(useSheet).mockReturnValue({ row: null, loading: false, error: null, reload, create, save, remove, setPool, ...overrides })
}

const agentRow = { characterId: 'c1', data: { ...newAgentSheet(), personal: { ...newAgentSheet().personal, profession: 'FBI' } }, calc, updatedAt: '2026-11-18T10:00:00Z', updatedBy: 'u1' }

function renderSheet(props: Partial<React.ComponentProps<typeof CharacterSheet>> = {}) {
  const all = { channelId: 'ch1', characterId: 'c1', kind: 'pc' as const, canEdit: true, isGM: false, onEditingChange: vi.fn(), ...props }
  render(
    <ToastProvider>
      <CharacterSheet {...all} />
    </ToastProvider>,
  )
  return all
}

describe('CharacterSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockResolvedValue(undefined)
    save.mockResolvedValue(undefined)
    remove.mockResolvedValue(undefined)
    setPool.mockResolvedValue(undefined)
  })

  it('changes current HP from view mode with − / +, saved once after a pause', () => {
    vi.useFakeTimers()
    try {
      mockSheet({ row: { ...agentRow, data: { ...agentRow.data, hp: { current: 10, maxOverride: null } } } })
      renderSheet()
      fireEvent.click(screen.getByRole('button', { name: 'Lower HP' }))
      fireEvent.click(screen.getByRole('button', { name: 'Lower HP' }))
      expect(screen.getByRole('button', { name: /Current HP: 8/ })).toBeInTheDocument()
      expect(setPool).not.toHaveBeenCalled()
      vi.advanceTimersByTime(800)
      expect(setPool).toHaveBeenCalledTimes(1)
      expect(setPool).toHaveBeenCalledWith('hp', 8)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ticks failed skills, SAN-loss incidents and first aid straight from the view', async () => {
    mockSheet({ row: agentRow })
    renderSheet()
    expect(screen.queryByText(/Use − \/ \+/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Firearms failed this session'))
    expect(screen.getByLabelText('Firearms failed this session')).toBeChecked()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0].skills.firearms.failed).toBe(true)
    await waitFor(() => expect(reload).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('Violence incident 2'))
    expect(save.mock.calls[1][0].adapted.violence).toBe(2)
    fireEvent.click(screen.getByLabelText('First aid attempted since last injury'))
    expect(save.mock.calls[2][0].firstAidAttempted).toBe(true)
  })

  it('reports a failed tick save and shows the saved value again', async () => {
    save.mockRejectedValue(new Error('This campaign is archived'))
    mockSheet({ row: agentRow })
    renderSheet()
    fireEvent.click(screen.getByLabelText('Helplessness incident 1'))
    expect(await screen.findByText('This campaign is archived')).toBeInTheDocument()
    expect(screen.getByLabelText('Helplessness incident 1')).not.toBeChecked()
  })

  it('shows tick boxes as read-only marks for viewers who cannot edit', () => {
    mockSheet({ row: agentRow })
    renderSheet({ canEdit: false })
    expect(screen.queryByLabelText('Firearms failed this session')).not.toBeInTheDocument()
    expect(screen.getByText('First aid attempted since last injury: No')).toBeInTheDocument()
  })

  it('types a new SAN value, and reports a failed save', async () => {
    setPool.mockRejectedValue(new Error('Numbers on the sheet must be between 0 and 999 (san.current)'))
    mockSheet({ row: agentRow })
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /Current SAN/ }))
    fireEvent.change(screen.getByLabelText('Current SAN'), { target: { value: '5x5' } })
    expect(screen.getByLabelText('Current SAN')).toHaveValue('55')
    fireEvent.keyDown(screen.getByLabelText('Current SAN'), { key: 'Enter' })
    expect(setPool).toHaveBeenCalledWith('san', 55)
    expect(await screen.findByText(/between 0 and 999/)).toBeInTheDocument()
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it('Escape leaves the typed value unsaved; no quick changes for read-only viewers', () => {
    mockSheet({ row: { ...agentRow, data: { ...agentRow.data, wp: { current: 5, maxOverride: null } } } })
    const { unmount } = render(
      <ToastProvider>
        <CharacterSheet channelId="ch1" characterId="c1" kind="pc" canEdit isGM={false} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Current WP/ }))
    fireEvent.change(screen.getByLabelText('Current WP'), { target: { value: '3' } })
    fireEvent.keyDown(screen.getByLabelText('Current WP'), { key: 'Escape' })
    expect(screen.queryByLabelText('Current WP')).not.toBeInTheDocument()
    expect(setPool).not.toHaveBeenCalled()
    // Clearing the box and leaving it clears the value; an unchanged value saves nothing.
    fireEvent.click(screen.getByRole('button', { name: /Current WP/ }))
    fireEvent.change(screen.getByLabelText('Current WP'), { target: { value: '' } })
    fireEvent.blur(screen.getByLabelText('Current WP'))
    expect(setPool).toHaveBeenCalledWith('wp', null)
    fireEvent.click(screen.getByRole('button', { name: /Current WP/ }))
    fireEvent.keyDown(screen.getByLabelText('Current WP'), { key: 'Enter' })
    expect(setPool).toHaveBeenCalledTimes(1)
    // − from empty starts at the maximum (WP 13 → 12); a waiting change is saved when the sheet closes.
    fireEvent.click(screen.getByRole('button', { name: 'Lower WP' }))
    expect(setPool).toHaveBeenCalledTimes(1)
    unmount()
    expect(setPool).toHaveBeenLastCalledWith('wp', 12)
    renderSheet({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Lower HP' })).not.toBeInTheDocument()
  })

  it('shows loading and a retry on error', () => {
    mockSheet({ loading: true })
    const { unmount } = render(<ToastProvider><CharacterSheet channelId="ch1" characterId="c1" kind="pc" canEdit isGM={false} /></ToastProvider>)
    expect(screen.getByLabelText('Loading sheet')).toBeInTheDocument()
    unmount()
    mockSheet({ error: new Error('x') })
    renderSheet({ kind: 'npc' })
    expect(screen.getByText("Couldn't load the stat block.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalled()
  })

  it('creates a Delta Green sheet with base skills', async () => {
    mockSheet()
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Create Delta Green sheet' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({ format: 'agent', skills: { firearms: { value: 20 } } })
    expect(await screen.findByText('Sheet created.')).toBeInTheDocument()
    expect(reload).toHaveBeenCalled()
  })

  it('adds an NPC stat block', async () => {
    mockSheet()
    renderSheet({ kind: 'npc', isGM: true })
    expect(screen.getByText(/Not every NPC needs them/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add stats' }))
    await waitFor(() => expect(create.mock.calls[0][0]).toMatchObject({ format: 'npc' }))
  })

  it('reports a failed create', async () => {
    mockSheet()
    create.mockRejectedValue(new Error('Not allowed'))
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Create Delta Green sheet' }))
    expect(await screen.findByText('Not allowed')).toBeInTheDocument()
  })

  it('says there is no sheet to viewers who cannot create one', () => {
    mockSheet()
    renderSheet({ canEdit: false, kind: 'npc' })
    expect(screen.getByText('No stat block yet.')).toBeInTheDocument()
  })

  it('shows the sheet with the database values and edits it', async () => {
    mockSheet({ row: agentRow })
    const props = renderSheet()
    expect(screen.getByText('FBI')).toBeInTheDocument()
    expect(screen.getByText(/Last saved/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit sheet' }))
    await waitFor(() => expect(props.onEditingChange).toHaveBeenLastCalledWith(true))
    fireEvent.change(screen.getByRole('textbox', { name: 'Profession' }), { target: { value: 'DEA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0].personal.profession).toBe('DEA')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit sheet' })).toBeInTheDocument())
    expect(props.onEditingChange).toHaveBeenLastCalledWith(false)
  })

  it('stays in edit mode when saving fails', async () => {
    mockSheet({ row: agentRow })
    save.mockRejectedValue('weird')
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Edit sheet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Edit sheet' })).toBeInTheDocument()
  })

  it('is read-only without edit rights', () => {
    mockSheet({ row: agentRow })
    renderSheet({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Edit sheet' })).not.toBeInTheDocument()
  })

  it('shows and edits an NPC stat block, and lets the GM remove it', async () => {
    mockSheet({ row: { ...agentRow, data: { ...newNpcBlock(), attacks: 'Scalpel' } } })
    renderSheet({ kind: 'npc', isGM: true })
    expect(screen.getByText(/GM only\./)).toBeInTheDocument()
    expect(screen.getByText('Scalpel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit stat block' }))
    expect(screen.getByRole('form', { name: 'Edit stat block' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove this stat block?' })).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove this stat block?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(remove).toHaveBeenCalled())
    expect(await screen.findByText('The stat block was removed.')).toBeInTheDocument()
  })

  it('keeps a former PC sheet as a full sheet after the character became an NPC', () => {
    mockSheet({ row: agentRow })
    renderSheet({ kind: 'npc', isGM: true })
    expect(screen.getByTestId('agent-sheet')).toBeInTheDocument()
  })
})

function make(overrides: Partial<CharacterSummary>): CharacterSummary {
  return { id: 'x', kind: 'pc', inPlay: true, name: 'X', portraitUrl: null, status: 'active', ownerId: 'u1', isMine: true, updatedAt: 't', ...overrides }
}

function mockList(characters: CharacterSummary[], overrides: Partial<ReturnType<typeof useCharacterList>> = {}) {
  vi.mocked(useCharacterList).mockReturnValue({ characters, tags: [], loading: false, error: null, reload, ...overrides })
}

function renderButton(props: Partial<React.ComponentProps<typeof MySheetButton>> = {}, postingAs: string | null = null) {
  const lookup = (userId: string | null | undefined) =>
    postingAs && userId === 'u1' ? { characterId: postingAs, name: 'x', portraitUrl: null } : null
  render(
    <ToastProvider>
      <PostAuthorshipContext.Provider value={lookup}>
        <MySheetButton channelId="ch1" myUserId="u1" isGM={false} isArchived={false} {...props} />
      </PostAuthorshipContext.Provider>
    </ToastProvider>,
  )
}

describe('MySheetButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSheet({ row: agentRow })
  })

  it('is hidden for the GM and signed-out users', () => {
    renderButton({ isGM: true })
    expect(screen.queryByRole('button', { name: 'My sheet' })).not.toBeInTheDocument()
    renderButton({ myUserId: undefined })
    expect(screen.queryByRole('button', { name: 'My sheet' })).not.toBeInTheDocument()
  })

  it('opens on the character the player is posting as, and switches between own PCs', () => {
    mockList([make({ id: 'reyes', name: 'Reyes' }), make({ id: 'okafor', name: 'Okafor' }), make({ id: 'old', name: 'Old', inPlay: false }), make({ id: 'other', name: 'Other', isMine: false })])
    renderButton({}, 'okafor')
    fireEvent.click(screen.getByRole('button', { name: 'My sheet' }))
    const dialog = screen.getByRole('dialog', { name: 'Okafor' })
    expect(within(dialog).getAllByRole('tab').map(t => t.textContent)).toEqual(['Reyes', 'Okafor', 'Old (retired)'])
    expect(vi.mocked(useSheet).mock.calls.at(-1)?.[0]).toBe('okafor')
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Old (retired)' }))
    expect(screen.getByRole('dialog', { name: 'Old' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit sheet' })).not.toBeInTheDocument()
  })

  it('falls back to the first in-play PC, and locks closing while editing', () => {
    mockList([make({ id: 'old', name: 'Old', inPlay: false }), make({ id: 'reyes', name: 'Reyes' })])
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'My sheet' }))
    expect(screen.getByRole('dialog', { name: 'Reyes' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit sheet' }))
    expect(screen.getByRole('button', { name: 'Close my sheet' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Reyes' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close my sheet' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('makes sheets read-only in archived campaigns and closes with Escape', () => {
    mockList([make({ id: 'reyes', name: 'Reyes' })])
    renderButton({ isArchived: true })
    fireEvent.click(screen.getByRole('button', { name: 'My sheet' }))
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit sheet' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('explains when the player has no character', () => {
    mockList([])
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'My sheet' }))
    expect(screen.getByText(/don't have a character in this campaign yet/)).toBeInTheDocument()
  })

  it('shows loading and error states', () => {
    mockList([], { loading: true })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'My sheet' }))
    expect(screen.getByLabelText('Loading your characters')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', () => {
    mockList([], { error: new Error('x') })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'My sheet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalled()
  })
})
