import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import * as api from './filesApi'
import { FilesEntry } from './FilesEntry'
import { FilesPanel } from './FilesPanel'
import type { CampaignFile } from './filesModel'

vi.mock('./filesApi', () => ({
  listFiles: vi.fn(),
  listShares: vi.fn(),
  listEvents: vi.fn(),
  addFile: vi.fn(),
  replaceFile: vi.fn(),
  updateFile: vi.fn(),
  deleteFile: vi.fn(),
  fileLink: vi.fn(),
}))

const map: CampaignFile = {
  id: 'f1',
  title: 'Map of Riverside',
  description: 'Town centre',
  folder: 'Maps',
  visibility: 'players',
  createdAt: '2026-11-18T10:00:00Z',
  updatedAt: '2026-11-19T10:00:00Z',
  versions: [
    { id: 'v2', versionNo: 2, objectPath: 'ch/b.pdf', fileName: 'riverside-v2.pdf', mimeType: 'application/pdf', sizeBytes: 2048, uploadedAt: '2026-11-19T10:00:00Z' },
    { id: 'v1', versionNo: 1, objectPath: 'ch/a.pdf', fileName: 'riverside.pdf', mimeType: 'application/pdf', sizeBytes: 1024, uploadedAt: '2026-11-18T10:00:00Z' },
  ],
}

const photo: CampaignFile = {
  id: 'f2',
  title: 'Autopsy photo',
  description: '',
  folder: '',
  visibility: 'selected',
  createdAt: '2026-11-18T10:00:00Z',
  updatedAt: '2026-11-18T10:00:00Z',
  versions: [{ id: 'v3', versionNo: 1, objectPath: 'ch/c.png', fileName: 'photo.png', mimeType: 'image/png', sizeBytes: 500, uploadedAt: '2026-11-18T10:00:00Z' }],
}

const players = [
  { userId: 'u1', name: 'Sam' },
  { userId: 'u2', name: 'Jo' },
]
const nameOf = (id: string) => ({ u1: 'Sam', u2: 'Jo', gm: 'You' })[id] ?? id

function renderPanel(props: Partial<React.ComponentProps<typeof FilesPanel>> = {}) {
  const all = { channelId: 'ch', isGM: true, isArchived: false, players, nameOf, onClose: vi.fn(), ...props }
  render(
    <ToastProvider>
      <FilesPanel {...all} />
    </ToastProvider>,
  )
  return all
}

describe('FilesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listFiles).mockResolvedValue([map, photo])
    vi.mocked(api.listShares).mockResolvedValue(new Map([['f2', ['u1']]]))
    vi.mocked(api.listEvents).mockResolvedValue([
      { id: 'e1', fileId: 'f1', actorId: 'gm', kind: 'replaced', details: { file_name: 'riverside-v2.pdf', version: 2 }, createdAt: '2026-11-19T10:00:00Z' },
    ])
    vi.mocked(api.fileLink).mockImplementation(async (path, downloadAs) => `https://files/${path}${downloadAs ? `?download=${downloadAs}` : ''}`)
  })

  it('lists files by folder and opens one with its versions and history (GM)', async () => {
    renderPanel()
    const maps = await screen.findByRole('region', { name: 'Maps' })
    expect(within(maps).getByText('Map of Riverside')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Not in a folder' })).getByText('Autopsy photo')).toBeInTheDocument()
    expect(api.listShares).toHaveBeenCalledWith(['f2'])

    fireEvent.click(screen.getByText('Map of Riverside'))
    expect(await screen.findByRole('link', { name: 'Open' })).toHaveAttribute('href', 'https://files/ch/b.pdf')
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'https://files/ch/b.pdf?download=riverside-v2.pdf')
    expect(screen.getByText(/riverside-v2.pdf · 2 KB · version 2/)).toBeInTheDocument()
    expect(screen.getByText(/Version 1: riverside.pdf/)).toBeInTheDocument()
    expect(await screen.findByText('Replaced with riverside-v2.pdf (version 2)')).toBeInTheDocument()
    expect(screen.getAllByText('All players').length).toBeGreaterThan(0)
  })

  it('shows an image preview and who a file is shared with', async () => {
    renderPanel()
    fireEvent.click(await screen.findByText('Autopsy photo'))
    expect(await screen.findByRole('img', { name: 'Autopsy photo' })).toHaveAttribute('src', 'https://files/ch/c.png')
    expect(screen.getByText('Shared with Sam')).toBeInTheDocument()
  })

  it('players see files without GM controls or history', async () => {
    vi.mocked(api.listFiles).mockResolvedValue([map])
    renderPanel({ isGM: false })
    fireEvent.click(await screen.findByText('Map of Riverside'))
    await screen.findByRole('link', { name: 'Open' })
    expect(api.listShares).not.toHaveBeenCalled()
    expect(api.listEvents).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '+ Add file' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByText(/History/)).not.toBeInTheDocument()
  })

  it('shows empty, no-match, loading and error states', async () => {
    vi.mocked(api.listFiles).mockResolvedValue([])
    const { unmount } = render(
      <ToastProvider>
        <FilesPanel channelId="ch" isGM={false} isArchived={false} players={[]} nameOf={nameOf} onClose={vi.fn()} />
      </ToastProvider>,
    )
    expect(screen.getByLabelText('Loading files')).toBeInTheDocument()
    expect(await screen.findByText('No files have been shared with you yet.')).toBeInTheDocument()
    unmount()

    vi.mocked(api.listFiles).mockResolvedValue([map, photo])
    renderPanel()
    fireEvent.change(await screen.findByLabelText('Search files'), { target: { value: 'zzz' } })
    expect(screen.getByText('No files match your search.')).toBeInTheDocument()
  })

  it('retries after a load error', async () => {
    vi.mocked(api.listFiles).mockRejectedValueOnce(new Error('offline'))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Map of Riverside')).toBeInTheDocument()
  })

  it('adds a file shared with chosen players', async () => {
    vi.mocked(api.addFile).mockResolvedValue('f3')
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '+ Add file' }))

    // Nothing chosen yet.
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a file to upload.')

    // A wrong type is refused straight away.
    fireEvent.change(screen.getByLabelText(/^File \(PDF/), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Only PDF and image files')

    const file = new File(['%PDF'], 'Case 12 report.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/^File \(PDF/), { target: { files: [file] } })
    expect(screen.getByLabelText('Title')).toHaveValue('Case 12 report')
    fireEvent.change(screen.getByLabelText('Folder (optional)'), { target: { value: ' Case files ' } })
    fireEvent.click(screen.getByLabelText(/Chosen players/))
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one player')
    fireEvent.click(screen.getByLabelText('Jo'))
    fireEvent.click(screen.getByLabelText('Sam'))
    fireEvent.click(screen.getByLabelText('Sam'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    })
    expect(api.addFile).toHaveBeenCalledWith('ch', file, {
      title: 'Case 12 report',
      description: '',
      folder: 'Case files',
      visibility: 'selected',
      playerIds: ['u2'],
    })
    expect(await screen.findByText('Case 12 report added.')).toBeInTheDocument()
  })

  it('keeps the form open and explains when adding fails', async () => {
    vi.mocked(api.addFile).mockRejectedValue(new Error('Files can be at most 20 MB'))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '+ Add file' }))
    fireEvent.change(screen.getByLabelText(/^File \(PDF/), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    })
    expect(await screen.findByText('Files can be at most 20 MB')).toBeInTheDocument()
    expect(screen.getByText('Not saved. Check the message and try again.')).toBeInTheDocument()
    // Escape doesn't close the panel while the form is open; Cancel goes back.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Choose a file to open it.')).toBeInTheDocument()
  })

  it('edits the details of a shared file', async () => {
    vi.mocked(api.updateFile).mockResolvedValue()
    renderPanel()
    fireEvent.click(await screen.findByText('Autopsy photo'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    expect(screen.getByLabelText('Sam')).toBeChecked()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Autopsy photo (cropped)' } })
    fireEvent.click(screen.getByLabelText('Jo'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(api.updateFile).toHaveBeenCalledWith('f2', {
      title: 'Autopsy photo (cropped)',
      description: '',
      folder: '',
      visibility: 'selected',
      playerIds: ['u1', 'u2'],
    })
    expect(await screen.findByText('File details saved.')).toBeInTheDocument()
  })

  it('reports a failed edit', async () => {
    vi.mocked(api.updateFile).mockRejectedValue(new Error('This campaign is archived'))
    renderPanel()
    fireEvent.click(await screen.findByText('Map of Riverside'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(await screen.findByText('This campaign is archived')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('button', { name: 'Edit details' })).toBeInTheDocument()
  })

  it('replaces a file, refusing wrong types first', async () => {
    vi.mocked(api.replaceFile).mockResolvedValueOnce(3).mockRejectedValueOnce(new Error('upload failed'))
    renderPanel()
    fireEvent.click(await screen.findByText('Map of Riverside'))
    const input = screen.getByLabelText('Replace file')

    fireEvent.change(input, { target: { files: [new File(['x'], 'a.svg', { type: 'image/svg+xml' })] } })
    expect(await screen.findByText(/Only PDF and image files/)).toBeInTheDocument()
    expect(api.replaceFile).not.toHaveBeenCalled()

    const next = new File(['%PDF'], 'riverside-v3.pdf', { type: 'application/pdf' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [next] } })
    })
    expect(api.replaceFile).toHaveBeenCalledWith('ch', 'f1', next)
    expect(await screen.findByText('Map of Riverside replaced (version 3).')).toBeInTheDocument()

    await act(async () => {
      fireEvent.change(input, { target: { files: [next] } })
    })
    expect(await screen.findByText('upload failed')).toBeInTheDocument()

    // An empty pick does nothing.
    fireEvent.change(input, { target: { files: [] } })
    expect(api.replaceFile).toHaveBeenCalledTimes(2)
  })

  it('deletes a file after confirming', async () => {
    vi.mocked(api.deleteFile).mockResolvedValueOnce().mockRejectedValueOnce(new Error('nope'))
    renderPanel()
    fireEvent.click(await screen.findByText('Map of Riverside'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Map of Riverside?' })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    })
    expect(api.deleteFile).toHaveBeenCalledWith('f1')
    expect(await screen.findByText('Map of Riverside deleted.')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Map of Riverside'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Map of Riverside?' })).getByRole('button', { name: 'Delete' }))
    })
    expect(await screen.findByText('nope')).toBeInTheDocument()
  })

  it('shows a message when the file links cannot be made', async () => {
    vi.mocked(api.fileLink).mockRejectedValue(new Error('x'))
    vi.mocked(api.listEvents).mockRejectedValue(new Error('x'))
    renderPanel()
    fireEvent.click(await screen.findByText('Map of Riverside'))
    expect(await screen.findByText(/Couldn’t prepare the file links/)).toBeInTheDocument()
    expect(await screen.findByText('No history yet.')).toBeInTheDocument()
  })

  it('archived campaigns are read-only, and the list button goes back on small screens', async () => {
    renderPanel({ isArchived: true })
    fireEvent.click(await screen.findByText('Map of Riverside'))
    expect(screen.queryByRole('button', { name: '+ Add file' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '← List' }))
    expect(screen.getByText('Choose a file to open it.')).toBeInTheDocument()
  })

  it('closes with the close button and Escape', async () => {
    const props = renderPanel()
    await screen.findByText('Map of Riverside')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close files' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})

describe('FilesEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listFiles).mockResolvedValue([photo])
    vi.mocked(api.listShares).mockResolvedValue(new Map([['f2', ['u1', 'gone']]]))
    vi.mocked(api.listEvents).mockResolvedValue([])
    vi.mocked(api.fileLink).mockResolvedValue('https://files/x')
  })

  it('opens the panel from the sidebar item, with player names', async () => {
    render(
      <ToastProvider>
        <FilesEntry
          channelId="ch"
          isGM
          isArchived={false}
          gmId="gm"
          myUserId="gm"
          members={[
            { user_id: 'gm', character_name: 'GM' },
            { user_id: 'u1', profile: { display_name: 'Sam' } },
            { user_id: 'u3', character_name: 'Blocked', is_blocked: true },
          ]}
          className="menu-item"
        />
      </ToastProvider>,
    )
    expect(api.listFiles).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    fireEvent.click(await screen.findByText('Autopsy photo'))
    expect(await screen.findByText('Shared with Sam, A former player')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    expect(screen.getByLabelText('Sam')).toBeInTheDocument()
    expect(screen.queryByLabelText('Blocked')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Close files' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
