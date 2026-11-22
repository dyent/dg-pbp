// cspell:words organisation organisations
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import * as characterApi from '../characters/characterApi'
import * as api from './recordApi'
import { CaseFileEntry } from './CaseFileEntry'
import { CaseFilePanel } from './CaseFilePanel'
import type { CampaignRecord, RecordField } from './recordModel'

vi.mock('./recordApi', () => ({
  listRecords: vi.fn(),
  listRecordFields: vi.fn(),
  listRecordEvents: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  setRecordVisibility: vi.fn(),
  saveRecordFields: vi.fn(),
  setRecordTags: vi.fn(),
}))
vi.mock('../characters/characterApi', () => ({ listTags: vi.fn(), createTag: vi.fn() }))
vi.mock('../activity/activityApi', () => ({ POSTS_PAGE: 50, listRoomNames: vi.fn(async () => new Map()) }))
vi.mock('./recordActivityApi', () => ({
  listRecordAliases: vi.fn(async () => []),
  setRecordAliases: vi.fn(async () => undefined),
  listRecordPosts: vi.fn(async () => []),
  listRecordNotes: vi.fn(async () => []),
  addRecordNote: vi.fn(async () => undefined),
  updateRecordNote: vi.fn(async () => undefined),
  deleteRecordNote: vi.fn(async () => undefined),
}))
vi.mock('../../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadEnabled: true, settingsLoading: false, uploading: false, uploadImage: vi.fn() }),
}))

const morgue: CampaignRecord = {
  id: 'r1', kind: 'location', name: 'Morgue', pictureUrl: null, provenance: 'canon',
  visibility: 'selected', updatedAt: 't', tagIds: ['t1'], sharedWith: ['u1'],
}
const glove: CampaignRecord = { ...morgue, id: 'r2', kind: 'clue', name: 'Bloody glove', visibility: 'gm', tagIds: [], sharedWith: [] }
const fields: RecordField[] = [
  { id: 'f1', recordId: 'r1', itemType: 'field', fieldKey: 'description', label: 'Description', body: 'Cold and tiled.', visibility: 'players', private: false, sortOrder: 10 },
  { id: 'f2', recordId: 'r1', itemType: 'field', fieldKey: 'address', label: 'Address / where', body: '', visibility: 'players', private: false, sortOrder: 20 },
  { id: 'f3', recordId: 'r1', itemType: 'field', fieldKey: 'gm_notes', label: 'GM notes', body: 'Pete takes bribes.', visibility: 'gm', private: false, sortOrder: 90 },
]
const players = [
  { userId: 'u1', name: 'Sam' },
  { userId: 'u2', name: 'Jo' },
]
const nameOf = (id: string) => ({ u1: 'Sam', u2: 'Jo' })[id] ?? id

function renderPanel(props: Partial<React.ComponentProps<typeof CaseFilePanel>> = {}) {
  const all = { channelId: 'ch', isGM: true, isArchived: false, myUserId: 'gm', players, nameOf, onClose: vi.fn(), ...props }
  render(
    <ToastProvider>
      <CaseFilePanel {...all} />
    </ToastProvider>,
  )
  return all
}

describe('Case file', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listRecords).mockResolvedValue([morgue, glove])
    vi.mocked(api.listRecordFields).mockResolvedValue(fields)
    vi.mocked(api.listRecordEvents).mockResolvedValue([
      { id: 'e1', eventType: 'visibility_changed', details: { from: 'gm', to: 'selected', added: ['u1'] }, actorId: 'gm', createdAt: '2026-11-22T10:00:00Z' },
    ])
    vi.mocked(characterApi.listTags).mockResolvedValue([{ id: 't1', name: 'Hollow Creek' }])
    for (const fn of [api.updateRecord, api.deleteRecord, api.setRecordVisibility, api.saveRecordFields, api.setRecordTags]) {
      vi.mocked(fn).mockResolvedValue(undefined)
    }
  })

  it('lists records by kind and opens one with every field and the history (GM)', async () => {
    renderPanel()
    expect(within(await screen.findByRole('region', { name: 'Locations' })).getByText('Morgue')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Clues' })).getByText('Bloody glove')).toBeInTheDocument()
    expect(screen.getAllByText('Hidden').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Morgue'))
    expect(await screen.findByText('Pete takes bribes.')).toBeInTheDocument()
    expect(screen.getByText('Cold and tiled.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hollow Creek' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(await screen.findByText('Shared: GM only → Chosen players; added Sam.')).toBeInTheDocument()
  })

  it('filters by search, kind and tag', async () => {
    renderPanel()
    await screen.findByText('Morgue')
    fireEvent.change(screen.getByLabelText('Show kind'), { target: { value: 'clue' } })
    expect(screen.queryByText('Morgue')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Show kind'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('Show tag'), { target: { value: 't1' } })
    expect(screen.queryByText('Bloody glove')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search the case file'), { target: { value: 'zzz' } })
    expect(screen.getByText('No records match.')).toBeInTheDocument()
  })

  it('shows players only what they were shown, without GM controls', async () => {
    vi.mocked(api.listRecords).mockResolvedValue([morgue])
    vi.mocked(api.listRecordFields).mockResolvedValue(fields.filter(f => f.visibility === 'players'))
    renderPanel({ isGM: false, myUserId: 'u1' })
    fireEvent.click(await screen.findByText('Morgue'))
    expect(await screen.findByText('Cold and tiled.')).toBeInTheDocument()
    expect(screen.queryByText('Address / where')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByText('Who can see it')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Show tag')).not.toBeInTheDocument()
    expect(api.listRecordEvents).not.toHaveBeenCalled()
    expect(characterApi.listTags).not.toHaveBeenCalled()
  })

  it('tells players when nothing has been shared and the GM how to start', async () => {
    vi.mocked(api.listRecords).mockResolvedValue([])
    renderPanel({ isGM: false })
    expect(await screen.findByText('Nothing has been added to your case file yet.')).toBeInTheDocument()
  })

  it('creates a record of the chosen kind, which then opens', async () => {
    vi.mocked(api.createRecord).mockResolvedValue('r3')
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '+ New record' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('The record needs a name.')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Organisation'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'The Fellowship' } })
    vi.mocked(api.listRecords).mockResolvedValue([morgue, glove, { ...glove, id: 'r3', kind: 'organisation', name: 'The Fellowship' }])
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.createRecord).toHaveBeenCalledWith('ch', 'organisation', 'The Fellowship', 'gm'))
    expect(await screen.findByRole('heading', { name: 'The Fellowship' })).toBeInTheDocument()
  })

  it('reports a failed create in the form', async () => {
    vi.mocked(api.createRecord).mockRejectedValue(new Error('Database said no'))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '+ New record' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Database said no')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Choose a record to open it.')).toBeInTheDocument()
  })

  it('edits name and fields, saving only what changed', async () => {
    renderPanel()
    fireEvent.click(await screen.findByText('Morgue'))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.queryByLabelText('Who sees GM notes')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'County morgue' } })
    fireEvent.change(screen.getByLabelText('Description text'), { target: { value: 'Colder now.' } })
    fireEvent.change(screen.getByLabelText('Who sees Address / where'), { target: { value: 'gm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalledWith('r1', { name: 'County morgue', picture_url: null }))
    const changes = vi.mocked(api.saveRecordFields).mock.calls[0][2]
    expect(changes.updates.find(u => u.id === 'f1')?.patch).toEqual({ body: 'Colder now.' })
    expect(changes.updates.find(u => u.id === 'f2')?.patch).toMatchObject({ visibility: 'gm' })
    expect(changes.inserts).toEqual([])
    expect(changes.deletes).toEqual([])
    expect(await screen.findByText('Record saved.')).toBeInTheDocument()
  })

  it('checks the edit before saving and can be cancelled', async () => {
    renderPanel()
    fireEvent.click(await screen.findByText('Morgue'))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The record needs a name.')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Morgue' } })
    fireEvent.click(screen.getAllByRole('button', { name: '+ Heading' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Remove New heading' }))
    fireEvent.click(screen.getAllByRole('button', { name: '+ Field' })[1])
    fireEvent.change(screen.getAllByLabelText('Field title').at(-1)!, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Every field and heading needs a title.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.saveRecordFields).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('changes who can see a record', async () => {
    renderPanel()
    fireEvent.click(await screen.findByText('Bloody glove'))
    const sharing = (await screen.findByText('Who can see it')).closest('fieldset')!
    fireEvent.click(within(sharing).getByText('Chosen players'))
    fireEvent.click(within(sharing).getByRole('button', { name: 'Save sharing' }))
    expect(within(sharing).getByRole('alert')).toHaveTextContent('Tick at least one player')
    fireEvent.click(within(sharing).getByLabelText('Jo'))
    fireEvent.click(within(sharing).getByRole('button', { name: 'Save sharing' }))
    await waitFor(() => expect(api.setRecordVisibility).toHaveBeenCalledWith('r2', 'selected', ['u2']))
    fireEvent.click(within(sharing).getByText('All players'))
    fireEvent.click(within(sharing).getByRole('button', { name: 'Save sharing' }))
    await waitFor(() => expect(api.setRecordVisibility).toHaveBeenLastCalledWith('r2', 'players', []))
  })

  it('reports a failed sharing change', async () => {
    vi.mocked(api.setRecordVisibility).mockRejectedValue(new Error('Only the GM can share records'))
    renderPanel()
    fireEvent.click(await screen.findByText('Bloody glove'))
    fireEvent.click(await screen.findByText('All players'))
    fireEvent.click(screen.getByRole('button', { name: 'Save sharing' }))
    expect(await screen.findByText('Only the GM can share records')).toBeInTheDocument()
  })

  it('adds, removes and creates tags', async () => {
    vi.mocked(characterApi.createTag).mockResolvedValue({ id: 't2', name: 'Suspect' })
    renderPanel()
    fireEvent.click(await screen.findByText('Morgue'))
    fireEvent.click(await screen.findByRole('button', { name: 'Hollow Creek' }))
    await waitFor(() => expect(api.setRecordTags).toHaveBeenCalledWith('r1', [], ['t1']))
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'Suspect' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    await waitFor(() => expect(api.setRecordTags).toHaveBeenLastCalledWith('r1', ['t2'], []))
    expect(characterApi.createTag).toHaveBeenCalledWith('ch', 'Suspect')
  })

  it('reports a tag that could not be created', async () => {
    vi.mocked(characterApi.createTag).mockRejectedValue(new Error('Tag name taken'))
    renderPanel()
    fireEvent.click(await screen.findByText('Bloody glove'))
    fireEvent.change(await screen.findByLabelText('New tag'), { target: { value: 'Clue' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    expect(await screen.findByText('Tag name taken')).toBeInTheDocument()
    expect(api.setRecordTags).not.toHaveBeenCalled()
  })

  it('deletes a record after confirming', async () => {
    renderPanel()
    fireEvent.click(await screen.findByText('Bloody glove'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete clue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete clue' }))
    vi.mocked(api.listRecords).mockResolvedValue([morgue])
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }))
    await waitFor(() => expect(api.deleteRecord).toHaveBeenCalledWith('r2'))
    expect(await screen.findByText('Bloody glove deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Bloody glove' })).not.toBeInTheDocument())
  })

  it('keeps the record when deleting fails', async () => {
    vi.mocked(api.deleteRecord).mockRejectedValue(new Error('Campaign is archived'))
    renderPanel()
    fireEvent.click(await screen.findByText('Bloody glove'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete clue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }))
    expect(await screen.findByText('Campaign is archived')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete clue' })).toBeInTheDocument()
  })

  it('offers a retry when loading fails, and nothing to change in an archived campaign', async () => {
    vi.mocked(api.listRecords).mockRejectedValueOnce(new Error('offline'))
    renderPanel({ isArchived: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    fireEvent.click(await screen.findByText('Morgue'))
    expect(await screen.findByText('Cold and tiled.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ New record' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('offers a retry when a record fails to load', async () => {
    vi.mocked(api.listRecordFields).mockRejectedValueOnce(new Error('offline'))
    renderPanel()
    fireEvent.click(await screen.findByText('Morgue'))
    expect(await screen.findByText("Couldn't load this record.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Cold and tiled.')).toBeInTheDocument()
  })

  it('opens from the sidebar entry with the campaign players, and closes', async () => {
    render(
      <ToastProvider>
        <CaseFileEntry
          channelId="ch"
          isGM
          isArchived={false}
          gmId="gm"
          myUserId="gm"
          members={[
            { user_id: 'gm', character_name: 'GM', is_blocked: false },
            { user_id: 'u1', character_name: 'Sam', is_blocked: false },
            { user_id: 'u3', character_name: 'Blocked', is_blocked: true },
          ]}
          className="item"
        />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Case file' }))
    fireEvent.click(await screen.findByText('Bloody glove'))
    fireEvent.click(await screen.findByText('Chosen players'))
    expect(screen.getByLabelText('Sam')).toBeInTheDocument()
    expect(screen.queryByLabelText('Blocked')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close case file' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
