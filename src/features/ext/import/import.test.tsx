import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { supabase } from '../../../lib/supabase'
import type { CampaignSource } from '../sources/sourcesModel'
import * as api from './importApi'
import { ImportSection } from './ImportSection'
import { estimateCost, groupSuggestions, importRangeProblem, isStalled, type ImportRun, type ImportSuggestion } from './importModel'
import { PdfSliceError, slicePdf } from './pdfSlice'

const storage = { download: vi.fn(), upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() }
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn(() => storage) } },
}))

async function makePdf(pages: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 200])
  const bytes = await doc.save()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function mockFrom(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order']) builder[method] = vi.fn(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
  vi.mocked(supabase.from).mockReturnValue(builder as never)
  return builder
}

const source: CampaignSource = { id: 's1', title: 'Op', objectPath: 'ch/op.pdf', fileName: 'op.pdf', sizeBytes: 10, createdAt: '2026-11-25T10:00:00Z' }

describe('slicePdf', () => {
  it('keeps just the chosen pages', async () => {
    const slice = await slicePdf(await makePdf(5), 2, 4)
    expect((await PDFDocument.load(slice)).getPageCount()).toBe(3)
  })

  it('explains ranges past the end and files that are not PDFs', async () => {
    await expect(slicePdf(await makePdf(3), 2, 4)).rejects.toThrow('This PDF has only 3 pages.')
    await expect(slicePdf(await makePdf(1), 1, 2)).rejects.toThrow('This PDF has only 1 page.')
    await expect(slicePdf(await makePdf(3), 3, 2)).rejects.toThrow('The last page must come after the first.')
    await expect(slicePdf(new TextEncoder().encode('not a pdf').buffer as ArrayBuffer, 1, 1)).rejects.toBeInstanceOf(PdfSliceError)
  })
})

describe('importModel', () => {
  it('checks ranges, estimates cost, groups and spots stalled runs', () => {
    expect(importRangeProblem(null, 3)).toBe('Enter the first and last page.')
    expect(importRangeProblem(5, 4)).toBe('The last page must come after the first.')
    expect(importRangeProblem(1, 31)).toBe('Import at most 30 pages at a time.')
    expect(importRangeProblem(1, 12)).toBeNull()
    expect(estimateCost(10)).toBe('about $0.10–$0.25')
    expect(estimateCost(1)).toBe('about $0.01–$0.03')
    const s = (kind: ImportSuggestion['kind'], name: string) => ({ kind, name }) as ImportSuggestion
    expect(groupSuggestions([s('clue', 'Glove'), s('npc', 'Hale'), s('npc', 'Reyes')]).map(g => [g.kind, g.items.length])).toEqual([['npc', 2], ['clue', 1]])
    const run = { status: 'running', createdAt: '2026-11-25T10:00:00Z' } as ImportRun
    expect(isStalled(run, Date.parse('2026-11-25T10:10:00Z'))).toBe(false)
    expect(isStalled(run, Date.parse('2026-11-25T10:20:00Z'))).toBe(true)
    expect(isStalled({ ...run, status: 'done' }, Date.parse('2026-11-25T11:00:00Z'))).toBe(false)
  })
})

describe('importApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-2222-2222-222222222222')
    storage.upload.mockResolvedValue({ data: {}, error: null })
    storage.remove.mockResolvedValue({ data: [], error: null })
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists runs with their suggestion counts, and suggestions with their details', async () => {
    mockFrom({ data: [{ id: 'r1', first_page: 12, last_page: 19, status: 'done', error: null, cost_usd: '0.12', created_at: 't', ext_import_suggestions: [{ count: 3 }] }, { id: 'r2', first_page: 1, last_page: 1, status: 'odd', error: 'x', cost_usd: 0, created_at: 't', ext_import_suggestions: null }] })
    expect(await api.listRuns('s1')).toEqual([
      { id: 'r1', firstPage: 12, lastPage: 19, status: 'done', error: null, costUsd: 0.12, createdAt: 't', suggestionCount: 3, combinedCount: 0 },
      { id: 'r2', firstPage: 1, lastPage: 1, status: 'failed', error: 'x', costUsd: 0, createdAt: 't', suggestionCount: 0, combinedCount: 0 },
    ])

    mockFrom({
      data: [
        { id: 'a', kind: 'npc', name: 'Dr Hale', page: 14, status: 'pending', details: { summary: 'Coroner', fields: [{ key: 'appearance', label: 'Appearance', value: 'Tall' }, { bad: 1 }], possibleDuplicateOf: 'Hale' } },
        { id: 'b', kind: 'link', name: 'works at', page: null, status: 'pending', details: { link: { from: 'Dr Hale', to: 'Morgue', label: 'works at' } } },
        { id: 'c', kind: 'handout', name: 'Letter', page: 15, status: 'weird', details: { handout: { firstPage: 15, lastPage: 16 } } },
        { id: 'd', kind: 'spell', name: 'x', page: null, status: 'pending', details: {} },
        { id: 'e', kind: 'clue', name: 'Glove', page: 2, status: 'pending', details: null },
      ],
    })
    const list = await api.listSuggestions('r1')
    expect(list.map(s => s.id)).toEqual(['a', 'b', 'c', 'e'])
    expect(list[0]).toMatchObject({ summary: 'Coroner', possibleDuplicateOf: 'Hale', fields: [{ key: 'appearance', label: 'Appearance', value: 'Tall' }], link: null, handout: null })
    expect(list[1].link).toEqual({ from: 'Dr Hale', to: 'Morgue', label: 'works at' })
    expect(list[2]).toMatchObject({ handout: { firstPage: 15, lastPage: 16 }, pages: [15], status: 'pending', created: null, checklist: [], handoutArea: null, relatedTo: null, attachedTo: null })
    expect(list[3]).toMatchObject({ summary: '', fields: [] })
  })

  it('cuts, uploads and starts a run; removes the upload when starting fails', async () => {
    storage.download.mockResolvedValue({ data: new Blob([await makePdf(20)]), error: null })
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: { runId: 'r9' }, error: null } as never)
    const stages: string[] = []
    const runId = await api.startImport({ channelId: 'ch', sourceId: 's1', objectPath: 'ch/op.pdf', firstPage: 12, lastPage: 19, onStage: s => stages.push(s) })
    expect(runId).toBe('r9')
    expect(stages).toEqual(['Opening the PDF…', 'Cutting out the pages…', 'Uploading the pages…', 'Starting the import…'])
    expect(storage.download).toHaveBeenCalledWith('ch/op.pdf')
    expect(storage.upload.mock.calls[0][0]).toBe('ch/slice-22222222-2222-2222-2222-222222222222.pdf')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ext-ai-import', {
      body: { channelId: 'ch', sourceId: 's1', firstPage: 12, lastPage: 19, slicePath: 'ch/slice-22222222-2222-2222-2222-222222222222.pdf' },
    })

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ code: 'busy', message: 'Another import is still running.' }), { status: 409 }) } } as never)
    await expect(api.startImport({ channelId: 'ch', sourceId: 's1', objectPath: 'ch/op.pdf', firstPage: 1, lastPage: 2 })).rejects.toMatchObject({ code: 'busy' })
    expect(storage.remove).toHaveBeenCalledWith(['ch/slice-22222222-2222-2222-2222-222222222222.pdf'])

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: {}, error: null } as never)
    await expect(api.startImport({ channelId: 'ch', sourceId: 's1', objectPath: 'ch/op.pdf', firstPage: 1, lastPage: 2 })).rejects.toThrow('The import did not start.')
  })

  it('stops early when the PDF cannot be opened or the pages uploaded', async () => {
    storage.download.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
    await expect(api.startImport({ channelId: 'ch', sourceId: 's1', objectPath: 'x', firstPage: 1, lastPage: 1 })).rejects.toThrow('Object not found')
    storage.download.mockResolvedValueOnce({ data: new Blob([await makePdf(2)]), error: null })
    storage.upload.mockResolvedValueOnce({ data: null, error: { message: 'Payload too large' } })
    await expect(api.startImport({ channelId: 'ch', sourceId: 's1', objectPath: 'x', firstPage: 1, lastPage: 1 })).rejects.toThrow('Payload too large')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('deletes a run', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never)
    await api.deleteRun('r1')
    expect(supabase.rpc).toHaveBeenCalledWith('ext_delete_import_run', { p_run_id: 'r1' })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'This import is still running' } } as never)
    await expect(api.deleteRun('r1')).rejects.toThrow('This import is still running')
  })
})

describe('ImportSection', () => {
  const done: ImportRun = { id: 'r1', firstPage: 12, lastPage: 19, status: 'done', error: null, costUsd: 0.1234, createdAt: '2026-11-25T10:00:00Z', suggestionCount: 3, combinedCount: 2 }
  const failed: ImportRun = { ...done, id: 'r2', status: 'failed', error: 'Claude declined to read these pages.', suggestionCount: 0 }
  const suggestions: ImportSuggestion[] = [
    { id: 'a', kind: 'npc', name: 'Dr Hale', page: 14, summary: 'The coroner.', fields: [{ key: 'appearance', label: 'Appearance', value: 'Tall' }], possibleDuplicateOf: 'Hale', link: null, handout: null, pages: [14], status: 'pending', created: null, checklist: [], handoutArea: null, relatedTo: null, attachedTo: null },
    { id: 'b', kind: 'link', name: 'works at', page: null, summary: '', fields: [], possibleDuplicateOf: null, link: { from: 'Dr Hale', to: 'Morgue', label: 'works at' }, handout: null, pages: [], status: 'pending', created: null, checklist: [], handoutArea: null, relatedTo: null, attachedTo: null },
    { id: 'c', kind: 'handout', name: 'Letter', page: 15, summary: '', fields: [], possibleDuplicateOf: null, link: null, handout: { firstPage: 15, lastPage: 16 }, pages: [15], status: 'pending', created: null, checklist: [], handoutArea: null, relatedTo: null, attachedTo: null },
  ]
  let listRuns: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    listRuns = vi.spyOn(api, 'listRuns').mockResolvedValue([done, failed])
    vi.spyOn(api, 'listSuggestions').mockResolvedValue(suggestions)
    vi.spyOn(api, 'deleteRun').mockResolvedValue()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const renderSection = (props: Partial<Parameters<typeof ImportSection>[0]> = {}) =>
    render(
      <ToastProvider>
        <ImportSection channelId="ch" source={source} canImport canReview onRunEnded={vi.fn()} {...props} />
      </ToastProvider>,
    )

  it('lists runs and shows a finished run\'s suggestions', async () => {
    renderSection()
    const list = await screen.findByRole('list', { name: 'Imports' })
    const [first, second] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('Pages 12–19')
    expect(first).toHaveTextContent('3 suggestions, 2 combined with earlier pages')
    expect(first).toHaveTextContent('$0.12')
    expect(second).toHaveTextContent('Failed')
    expect(second).toHaveTextContent('Claude declined to read these pages.')

    fireEvent.click(within(first).getByRole('button', { name: 'Review' }))
    expect(await within(first).findByText('Dr Hale')).toBeInTheDocument()
    expect(within(first).getByText('Maybe Hale')).toBeInTheDocument()
    expect(within(first).getByText('Dr Hale — works at → Morgue')).toBeInTheDocument()
    expect(within(first).getByText('(pages 15–16)')).toBeInTheDocument()
    expect(within(first).getByText('3 waiting')).toBeInTheDocument()
  })

  it('opens the source at a suggestion\'s page', async () => {
    const tab = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as never)
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x.test/op.pdf' }, error: null })
    renderSection()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Review' }))[0])
    fireEvent.click(await screen.findByRole('button', { name: 'p. 14' }))
    await waitFor(() => expect(tab.location.href).toBe('https://x.test/op.pdf#page=14'))
  })

  it('checks the pages, shows the estimate, and starts an import', async () => {
    const start = vi.spyOn(api, 'startImport').mockImplementation(async ({ onStage }) => {
      onStage?.('Cutting out the pages…')
      return 'r9'
    })
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Import pages with AI' }))
    const form = screen.getByRole('form', { name: 'Import pages' })
    fireEvent.click(within(form).getByRole('button', { name: 'Import' }))
    expect(within(form).getByText('Enter the first and last page.')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('From page'), { target: { value: '12' } })
    fireEvent.change(within(form).getByLabelText('To page'), { target: { value: '50' } })
    expect(within(form).getByText('Import at most 30 pages at a time.')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('To page'), { target: { value: '23' } })
    expect(within(form).getByText(/More than 10 pages: this takes longer/)).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('To page'), { target: { value: '19' } })
    expect(within(form).getByText(/Estimated cost about \$0\.08–\$0\.20\./)).toBeInTheDocument()
    fireEvent.click(within(form).getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'ch', sourceId: 's1', objectPath: 'ch/op.pdf', firstPage: 12, lastPage: 19 })))
    expect(await screen.findByText('Importing pages 12–19. This can take a minute or two.')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Import pages' })).not.toBeInTheDocument()
  })

  it('explains a failed start and keeps the form', async () => {
    vi.spyOn(api, 'startImport').mockRejectedValue(new Error('This PDF has only 3 pages.'))
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Import pages with AI' }))
    const form = screen.getByRole('form', { name: 'Import pages' })
    fireEvent.change(within(form).getByLabelText('From page'), { target: { value: '2' } })
    fireEvent.change(within(form).getByLabelText('To page'), { target: { value: '4' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Import' }))
    expect(await screen.findByText('This PDF has only 3 pages.')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Import pages' })).toBeInTheDocument()
  })

  it('checks a running import until it ends, then reports the run ended', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const running: ImportRun = { ...done, status: 'running', createdAt: new Date().toISOString(), suggestionCount: 0 }
    listRuns.mockResolvedValueOnce([running]).mockResolvedValueOnce([running]).mockResolvedValue([done])
    const onRunEnded = vi.fn()
    renderSection({ onRunEnded })
    expect(await screen.findByText('Reading…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import pages with AI' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100)
    })
    expect(await screen.findByText(/3 suggestions/)).toBeInTheDocument()
    expect(onRunEnded).toHaveBeenCalled()
  })

  it('marks a stalled run and lets the GM remove runs after confirming', async () => {
    const stalled: ImportRun = { ...done, id: 'r3', status: 'running', createdAt: '2020-01-01T00:00:00Z', suggestionCount: 0 }
    listRuns.mockResolvedValue([stalled])
    renderSection()
    expect(await screen.findByText('Stopped')).toBeInTheDocument()
    expect(screen.getByText('This import stopped without finishing. Remove it and try again.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(api.deleteRun).toHaveBeenCalledWith('r3'))
    expect(await screen.findByText('Import removed.')).toBeInTheDocument()
  })

  it('shows nothing to a GM who can\'t import and has no runs, and a retry on errors', async () => {
    listRuns.mockResolvedValue([])
    const { unmount } = renderSection({ canImport: false })
    await waitFor(() => expect(listRuns).toHaveBeenCalled())
    expect(screen.queryByRole('list', { name: 'Imports' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import pages with AI' })).not.toBeInTheDocument()
    unmount()

    vi.spyOn(console, 'error').mockImplementation(() => {})
    listRuns.mockRejectedValueOnce(new Error('down')).mockResolvedValue([done])
    renderSection({ canImport: false, canReview: false })
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Pages 12–19')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import pages with AI' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })
})
