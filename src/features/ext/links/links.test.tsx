// cspell:words Kowalski kowalski
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { onCharacterRequest } from '../npcTags/characterOpener'
import { OpenRecordContext } from '../records/recordOpener'
import * as api from './linkApi'
import { LinksSection } from './LinksSection'
import type { CampaignLink, LinkTarget } from './linkModel'

vi.mock('./linkApi', () => ({
  listLinks: vi.fn(),
  listLinkTargets: vi.fn(),
  addLink: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
  reverseLink: vi.fn(),
}))

const morgue: LinkTarget = { type: 'record', id: 'r1', name: 'Morgue', kind: 'location', pictureUrl: null }
const kowalski: LinkTarget = { type: 'character', id: 'c1', name: 'Kowalski', kind: 'npc', pictureUrl: null }
const reyes: LinkTarget = { type: 'character', id: 'c2', name: 'Reyes', kind: 'pc', pictureUrl: null }
const glove: LinkTarget = { type: 'record', id: 'r2', name: 'Bloody glove', kind: 'clue', pictureUrl: null }

const worksAt: CampaignLink = { id: 'l1', label: 'works at', visibility: 'players', outgoing: true, other: morgue }
const suspects: CampaignLink = { id: 'l2', label: 'suspects', visibility: 'gm', outgoing: false, other: reyes }

function renderSection(props: Partial<Parameters<typeof LinksSection>[0]> = {}) {
  return render(
    <ToastProvider>
      <LinksSection
        channelId="ch"
        subject={{ type: 'character', id: 'c1' }}
        subjectName="Kowalski"
        isGM
        isArchived={false}
        myUserId="gm"
        {...props}
      />
    </ToastProvider>,
  )
}

describe('LinksSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listLinks).mockResolvedValue([worksAt, suspects])
    vi.mocked(api.listLinkTargets).mockResolvedValue([kowalski, morgue, reyes, glove])
    vi.mocked(api.addLink).mockResolvedValue()
    vi.mocked(api.updateLink).mockResolvedValue()
    vi.mocked(api.deleteLink).mockResolvedValue()
    vi.mocked(api.reverseLink).mockResolvedValue()
  })

  it('shows links from both directions, with badges for the GM', async () => {
    renderSection()
    const items = await screen.findAllByRole('listitem')
    expect(api.listLinks).toHaveBeenCalledWith({ type: 'character', id: 'c1' })
    // Sorted by label: "suspects" (incoming) first.
    expect(items[0]).toHaveTextContent('Reyes—suspects→Kowalski')
    expect(items[0]).toHaveTextContent('GM only')
    expect(items[1]).toHaveTextContent('Kowalski—works at→Morgue')
    expect(items[1]).toHaveTextContent('Shown')
  })

  it('shows players their links without GM controls, and nothing when there are none', async () => {
    vi.mocked(api.listLinks).mockResolvedValue([worksAt])
    const { unmount } = renderSection({ isGM: false })
    expect(await screen.findByText('works at')).toBeInTheDocument()
    expect(screen.queryByText('Shown')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument()
    unmount()

    vi.mocked(api.listLinks).mockResolvedValue([])
    renderSection({ isGM: false })
    await waitFor(() => expect(api.listLinks).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('region', { name: 'Links' })).not.toBeInTheDocument()
  })

  it('tells the GM when there are no links yet', async () => {
    vi.mocked(api.listLinks).mockResolvedValue([])
    renderSection()
    expect(await screen.findByText('No links yet.')).toBeInTheDocument()
  })

  it('opens a record end in the open panel, a character end in the Characters panel', async () => {
    const openRecord = vi.fn()
    const opened: string[] = []
    const stop = onCharacterRequest(id => opened.push(id))
    render(
      <ToastProvider>
        <OpenRecordContext.Provider value={openRecord}>
          <LinksSection channelId="ch" subject={{ type: 'character', id: 'c1' }} subjectName="Kowalski" isGM isArchived={false} myUserId="gm" />
        </OpenRecordContext.Provider>
      </ToastProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Morgue' }))
    expect(openRecord).toHaveBeenCalledWith('r1')
    fireEvent.click(screen.getByRole('button', { name: 'Reyes' }))
    expect(opened).toEqual(['c2'])
    stop()
  })

  it('lets the GM add a link in either direction', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Add link' }))
    const form = screen.getByRole('form', { name: 'Add link' })
    const pick = within(form).getByLabelText('Link to')
    await waitFor(() => expect(pick).not.toBeDisabled())
    // The subject itself is not offered; PCs come first.
    const options = within(pick).getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['Choose…', 'Reyes · PC', 'Bloody glove · Clue', 'Morgue · Location'])

    fireEvent.click(within(form).getByRole('button', { name: 'Add link' }))
    expect(await within(form).findByText('Choose what to link to.')).toBeInTheDocument()
    expect(api.addLink).not.toHaveBeenCalled()

    fireEvent.change(pick, { target: { value: 'record:r2' } })
    expect(within(form).getByText('Give the link a label, e.g. "works for".')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Label'), { target: { value: 'found' } })
    expect(within(form).getByTestId('link-preview')).toHaveTextContent('Kowalski — found → Bloody glove')
    fireEvent.click(within(form).getByRole('button', { name: 'Swap direction' }))
    fireEvent.change(within(form).getByLabelText('Who can see it'), { target: { value: 'players' } })
    expect(within(form).getByTestId('link-preview')).toHaveTextContent('Bloody glove — found → Kowalski')
    fireEvent.click(within(form).getByRole('button', { name: 'Add link' }))

    await waitFor(() =>
      expect(api.addLink).toHaveBeenCalledWith({
        channelId: 'ch',
        from: { type: 'record', id: 'r2' },
        to: { type: 'character', id: 'c1' },
        label: 'found',
        visibility: 'players',
        userId: 'gm',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Add link' })).not.toBeInTheDocument())
    expect(api.listLinks).toHaveBeenCalledTimes(2)
  })

  it('keeps the form open and explains a failed add', async () => {
    vi.mocked(api.addLink).mockRejectedValue(new Error('These two are already linked with that label.'))
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Add link' }))
    const form = screen.getByRole('form', { name: 'Add link' })
    await waitFor(() => expect(within(form).getByLabelText('Link to')).not.toBeDisabled())
    fireEvent.change(within(form).getByLabelText('Link to'), { target: { value: 'record:r1' } })
    fireEvent.change(within(form).getByLabelText('Label'), { target: { value: 'works at' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add link' }))
    expect(await screen.findByText('These two are already linked with that label.')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Add link' })).toBeInTheDocument()
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Add link' })).not.toBeInTheDocument()
  })

  it('explains when the targets cannot be loaded', async () => {
    vi.mocked(api.listLinkTargets).mockRejectedValue(new Error('down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Add link' }))
    expect(await screen.findByText("Couldn't load the characters and records.")).toBeInTheDocument()
  })

  it('lets the GM show, hide, relabel and remove links', async () => {
    renderSection()
    const [suspectItem, worksItem] = await screen.findAllByRole('listitem')

    fireEvent.click(within(suspectItem).getByRole('button', { name: 'Show' }))
    await waitFor(() => expect(api.updateLink).toHaveBeenCalledWith('l2', { visibility: 'players' }))
    fireEvent.click(within(worksItem).getByRole('button', { name: 'Hide' }))
    await waitFor(() => expect(api.updateLink).toHaveBeenCalledWith('l1', { visibility: 'gm' }))

    fireEvent.click(within(worksItem).getByRole('button', { name: 'Edit' }))
    const input = within(worksItem).getByLabelText('Link label')
    fireEvent.change(input, { target: { value: ' ' } })
    expect(within(worksItem).getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(input, { target: { value: 'deputy at' } })
    fireEvent.click(within(worksItem).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateLink).toHaveBeenCalledWith('l1', { label: 'deputy at' }))

    fireEvent.click(within(suspectItem).getByRole('button', { name: 'Remove link: Reyes suspects Kowalski' }))
    fireEvent.click(within(suspectItem).getByRole('button', { name: 'Keep' }))
    expect(api.deleteLink).not.toHaveBeenCalled()
    fireEvent.click(within(suspectItem).getByRole('button', { name: 'Remove link: Reyes suspects Kowalski' }))
    fireEvent.click(within(suspectItem).getByRole('button', { name: 'Remove link' }))
    await waitFor(() => expect(api.deleteLink).toHaveBeenCalledWith('l2'))
  })

  it('reverses a link and tells the profile something changed', async () => {
    const onChanged = vi.fn()
    renderSection({ onChanged })
    const [suspectItem] = await screen.findAllByRole('listitem')
    fireEvent.click(within(suspectItem).getByRole('button', { name: 'Reverse link: Reyes suspects Kowalski' }))
    await waitFor(() => expect(api.reverseLink).toHaveBeenCalledWith('l2'))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Link reversed.')).toBeInTheDocument()
  })

  it('explains a failed reverse', async () => {
    vi.mocked(api.reverseLink).mockRejectedValue(new Error('These two are already linked with that label.'))
    const onChanged = vi.fn()
    renderSection({ onChanged })
    const [suspectItem] = await screen.findAllByRole('listitem')
    fireEvent.click(within(suspectItem).getByRole('button', { name: 'Reverse link: Reyes suspects Kowalski' }))
    expect(await screen.findByText('These two are already linked with that label.')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('cancels an edit and skips saving an unchanged label', async () => {
    renderSection()
    const [, worksItem] = await screen.findAllByRole('listitem')
    fireEvent.click(within(worksItem).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(worksItem).getByLabelText('Link label'), { target: { value: 'other' } })
    fireEvent.click(within(worksItem).getByRole('button', { name: 'Cancel' }))
    expect(within(worksItem).getByText('works at')).toBeInTheDocument()
    fireEvent.click(within(worksItem).getByRole('button', { name: 'Edit' }))
    fireEvent.click(within(worksItem).getByRole('button', { name: 'Save' }))
    expect(api.updateLink).not.toHaveBeenCalled()
    expect(within(worksItem).queryByLabelText('Link label')).not.toBeInTheDocument()
  })

  it('has no controls in an archived campaign', async () => {
    renderSection({ isArchived: true })
    await screen.findAllByRole('listitem')
    expect(screen.queryByRole('button', { name: 'Add link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('offers a retry when the links cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.listLinks).mockRejectedValueOnce(new Error('down'))
    renderSection({ isGM: false })
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('works at')).toBeInTheDocument()
  })

  it('asks a signed-out GM to sign in instead of adding', async () => {
    renderSection({ myUserId: undefined })
    fireEvent.click(await screen.findByRole('button', { name: 'Add link' }))
    const form = screen.getByRole('form', { name: 'Add link' })
    await waitFor(() => expect(within(form).getByLabelText('Link to')).not.toBeDisabled())
    fireEvent.change(within(form).getByLabelText('Link to'), { target: { value: 'record:r1' } })
    fireEvent.change(within(form).getByLabelText('Label'), { target: { value: 'knows' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add link' }))
    expect(await screen.findByText('You need to be signed in.')).toBeInTheDocument()
    expect(api.addLink).not.toHaveBeenCalled()
  })
})
