import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { supabase } from '../../../lib/supabase'
import { updateFile } from '../files/filesApi'
import { renderPagesAsPng } from '../import/pdfImage'
import { canPostToChat, pictureForChat, shareWithAllPlayers } from './chatPostApi'
import * as chatApi from './chatPostApi'
import { ChatPostProvider } from './chatPostContext'
import { PostToChatButton } from './PostToChatButton'

const upload = vi.hoisted(() => ({
  state: { uploadEnabled: true, settingsLoading: false, uploading: false, uploadImage: vi.fn() },
}))

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }))
vi.mock('../files/filesApi', () => ({ updateFile: vi.fn() }))
vi.mock('../import/pdfImage', () => ({ renderPagesAsPng: vi.fn() }))
vi.mock('../../../hooks/useImageUpload', () => ({ useImageUpload: () => upload.state }))

function mockVersion(rows: unknown[], error: unknown = null) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit']) builder[m] = vi.fn(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve)
  vi.mocked(supabase.from).mockReturnValue(builder as never)
}

function mockDownload(result: { data: Blob | null; error: unknown }) {
  const download = vi.fn().mockResolvedValue(result)
  vi.mocked(supabase.storage.from).mockReturnValue({ download } as never)
  return download
}

describe('chatPostApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('knows which files can go into the chat', () => {
    expect(canPostToChat('image/png')).toBe(true)
    expect(canPostToChat('application/pdf')).toBe(true)
    expect(canPostToChat('text/plain')).toBe(false)
  })

  it('uses a picture as it is', async () => {
    mockVersion([{ object_path: 'ch/a.png', mime_type: 'image/png', file_name: 'letter.png' }])
    const download = mockDownload({ data: new Blob(['x'], { type: 'image/png' }), error: null })
    const file = await pictureForChat('f1')
    expect(download).toHaveBeenCalledWith('ch/a.png')
    expect(file.name).toBe('letter.png')
    expect(file.type).toBe('image/png')
    expect(renderPagesAsPng).not.toHaveBeenCalled()
  })

  it('turns page 1 of a PDF into a picture', async () => {
    mockVersion([{ object_path: 'ch/a.pdf', mime_type: 'application/pdf', file_name: 'letter.pdf' }])
    mockDownload({ data: new Blob(['%PDF']), error: null })
    vi.mocked(renderPagesAsPng).mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    const file = await pictureForChat('f1')
    expect(renderPagesAsPng).toHaveBeenCalledWith(expect.any(ArrayBuffer), 1, 1)
    expect(file.name).toBe('letter.png')
    expect(file.type).toBe('image/png')
  })

  it('explains what went wrong', async () => {
    mockVersion([])
    await expect(pictureForChat('f1')).rejects.toThrow('That file has no content.')
    mockVersion([{ object_path: 'x', mime_type: 'text/plain', file_name: 'x.txt' }])
    await expect(pictureForChat('f1')).rejects.toThrow('Only pictures and PDFs can be posted in the chat.')
    mockVersion([], { message: 'down' })
    await expect(pictureForChat('f1')).rejects.toThrow('down')
    mockVersion([{ object_path: 'x', mime_type: 'image/png', file_name: 'x.png' }])
    mockDownload({ data: null, error: { message: 'gone' } })
    await expect(pictureForChat('f1')).rejects.toThrow('gone')
  })

  it('shares with all players, keeping the details', async () => {
    await shareWithAllPlayers('f1', { title: 'T', description: 'D', folder: 'Handouts' })
    expect(updateFile).toHaveBeenCalledWith('f1', { title: 'T', description: 'D', folder: 'Handouts', visibility: 'players', playerIds: [] })
  })
})

describe('PostToChatButton', () => {
  const insertImages = vi.fn()
  const onShared = vi.fn()
  const file = { id: 'f1', title: 'Ortiz letter', description: '', folder: 'Handouts', visibility: 'gm' as const }

  beforeEach(() => {
    vi.clearAllMocks()
    upload.state.uploadEnabled = true
    upload.state.settingsLoading = false
    upload.state.uploadImage = vi.fn().mockResolvedValue('ch/message/1.jpg')
    vi.spyOn(chatApi, 'pictureForChat').mockResolvedValue(new File(['x'], 'letter.png', { type: 'image/png' }))
    vi.spyOn(chatApi, 'shareWithAllPlayers').mockResolvedValue()
  })

  const renderButton = (props: Partial<Parameters<typeof PostToChatButton>[0]> = {}, withChat = true) =>
    render(
      <ToastProvider>
        <ChatPostProvider value={withChat ? { insertImages } : null}>
          <PostToChatButton channelId="ch" file={file} isPdf={false} onShared={onShared} {...props} />
        </ChatPostProvider>
      </ToastProvider>,
    )

  it('is hidden where the GM can\'t post', () => {
    renderButton({}, false)
    expect(screen.queryByRole('button', { name: /in chat/ })).not.toBeInTheDocument()
  })

  it('puts the picture in the message box and shares the file', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Post Ortiz letter in chat' }))
    expect(screen.getByLabelText('Also share this file with all players in Files')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Add to message' }))
    await waitFor(() => expect(insertImages).toHaveBeenCalledWith(['ch/message/1.jpg']))
    expect(upload.state.uploadImage).toHaveBeenCalledWith(expect.any(File), 'message', 1200)
    expect(chatApi.shareWithAllPlayers).toHaveBeenCalledWith('f1', file)
    expect(onShared).toHaveBeenCalled()
    expect(await screen.findByText('Picture added to your message. Add any words, then send it.')).toBeInTheDocument()
  })

  it('leaves sharing alone when the box is cleared, and has no tick box when already shared', async () => {
    const { unmount } = renderButton({ isPdf: true })
    fireEvent.click(screen.getByRole('button', { name: 'Post Ortiz letter in chat' }))
    expect(screen.getByText(/The first page becomes a picture/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Also share this file with all players in Files'))
    fireEvent.click(screen.getByRole('button', { name: 'Add to message' }))
    await waitFor(() => expect(insertImages).toHaveBeenCalled())
    expect(chatApi.shareWithAllPlayers).not.toHaveBeenCalled()
    unmount()
    renderButton({ file: { ...file, visibility: 'players' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post Ortiz letter in chat' }))
    expect(screen.queryByLabelText('Also share this file with all players in Files')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Post Ortiz letter in chat' })).toBeInTheDocument()
  })

  it('still adds the picture when sharing fails, and reports other failures', async () => {
    vi.mocked(chatApi.shareWithAllPlayers).mockRejectedValueOnce(new Error('no'))
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Post Ortiz letter in chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to message' }))
    expect(await screen.findByText('The picture is in your message, but sharing failed: no')).toBeInTheDocument()
    expect(insertImages).toHaveBeenCalled()

    insertImages.mockClear()
    vi.mocked(chatApi.pictureForChat).mockRejectedValueOnce(new Error('That file has no content.'))
    fireEvent.click(screen.getByRole('button', { name: 'Post Ortiz letter in chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to message' }))
    expect(await screen.findByText('That file has no content.')).toBeInTheDocument()
    upload.state.uploadImage.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('button', { name: 'Add to message' }))
    expect(await screen.findByText('Could not add the picture.')).toBeInTheDocument()
    expect(insertImages).not.toHaveBeenCalled()
  })

  it('is disabled when picture uploads are turned off', () => {
    upload.state.uploadEnabled = false
    renderButton()
    const button = screen.getByRole('button', { name: 'Post Ortiz letter in chat' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Picture uploads are turned off in the server settings.')
  })
})
