import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { supabase } from '../../../lib/supabase'
import * as api from './sourcesApi'
import {
  parsePage,
  sortSources,
  sourceFileProblem,
  sourcePathFor,
  sourceTitleProblem,
  titleFromFileName,
  type CampaignSource,
} from './sourcesModel'
import { SourcesView } from './SourcesView'

const storage = { upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() }

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn(() => storage) } },
}))

function mockFrom(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
  vi.mocked(supabase.from).mockReturnValue(builder as never)
  return builder
}

const row = { id: 's1', title: 'Last Things Last', object_path: 'ch/a.pdf', file_name: 'ltl.pdf', size_bytes: 2_500_000, created_at: '2026-11-25T10:00:00Z' }
const pdf = new File(['%PDF'], 'last-things_last.pdf', { type: 'application/pdf' })

describe('sourcesModel', () => {
  it('accepts PDFs up to 50 MB only', () => {
    expect(sourceFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull()
    expect(sourceFileProblem({ name: 'a.pdf', type: '', size: 10 })).toBeNull()
    expect(sourceFileProblem({ name: 'a.png', type: 'image/png', size: 10 })).toBe('Sources must be PDF files.')
    expect(sourceFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 51 * 1024 * 1024 })).toBe('Sources can be at most 50 MB.')
    expect(sourceFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toBe('That file is empty.')
  })

  it('checks titles, suggests one from the file name, and reads page numbers', () => {
    expect(sourceTitleProblem('  ')).toBe('Give the source a title.')
    expect(sourceTitleProblem('x'.repeat(121))).toBe('Titles can be at most 120 characters.')
    expect(sourceTitleProblem('Fine')).toBeNull()
    expect(titleFromFileName('last-things__last.PDF')).toBe('last things last')
    expect(parsePage(' 12 ')).toBe(12)
    expect(parsePage('0')).toBeNull()
    expect(parsePage('1.5')).toBeNull()
    expect(parsePage('abc')).toBeNull()
    expect(sourcePathFor('ch', 'id')).toBe('ch/id.pdf')
  })

  it('sorts by title', () => {
    const s = (title: string) => ({ id: title, title }) as CampaignSource
    expect(sortSources([s('b'), s('A'), s('c')]).map(x => x.title)).toEqual(['A', 'b', 'c'])
  })
})

describe('sourcesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-3333-4444-555555555555')
    storage.upload.mockResolvedValue({ data: {}, error: null })
    storage.remove.mockResolvedValue({ data: [], error: null })
  })

  it('lists sources as app objects', async () => {
    const builder = mockFrom({ data: [row] })
    expect(await api.listSources('ch')).toEqual([
      { id: 's1', title: 'Last Things Last', objectPath: 'ch/a.pdf', fileName: 'ltl.pdf', sizeBytes: 2_500_000, createdAt: '2026-11-25T10:00:00Z' },
    ])
    expect(builder.eq).toHaveBeenCalledWith('channel_id', 'ch')
  })

  it('uploads, then registers; removes the upload if registering fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 's1', error: null } as never)
    await api.addSource('ch', ' LTL ', pdf)
    expect(storage.upload).toHaveBeenCalledWith('ch/11111111-2222-3333-4444-555555555555.pdf', pdf, { contentType: 'application/pdf', upsert: false })
    expect(supabase.rpc).toHaveBeenCalledWith('ext_add_source', {
      p_channel_id: 'ch', p_title: 'LTL', p_object_path: 'ch/11111111-2222-3333-4444-555555555555.pdf', p_file_name: 'last-things_last.pdf',
    })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Only the GM can manage sources' } } as never)
    await expect(api.addSource('ch', 'LTL', pdf)).rejects.toThrow('Only the GM can manage sources')
    expect(storage.remove).toHaveBeenCalledWith(['ch/11111111-2222-3333-4444-555555555555.pdf'])
  })

  it('stops when the upload fails', async () => {
    storage.upload.mockResolvedValueOnce({ data: null, error: { message: 'The object exceeded the maximum allowed size' } })
    await expect(api.addSource('ch', 'LTL', pdf)).rejects.toThrow('maximum allowed size')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('renames, deletes (then removes the PDF) and makes page links', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'ch/a.pdf', error: null } as never)
    await api.renameSource('s1', ' New ')
    expect(supabase.rpc).toHaveBeenCalledWith('ext_rename_source', { p_source_id: 's1', p_title: 'New' })
    await api.deleteSource('s1')
    expect(supabase.rpc).toHaveBeenCalledWith('ext_delete_source', { p_source_id: 's1' })
    expect(storage.remove).toHaveBeenCalledWith(['ch/a.pdf'])

    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x.test/a.pdf?token=t' }, error: null })
    expect(await api.sourceLink('ch/a.pdf', 12)).toBe('https://x.test/a.pdf?token=t#page=12')
    expect(await api.sourceLink('ch/a.pdf')).toBe('https://x.test/a.pdf?token=t')
    storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    await expect(api.sourceLink('ch/a.pdf')).rejects.toThrow('Object not found')
  })
})

describe('SourcesView', () => {
  const tab = { location: { href: '' }, close: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    tab.location.href = ''
    vi.spyOn(window, 'open').mockReturnValue(tab as never)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-3333-4444-555555555555')
    storage.upload.mockResolvedValue({ data: {}, error: null })
    storage.remove.mockResolvedValue({ data: [], error: null })
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x.test/a.pdf?token=t' }, error: null })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'ch/a.pdf', error: null } as never)
    mockFrom({ data: [row] })
  })
  afterEach(() => vi.restoreAllMocks())

  const renderView = (isArchived = false) =>
    render(
      <ToastProvider>
        <SourcesView channelId="ch" isArchived={isArchived} />
      </ToastProvider>,
    )

  it('lists sources and opens one at a page', async () => {
    renderView()
    const item = (await screen.findByText('Last Things Last')).closest('li') as HTMLElement
    expect(item).toHaveTextContent('ltl.pdf · 2.4 MB')
    fireEvent.change(within(item).getByLabelText('Page'), { target: { value: 'x' } })
    expect(within(item).getByText('Enter a page number, or leave it empty for page 1.')).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: 'Open' })).toBeDisabled()
    fireEvent.change(within(item).getByLabelText('Page'), { target: { value: '14' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(tab.location.href).toBe('https://x.test/a.pdf?token=t#page=14'))
    expect(window.open).toHaveBeenCalledWith('', '_blank')
  })

  it('closes the blank tab and explains when a link cannot be made', async () => {
    storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(await screen.findByText('Object not found')).toBeInTheDocument()
    expect(tab.close).toHaveBeenCalled()
  })

  it('adds a source with a title taken from the file name', async () => {
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a source' }))
    const form = screen.getByRole('form', { name: 'Add a source' })
    fireEvent.click(within(form).getByRole('button', { name: 'Add source' }))
    expect(within(form).getByText('Choose a PDF.')).toBeInTheDocument()

    fireEvent.change(within(form).getByLabelText('Adventure PDF (up to 50 MB)'), { target: { files: [new File(['x'], 'map.png', { type: 'image/png' })] } })
    expect(within(form).getAllByText('Sources must be PDF files.').length).toBeGreaterThan(0)

    fireEvent.change(within(form).getByLabelText('Adventure PDF (up to 50 MB)'), { target: { files: [pdf] } })
    expect(within(form).getByLabelText('Title')).toHaveValue('last things last')
    fireEvent.click(within(form).getByRole('button', { name: 'Add source' }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('ext_add_source', expect.objectContaining({ p_title: 'last things last' })))
    expect(await screen.findByText('Source added.')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Add a source' })).not.toBeInTheDocument()
  })

  it('renames and deletes after confirming', async () => {
    renderView()
    const item = (await screen.findByText('Last Things Last')).closest('li') as HTMLElement
    fireEvent.click(within(item).getByRole('button', { name: 'Rename' }))
    fireEvent.change(within(item).getByLabelText('Source title'), { target: { value: ' ' } })
    expect(within(item).getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(within(item).getByLabelText('Source title'), { target: { value: 'LTL 2nd ed.' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('ext_rename_source', { p_source_id: 's1', p_title: 'LTL 2nd ed.' }))

    const again = (await screen.findByText('Last Things Last')).closest('li') as HTMLElement
    fireEvent.click(within(again).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(again).getByRole('button', { name: 'Keep' }))
    fireEvent.click(within(again).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(again).getByRole('button', { name: 'Delete source' }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('ext_delete_source', { p_source_id: 's1' }))
    expect(storage.remove).toHaveBeenCalledWith(['ch/a.pdf'])
  })

  it('has empty, error and archived states', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom({ error: { message: 'down' } })
    const { unmount } = renderView()
    expect(await screen.findByText("Couldn't load the sources.")).toBeInTheDocument()
    mockFrom({ data: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/No sources yet/)).toBeInTheDocument()
    unmount()

    mockFrom({ data: [row] })
    renderView(true)
    await screen.findByText('Last Things Last')
    expect(screen.queryByRole('button', { name: '+ Add a source' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })
})
