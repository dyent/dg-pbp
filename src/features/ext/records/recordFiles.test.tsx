import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { supabase } from '../../../lib/supabase'
import { fileLink, listFiles } from '../files/filesApi'
import { paddedArea } from '../import/pdfImage'
import * as api from './recordFilesApi'
import { RecordFilesSection } from './RecordFilesSection'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('../files/filesApi', () => ({ listFiles: vi.fn(), fileLink: vi.fn() }))

function mockFrom(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'delete']) builder[m] = vi.fn(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
  vi.mocked(supabase.from).mockReturnValue(builder as never)
  return builder
}

const letter: api.RecordFile = { fileId: 'f1', title: 'Ortiz letter', description: 'A worried note.', folder: 'Handouts', visibility: 'players' }
const map: api.RecordFile = { fileId: 'f2', title: 'Quarry map', description: '', folder: '', visibility: 'gm' }

describe('paddedArea', () => {
  it('pads the area a little and keeps it inside the page', () => {
    expect(paddedArea(null)).toEqual({ left: 0, top: 0, width: 1, height: 1 })
    const a = paddedArea({ left: 0.1, top: 0.5, width: 0.8, height: 0.3 })
    expect(a.left).toBeCloseTo(0.08)
    expect(a.top).toBeCloseTo(0.48)
    expect(a.width).toBeCloseTo(0.84)
    expect(a.height).toBeCloseTo(0.34)
    const edge = paddedArea({ left: 0, top: 0.9, width: 1, height: 0.1 })
    expect(edge.left).toBe(0)
    expect(edge.width).toBe(1)
    expect(edge.top + edge.height).toBeCloseTo(1)
  })
})

describe('recordFilesApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists a record\'s files and the campaign\'s files to attach', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [{ file_id: 'f1', title: 'Ortiz letter', description: 'd', folder: 'Handouts', visibility: 'odd' }], error: null } as never)
    expect(await api.listRecordFiles('r1')).toEqual([{ fileId: 'f1', title: 'Ortiz letter', description: 'd', folder: 'Handouts', visibility: 'gm' }])
    expect(supabase.rpc).toHaveBeenCalledWith('ext_record_files_for', { p_record_id: 'r1' })
    vi.mocked(listFiles).mockResolvedValue([
      { id: 'b', title: 'Map', folder: '' },
      { id: 'a', title: 'Letter', folder: 'Handouts' },
    ] as never)
    expect((await api.listAttachableFiles('ch')).map(f => f.id)).toEqual(['b', 'a'])
  })

  it('attaches, explains a repeat, and detaches', async () => {
    const builder = mockFrom({})
    await api.attachFile('ch', 'r1', 'f1', 'gm')
    expect(builder.insert).toHaveBeenCalledWith({ channel_id: 'ch', record_id: 'r1', file_id: 'f1', created_by: 'gm' })
    mockFrom({ error: { code: '23505', message: 'duplicate' } })
    await expect(api.attachFile('ch', 'r1', 'f1', 'gm')).rejects.toThrow('That file is already attached.')
    mockFrom({ error: { message: 'down' } })
    await expect(api.attachFile('ch', 'r1', 'f1', 'gm')).rejects.toThrow('down')
    const del = mockFrom({})
    await api.detachFile('r1', 'f1')
    expect(del.eq).toHaveBeenCalledWith('file_id', 'f1')
  })

  it('links to the current version and says whether it is a picture', async () => {
    mockFrom({ data: [{ object_path: 'ch/x.png', mime_type: 'image/png' }] })
    vi.mocked(fileLink).mockResolvedValue('https://x.test/x.png')
    expect(await api.recordFileLink('f1')).toEqual({ url: 'https://x.test/x.png', isImage: true })
    mockFrom({ data: [] })
    await expect(api.recordFileLink('f1')).rejects.toThrow('That file has no content.')
  })
})

describe('RecordFilesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(api, 'listRecordFiles').mockResolvedValue([letter, map])
    vi.spyOn(api, 'listAttachableFiles').mockResolvedValue([
      { id: 'f1', title: 'Ortiz letter', folder: 'Handouts' },
      { id: 'f3', title: 'Photo', folder: 'Evidence' },
    ])
    vi.spyOn(api, 'attachFile').mockResolvedValue()
    vi.spyOn(api, 'detachFile').mockResolvedValue()
    vi.spyOn(api, 'recordFileLink').mockImplementation(async id => ({ url: `https://x.test/${id}`, isImage: id === 'f1' }))
  })
  afterEach(() => vi.restoreAllMocks())

  const renderSection = (props: Partial<Parameters<typeof RecordFilesSection>[0]> = {}) =>
    render(
      <ToastProvider>
        <RecordFilesSection channelId="ch" recordId="r1" isGM isArchived={false} myUserId="gm" {...props} />
      </ToastProvider>,
    )

  it('lists attached files with a preview for pictures and who can see each', async () => {
    renderSection()
    expect(await screen.findByRole('img', { name: 'Ortiz letter' })).toHaveAttribute('src', 'https://x.test/f1')
    expect(screen.getByText('All players')).toBeInTheDocument()
    expect(screen.getByText('GM only')).toBeInTheDocument()
    expect(screen.getByText('A worried note.')).toBeInTheDocument()
  })

  it('opens a file in a new tab', async () => {
    const tab = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as never)
    renderSection()
    const row = (await screen.findByText('Quarry map')).closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(tab.location.href).toBe('https://x.test/f2'))
  })

  it('attaches a file that isn\'t attached yet', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Attach a file' }))
    const select = await screen.findByLabelText('File')
    await waitFor(() => expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Choose…', 'Evidence / Photo']))
    expect(screen.getByRole('button', { name: 'Attach' })).toBeDisabled()
    fireEvent.change(select, { target: { value: 'f3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))
    await waitFor(() => expect(api.attachFile).toHaveBeenCalledWith('ch', 'r1', 'f3', 'gm'))
    expect(await screen.findByText('File attached.')).toBeInTheDocument()
  })

  it('says when there is nothing more to attach, and removes after confirming', async () => {
    vi.mocked(api.listAttachableFiles).mockResolvedValue([{ id: 'f1', title: 'Ortiz letter', folder: 'Handouts' }])
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Attach a file' }))
    expect(await screen.findByText('No other files to attach. Add them in Files first.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Quarry map from this record' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Quarry map from this record' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(api.detachFile).toHaveBeenCalledWith('r1', 'f2'))
    expect(await screen.findByText('File removed from this record (it stays in Files).')).toBeInTheDocument()
  })

  it('reports a failed attach', async () => {
    vi.mocked(api.attachFile).mockRejectedValue(new Error('That file is already attached.'))
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Attach a file' }))
    const select = await screen.findByLabelText('File')
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2))
    fireEvent.change(select, { target: { value: 'f3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))
    expect(await screen.findByText('That file is already attached.')).toBeInTheDocument()
  })

  it('shows players only what they can see, with no controls, and nothing when empty', async () => {
    const { unmount } = renderSection({ isGM: false })
    await screen.findByText('Ortiz letter')
    expect(screen.queryByRole('button', { name: 'Attach a file' })).not.toBeInTheDocument()
    expect(screen.queryByText('All players')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
    unmount()
    vi.mocked(api.listRecordFiles).mockResolvedValue([])
    renderSection({ isGM: false })
    await waitFor(() => expect(api.listRecordFiles).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('region', { name: 'Files' })).not.toBeInTheDocument()
  })

  it('shows the empty state for the GM, no controls when archived, and a retry on errors', async () => {
    vi.mocked(api.listRecordFiles).mockResolvedValueOnce([])
    const { unmount } = renderSection({ isArchived: true })
    expect(await screen.findByText('No files attached.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attach a file' })).not.toBeInTheDocument()
    unmount()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.listRecordFiles).mockRejectedValueOnce(new Error('down'))
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Quarry map')).toBeInTheDocument()
  })
})
