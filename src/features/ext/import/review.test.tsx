// cspell:words Kowalski kowalski summarises
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { supabase } from '../../../lib/supabase'
import { addFile } from '../files/filesApi'
import { onCharacterRequest } from '../npcTags/characterOpener'
import { OpenRecordContext } from '../records/recordOpener'
import type { CampaignSource } from '../sources/sourcesModel'
import * as api from './importApi'
import { approveAllOrder, bigRunNote, mergeTargetKind, reviewSummary, type ImportSuggestion } from './importModel'
import { ReviewList } from './ReviewList'
import { renderPagesAsPng } from './pdfImage'

const storage = { download: vi.fn(), upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() }
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn(() => storage) } },
}))
vi.mock('../files/filesApi', () => ({ addFile: vi.fn() }))
vi.mock('./pdfImage', () => ({ renderPagesAsPng: vi.fn() }))

const source: CampaignSource = { id: 's1', title: 'Silent Creek', objectPath: 'ch/op.pdf', fileName: 'op.pdf', sizeBytes: 10, createdAt: 't' }
const base = {
  page: 2, summary: '', fields: [], possibleDuplicateOf: null, link: null, handout: null, pages: [2], status: 'pending' as const, created: null,
  checklist: [] as string[], handoutArea: null, relatedTo: null, attachedTo: null,
}
const hale: ImportSuggestion = { ...base, id: 'a', kind: 'npc', name: 'Dr Ada Hale', summary: 'The coroner.', fields: [{ key: 'appearance', label: 'Appearance', value: 'Grey suit.' }], pages: [2, 11] }
const morgue: ImportSuggestion = { ...base, id: 'b', kind: 'location', name: 'County morgue' }
const worksAt: ImportSuggestion = { ...base, id: 'c', kind: 'link', name: 'works at', link: { from: 'Dr Ada Hale', to: 'County morgue', label: 'works at' } }
const letter: ImportSuggestion = { ...base, id: 'd', kind: 'handout', name: 'Ortiz letter', page: 3, handout: { firstPage: 3, lastPage: 3 }, pages: [3] }
const kowalski: ImportSuggestion = { ...base, id: 'e', kind: 'npc', name: 'Ray Kowalski', possibleDuplicateOf: 'Deputy Kowalski' }

async function makePdf(pages: number): Promise<Blob> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 200])
  return new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>])
}

describe('review model', () => {
  it('orders "approve all" safely and leaves possible duplicates out', () => {
    expect(approveAllOrder([letter, worksAt, kowalski, hale, morgue]).map(s => s.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(approveAllOrder([{ ...hale, status: 'approved' }])).toEqual([])
  })

  it('summarises a run and knows what can be merged', () => {
    expect(reviewSummary([hale, { ...morgue, status: 'approved' }, { ...letter, status: 'merged' }, { ...worksAt, status: 'rejected' }])).toBe('1 waiting · 2 added · 1 rejected')
    expect(reviewSummary([])).toBe('')
    expect(mergeTargetKind('npc')).toBe('character')
    expect(mergeTargetKind('clue')).toBe('record')
    expect(mergeTargetKind('link')).toBeNull()
    expect(bigRunNote(10)).toBeNull()
    expect(bigRunNote(12)).toMatch(/More than 10 pages/)
  })
})

describe('review calls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('approves, merges and rejects through the database functions', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { type: 'character', id: 'c1' }, error: null } as never)
    expect(await api.approveSuggestion('a')).toEqual({ type: 'character', id: 'c1' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_approve_suggestion', { p_suggestion_id: 'a' })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { type: 'record', id: 'r1' }, error: null } as never)
    await api.approveSuggestion('b', { name: 'Morgue', fields: [] })
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_approve_suggestion', { p_suggestion_id: 'b', p_name: 'Morgue', p_fields: [] })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 2, error: null } as never)
    expect(await api.mergeSuggestion('a', { type: 'character', id: 'c9' })).toBe(2)
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_merge_suggestion', { p_suggestion_id: 'a', p_character_id: 'c9' })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 1, error: null } as never)
    await api.mergeSuggestion('b', { type: 'record', id: 'r9' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_merge_suggestion', { p_suggestion_id: 'b', p_record_id: 'r9' })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never)
    await api.setSuggestionRejected('a', true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('ext_set_suggestion_rejected', { p_suggestion_id: 'a', p_rejected: true })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Add or approve "County morgue" first' } } as never)
    await expect(api.approveSuggestion('c')).rejects.toThrow('Add or approve "County morgue" first')
  })

  it('lists what can be merged into', async () => {
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) builder[m] = vi.fn(() => builder)
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'x', name: 'Morgue' }], error: null }).then(resolve)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    expect(await api.listMergeTargets('ch', 'location')).toEqual([{ type: 'record', id: 'x', name: 'Morgue' }])
    expect(supabase.from).toHaveBeenLastCalledWith('ext_records')
    expect(builder.eq).toHaveBeenCalledWith('kind', 'location')
    expect(await api.listMergeTargets('ch', 'npc')).toEqual([{ type: 'character', id: 'x', name: 'Morgue' }])
    expect(supabase.from).toHaveBeenLastCalledWith('ext_characters')
  })

  it('turns a handout into a picture in Files → Handouts, attached to its record', async () => {
    storage.download.mockResolvedValue({ data: await makePdf(5), error: null })
    vi.mocked(addFile).mockResolvedValue('f1')
    vi.mocked(renderPagesAsPng).mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'Muddy glove', error: null } as never)
    const area = { left: 0.1, top: 0.2, width: 0.5, height: 0.5 }
    const result = await api.approveHandout({ channelId: 'ch', sourceObjectPath: 'ch/op.pdf', sourceTitle: 'Silent Creek', suggestion: { id: 'd', name: 'Ortiz letter!', summary: 'A worried note.', handout: { firstPage: 3, lastPage: 3 }, handoutArea: area } })
    expect(result).toEqual({ fileId: 'f1', attachedTo: 'Muddy glove', asPicture: true })
    expect(vi.mocked(renderPagesAsPng).mock.calls[0].slice(1)).toEqual([3, 3, area])
    const [, picture, pictureDetails] = vi.mocked(addFile).mock.calls[0]
    expect(picture.name).toBe('Ortiz-letter.png')
    expect(picture.type).toBe('image/png')
    expect(pictureDetails).toMatchObject({ folder: 'Handouts', visibility: 'gm', description: 'A worried note. From Silent Creek, p. 3.' })
  })

  it('falls back to the pages as a PDF when no picture can be made', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    storage.download.mockResolvedValue({ data: await makePdf(5), error: null })
    vi.mocked(addFile).mockResolvedValue('f1')
    vi.mocked(renderPagesAsPng).mockRejectedValue(new Error('no canvas'))
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    const result = await api.approveHandout({ channelId: 'ch', sourceObjectPath: 'ch/op.pdf', sourceTitle: 'Silent Creek', suggestion: { id: 'd', name: 'Ortiz letter!', summary: 'A worried note.', handout: { firstPage: 3, lastPage: 4 } } })
    expect(result).toEqual({ fileId: 'f1', attachedTo: null, asPicture: false })
    const [channel, file, details] = vi.mocked(addFile).mock.calls[0]
    expect(channel).toBe('ch')
    expect(file.name).toBe('Ortiz-letter.pdf')
    expect((await PDFDocument.load(await file.arrayBuffer())).getPageCount()).toBe(2)
    expect(details).toEqual({ title: 'Ortiz letter!', description: 'A worried note. From Silent Creek, pp. 3–4.', folder: 'Handouts', visibility: 'gm', playerIds: [] })
    expect(supabase.rpc).toHaveBeenCalledWith('ext_finish_handout_suggestion', { p_suggestion_id: 'd', p_file_id: 'f1' })
  })
})

describe('ReviewList', () => {
  let list: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.clearAllMocks()
    list = vi.spyOn(api, 'listSuggestions').mockResolvedValue([hale, morgue, worksAt, letter, kowalski])
    vi.spyOn(api, 'approveSuggestion').mockResolvedValue({ type: 'character', id: 'c1' })
    vi.spyOn(api, 'mergeSuggestion').mockResolvedValue(1)
    vi.spyOn(api, 'setSuggestionRejected').mockResolvedValue()
    vi.spyOn(api, 'approveHandout').mockResolvedValue({ fileId: 'f1', attachedTo: 'County morgue', asPicture: true })
    vi.spyOn(api, 'listMergeTargets').mockResolvedValue([
      { type: 'character', id: 'k1', name: 'Deputy Kowalski' },
      { type: 'character', id: 'h1', name: 'Hale' },
    ])
  })
  afterEach(() => vi.restoreAllMocks())

  const renderList = (canReview = true, openRecord: ((id: string) => void) | null = null) =>
    render(
      <ToastProvider>
        <OpenRecordContext.Provider value={openRecord}>
          <ReviewList runId="r1" channelId="ch" source={source} canReview={canReview} />
        </OpenRecordContext.Provider>
      </ToastProvider>,
    )
  const item = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement

  it('shows each suggestion with its pages, and approves one', async () => {
    renderList()
    expect(await screen.findByText('5 waiting')).toBeInTheDocument()
    const row = await item('Dr Ada Hale')
    expect(within(row).getByRole('button', { name: 'p. 2' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'p. 11' })).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.approveSuggestion).toHaveBeenCalledWith('a', undefined))
    expect(await screen.findByText('Added.')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('edits before approving', async () => {
    renderList()
    fireEvent.click(within(await item('County morgue')).getByRole('button', { name: 'Edit first' }))
    const form = screen.getByRole('form', { name: 'Edit County morgue' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: ' ' } })
    expect(within(form).getByText('Give it a name.')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'The morgue' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.approveSuggestion).toHaveBeenCalledWith('b', { name: 'The morgue', fields: [] }))

    fireEvent.click(within(await item('Dr Ada Hale')).getByRole('button', { name: 'Edit first' }))
    const haleForm = screen.getByRole('form', { name: 'Edit Dr Ada Hale' })
    fireEvent.change(within(haleForm).getByLabelText('Appearance'), { target: { value: 'Charcoal suit.' } })
    fireEvent.click(within(haleForm).getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(api.approveSuggestion).toHaveBeenLastCalledWith('a', { name: 'Dr Ada Hale', fields: [{ key: 'appearance', label: 'Appearance', value: 'Charcoal suit.' }] }),
    )
    fireEvent.click(within(await item('County morgue')).getByRole('button', { name: 'Edit first' }))
    fireEvent.click(within(screen.getByRole('form', { name: 'Edit County morgue' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Edit County morgue' })).not.toBeInTheDocument()
  })

  it('merges a possible duplicate into the existing NPC it names', async () => {
    renderList()
    const row = await item('Ray Kowalski')
    expect(within(row).getByText('Maybe Deputy Kowalski')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Merge into…' }))
    const form = screen.getByRole('form', { name: 'Merge Ray Kowalski' })
    await waitFor(() => expect(within(form).getByLabelText('Merge into')).toHaveValue('k1'))
    fireEvent.click(within(form).getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(api.mergeSuggestion).toHaveBeenCalledWith('e', { type: 'character', id: 'k1', name: 'Deputy Kowalski' }))
    expect(await screen.findByText('Merged into Deputy Kowalski. Only empty or missing fields were filled.')).toBeInTheDocument()
  })

  it('explains when there is nothing to merge into', async () => {
    vi.mocked(api.listMergeTargets).mockResolvedValue([])
    renderList()
    fireEvent.click(within(await item('County morgue')).getByRole('button', { name: 'Merge into…' }))
    expect(await screen.findByText('There is nothing of this kind to merge into yet.')).toBeInTheDocument()
  })

  it('rejects, undoes, and adds handouts to Files', async () => {
    list.mockResolvedValue([hale, { ...morgue, status: 'rejected' }, letter])
    renderList()
    fireEvent.click(within(await item('Dr Ada Hale')).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(api.setSuggestionRejected).toHaveBeenCalledWith('a', true))
    fireEvent.click(within(await item('County morgue')).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.setSuggestionRejected).toHaveBeenCalledWith('b', false))
    fireEvent.click(within(await item('Ortiz letter')).getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(api.approveHandout).toHaveBeenCalledWith({
        channelId: 'ch', sourceObjectPath: 'ch/op.pdf', sourceTitle: 'Silent Creek',
        suggestion: { id: 'd', name: 'Ortiz letter', summary: '', handout: { firstPage: 3, lastPage: 3 }, handoutArea: null },
      }),
    )
    expect(await screen.findByText('Picture added to Files → Handouts, attached to County morgue.')).toBeInTheDocument()
  })

  it('approves everything waiting in a safe order, leaving duplicates and reporting problems', async () => {
    vi.mocked(api.approveSuggestion).mockImplementation(async id => {
      if (id === 'c') throw new Error('Add or approve "County morgue" first')
      return { type: 'record', id: 'x' }
    })
    renderList()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve all waiting (4)' }))
    await waitFor(() => expect(api.approveHandout).toHaveBeenCalled())
    expect(vi.mocked(api.approveSuggestion).mock.calls.map(c => c[0])).toEqual(['a', 'b', 'c'])
    expect(await screen.findByText(/Added 3\. 1 possible duplicate left for you to decide; Dr Ada Hale — works at → County morgue: Add or approve "County morgue" first\./)).toBeInTheDocument()
  })

  it('shows what was added and opens it', async () => {
    const openRecord = vi.fn()
    const openedCharacters: string[] = []
    const stop = onCharacterRequest(id => openedCharacters.push(id))
    list.mockResolvedValue([
      { ...hale, status: 'approved', created: { type: 'character', id: 'c1' } },
      { ...morgue, status: 'merged', created: { type: 'record', id: 'r1' } },
      { ...letter, status: 'approved', created: { type: 'file', id: 'f1' } },
    ])
    renderList(true, openRecord)
    const haleRow = await item('Dr Ada Hale')
    expect(within(haleRow).getByText('Added')).toBeInTheDocument()
    fireEvent.click(within(haleRow).getByRole('button', { name: 'Open' }))
    expect(openedCharacters).toEqual(['c1'])
    const morgueRow = await item('County morgue')
    expect(within(morgueRow).getByText('Merged')).toBeInTheDocument()
    fireEvent.click(within(morgueRow).getByRole('button', { name: 'Open' }))
    expect(openRecord).toHaveBeenCalledWith('r1')
    expect(within(await item('Ortiz letter')).getByText('In Files → Handouts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Approve all/ })).not.toBeInTheDocument()
    stop()
  })

  it('reports a failed approval, a load error, and no controls in an archived campaign', async () => {
    vi.mocked(api.approveSuggestion).mockRejectedValueOnce(new Error('This suggestion has already been dealt with'))
    const { unmount } = renderList()
    fireEvent.click(within(await item('County morgue')).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('This suggestion has already been dealt with')).toBeInTheDocument()
    unmount()

    renderList(false)
    await item('Dr Ada Hale')
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Approve all/ })).not.toBeInTheDocument()
  })

  it('shows a clue checklist and the record a handout belongs to', async () => {
    list.mockResolvedValue([
      { ...base, id: 'g', kind: 'clue', name: 'Muddy glove', checklist: ['The glove came from the quarry', 'Hale handled it'] },
      { ...letter, relatedTo: 'Muddy glove' },
      { ...letter, id: 'h', name: 'Old letter', status: 'approved', created: { type: 'file', id: 'f1' }, attachedTo: 'Muddy glove' },
    ])
    renderList()
    const glove = await item('Muddy glove')
    expect(within(glove).getByText('GM checklist:')).toBeInTheDocument()
    expect(within(glove).getByText('Hale handled it')).toBeInTheDocument()
    fireEvent.click(within(glove).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Added, with 2 checklist points.')).toBeInTheDocument()
    expect(within(await item('Ortiz letter')).getByText('Belongs to Muddy glove (attached when you approve, if it exists)')).toBeInTheDocument()
    expect(within(await item('Old letter')).getByText('In Files → Handouts, on Muddy glove')).toBeInTheDocument()
  })

  it('offers a retry when suggestions cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockRejectedValueOnce(new Error('down'))
    renderList()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Dr Ada Hale')).toBeInTheDocument()
  })
})
