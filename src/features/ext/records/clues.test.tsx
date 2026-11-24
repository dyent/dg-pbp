// cspell:words Okafor
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { onCharacterRequest } from '../npcTags/characterOpener'
import { ClueSection, ClueStatusBadge } from './ClueSection'
import * as api from './clueApi'
import { OpenRecordContext } from './recordOpener'
import type { CampaignRecord } from './recordModel'

vi.mock('./clueApi', () => ({
  CLUE_POINT_MAX: 300,
  getClueDetails: vi.fn(),
  setClueStatus: vi.fn(),
  setClueFound: vi.fn(),
  listFoundOptions: vi.fn(),
  listCluePoints: vi.fn(),
  addCluePoint: vi.fn(),
  updateCluePoint: vi.fn(),
  deleteCluePoint: vi.fn(),
}))

const glove: CampaignRecord = {
  id: 'r2',
  kind: 'clue',
  name: 'Bloody glove',
  pictureUrl: null,
  provenance: 'canon',
  visibility: 'players',
  updatedAt: 't',
  tagIds: [],
  sharedWith: [],
  clueStatus: 'investigated',
}

const found: api.ClueDetails = {
  status: 'investigated',
  foundBy: { id: 'c1', name: 'Reyes' },
  foundAt: { id: 'r1', name: 'Morgue' },
  foundDay: 10148,
}

function renderClue(props: Partial<Parameters<typeof ClueSection>[0]> = {}) {
  const onChanged = vi.fn()
  render(
    <ToastProvider>
      <ClueSection channelId="ch" record={glove} isGM isArchived={false} onChanged={onChanged} {...props} />
    </ToastProvider>,
  )
  return { onChanged }
}

describe('ClueSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getClueDetails).mockResolvedValue(found)
    vi.mocked(api.listCluePoints).mockResolvedValue([
      { id: 'p1', body: 'Glove belongs to Dr Hale', workedOut: false, sortOrder: 0 },
      { id: 'p2', body: 'Hale was in the morgue after midnight', workedOut: true, sortOrder: 1 },
    ])
    vi.mocked(api.listFoundOptions).mockResolvedValue({
      pcs: [{ id: 'c1', name: 'Reyes' }, { id: 'c2', name: 'Okafor' }],
      locations: [{ id: 'r1', name: 'Morgue' }, { id: 'r3', name: 'Attic' }],
    })
    for (const fn of [api.setClueStatus, api.setClueFound, api.addCluePoint, api.updateCluePoint, api.deleteCluePoint]) {
      vi.mocked(fn).mockResolvedValue()
    }
  })

  it('shows where the clue was found, with links to both', async () => {
    const openRecord = vi.fn()
    const opened: string[] = []
    const stop = onCharacterRequest(id => opened.push(id))
    render(
      <ToastProvider>
        <OpenRecordContext.Provider value={openRecord}>
          <ClueSection channelId="ch" record={glove} isGM={false} isArchived={false} onChanged={vi.fn()} />
        </OpenRecordContext.Provider>
      </ToastProvider>,
    )
    const section = await screen.findByRole('region', { name: 'Clue' })
    expect(section).toHaveTextContent('Found by Reyes at Morgue on Tue 14 Oct 1997.')
    fireEvent.click(within(section).getByRole('button', { name: 'Morgue' }))
    expect(openRecord).toHaveBeenCalledWith('r1')
    fireEvent.click(within(section).getByRole('button', { name: 'Reyes' }))
    expect(opened).toEqual(['c1'])
    stop()
  })

  it('gives players no GM controls and no checklist', async () => {
    renderClue({ isGM: false })
    await screen.findByRole('region', { name: 'Clue' })
    expect(screen.queryByLabelText('Clue status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit found' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'GM checklist' })).not.toBeInTheDocument()
    expect(api.listCluePoints).not.toHaveBeenCalled()
  })

  it('says when nothing about the find is recorded', async () => {
    vi.mocked(api.getClueDetails).mockResolvedValue({ status: 'unexamined', foundBy: null, foundAt: null, foundDay: null })
    renderClue({ isGM: false })
    expect(await screen.findByText('Where it was found isn’t recorded.')).toBeInTheDocument()
  })

  it('lets the GM change the status', async () => {
    const { onChanged } = renderClue()
    fireEvent.change(await screen.findByLabelText('Clue status'), { target: { value: 'resolved' } })
    await waitFor(() => expect(api.setClueStatus).toHaveBeenCalledWith('r2', 'resolved'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await screen.findByText('Status set to Resolved.')).toBeInTheDocument()
  })

  it('lets the GM edit, save and clear where it was found', async () => {
    renderClue()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit found' }))
    const form = screen.getByRole('form', { name: 'Where the clue was found' })
    const by = within(form).getByLabelText('Found by')
    await waitFor(() => expect(by).not.toBeDisabled())
    expect(by).toHaveValue('c1')
    expect(within(form).getByLabelText('In-game date')).toHaveValue('1997-10-14')
    fireEvent.change(by, { target: { value: 'c2' } })
    fireEvent.change(within(form).getByLabelText('Where'), { target: { value: '' } })
    fireEvent.change(within(form).getByLabelText('In-game date'), { target: { value: '1997-10-20' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.setClueFound).toHaveBeenCalledWith('r2', { byId: 'c2', atId: null, day: 10154 }))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Where the clue was found' })).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit found' }))
    fireEvent.click(within(screen.getByRole('form', { name: 'Where the clue was found' })).getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(api.setClueFound).toHaveBeenLastCalledWith('r2', { byId: null, atId: null, day: null }))
  })

  it('cancels editing and keeps the form open on errors', async () => {
    vi.mocked(api.setClueFound).mockRejectedValue(new Error('A clue can only be found by a PC of this campaign'))
    vi.mocked(api.listFoundOptions).mockRejectedValue(new Error('down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderClue()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit found' }))
    expect(await screen.findByText("Couldn't load the PCs and locations.")).toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Where the clue was found' })
    fireEvent.change(within(form).getByLabelText('In-game date'), { target: { value: '' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('A clue can only be found by a PC of this campaign')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Where the clue was found' })).toBeInTheDocument()
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Where the clue was found' })).not.toBeInTheDocument()
  })

  it('starts a new find with no date when there is no campaign date', async () => {
    vi.mocked(api.getClueDetails).mockResolvedValue({ status: 'unexamined', foundBy: null, foundAt: null, foundDay: null })
    renderClue()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit found' }))
    const form = screen.getByRole('form', { name: 'Where the clue was found' })
    // No calendar provider here, so there is no campaign date to start from.
    expect(within(form).getByLabelText('In-game date')).toHaveValue('')
  })

  it('shows the GM checklist with progress, and lets the GM tick, add and remove points', async () => {
    renderClue()
    const list = await screen.findByRole('group', { name: 'GM checklist' })
    expect(await within(list).findByText('1 of 2 worked out')).toBeInTheDocument()

    fireEvent.click(within(list).getByLabelText('Worked out: Glove belongs to Dr Hale'))
    await waitFor(() => expect(api.updateCluePoint).toHaveBeenCalledWith('p1', { worked_out: true }))

    fireEvent.click(within(list).getByRole('button', { name: 'Remove: Hale was in the morgue after midnight' }))
    await waitFor(() => expect(api.deleteCluePoint).toHaveBeenCalledWith('p2'))

    const input = within(list).getByLabelText('New checklist point')
    fireEvent.change(input, { target: { value: 'x'.repeat(301) } })
    expect(within(list).getByText('Points can be at most 300 characters.')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'Hale drives a blue sedan' } })
    fireEvent.click(within(list).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.addCluePoint).toHaveBeenCalledWith('r2', 'ch', 'Hale drives a blue sedan', 2))
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('shows an empty checklist and read-only ticks in an archived campaign', async () => {
    vi.mocked(api.listCluePoints).mockResolvedValue([{ id: 'p1', body: 'Point', workedOut: false, sortOrder: 0 }])
    renderClue({ isArchived: true })
    const list = await screen.findByRole('group', { name: 'GM checklist' })
    expect(await within(list).findByLabelText('Worked out: Point')).toBeDisabled()
    expect(within(list).queryByLabelText('New checklist point')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Clue status')).not.toBeInTheDocument()
  })

  it('tells the GM when the checklist is empty', async () => {
    vi.mocked(api.listCluePoints).mockResolvedValue([])
    vi.mocked(api.getClueDetails).mockResolvedValue({ status: 'unexamined', foundBy: null, foundAt: null, foundDay: null })
    renderClue()
    expect(await screen.findByText('Nothing on the checklist yet.')).toBeInTheDocument()
    expect(screen.getByText('Not found yet.')).toBeInTheDocument()
  })

  it('offers retries when loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.getClueDetails).mockRejectedValueOnce(new Error('down'))
    vi.mocked(api.listCluePoints).mockRejectedValueOnce(new Error('down'))
    renderClue()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    const list = await screen.findByRole('group', { name: 'GM checklist' })
    fireEvent.click(await within(list).findByRole('button', { name: 'Retry' }))
    expect(await within(list).findByText('Glove belongs to Dr Hale')).toBeInTheDocument()
  })

  it('reports a failed checklist change', async () => {
    vi.mocked(api.updateCluePoint).mockRejectedValue(new Error('archived'))
    renderClue()
    const list = await screen.findByRole('group', { name: 'GM checklist' })
    fireEvent.click(await within(list).findByLabelText('Worked out: Glove belongs to Dr Hale'))
    expect(await screen.findByText('archived')).toBeInTheDocument()
  })
})

describe('ClueStatusBadge', () => {
  it('labels each status', () => {
    render(<ClueStatusBadge status="resolved" />)
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })
})
