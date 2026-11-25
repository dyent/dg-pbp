import { useId, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { useImageUpload } from '../../../hooks/useImageUpload'
import { BTN_PRIMARY, BTN_SECONDARY } from '../characters/ui'
import { pictureForChat, shareWithAllPlayers } from './chatPostApi'
import { useChatPost } from './chatPostContext'

interface PostToChatButtonProps {
  channelId: string
  file: { id: string; title: string; description: string; folder: string; visibility: 'gm' | 'players' | 'selected' }
  /** True for a PDF: page 1 becomes the picture. */
  isPdf: boolean
  /** Called after the file's sharing changed. */
  onShared?: () => void
  /** Smaller link-style button, for lists. */
  compact?: boolean
}

/**
 * "Post in chat" for a campaign file (DECISIONS.md #51): the picture goes into
 * the message box of the room that is open, where the GM can add words and
 * send it. Only shown where the GM can post (see ChatPostProvider).
 */
export function PostToChatButton({ channelId, file, isPdf, onShared, compact = false }: PostToChatButtonProps) {
  const chat = useChatPost()
  const { addToast } = useToast()
  const { uploadEnabled, settingsLoading, uploadImage } = useImageUpload(channelId)
  const id = useId()
  const [asking, setAsking] = useState(false)
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)

  if (!chat) return null
  const alreadyShared = file.visibility === 'players'

  const post = async () => {
    setBusy(true)
    try {
      const picture = await pictureForChat(file.id)
      const path = await uploadImage(picture, 'message', 1200)
      if (!path) throw new Error('Could not add the picture.')
      if (share && !alreadyShared) {
        try {
          await shareWithAllPlayers(file.id, file)
          onShared?.()
        } catch (err) {
          addToast(err instanceof Error ? `The picture is in your message, but sharing failed: ${err.message}` : 'Sharing in Files failed.', 'error')
        }
      }
      addToast('Picture added to your message. Add any words, then send it.', 'success')
      setAsking(false)
      chat.insertImages([path])
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not add the picture.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const disabledReason = !settingsLoading && !uploadEnabled ? 'Picture uploads are turned off in the server settings.' : null

  if (!asking) {
    return (
      <button
        type="button"
        className={compact ? 'text-xs text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400' : BTN_SECONDARY}
        onClick={() => setAsking(true)}
        disabled={!!disabledReason || settingsLoading}
        title={disabledReason ?? (isPdf ? 'Post the first page as a picture in the chat' : 'Post this picture in the chat')}
        aria-label={`Post ${file.title} in chat`}
      >
        Post in chat
      </button>
    )
  }

  return (
    <div role="group" aria-label={`Post ${file.title} in chat`} className="w-full space-y-2 rounded-md border border-surface-200 p-2 text-sm dark:border-surface-700">
      <p className="text-surface-700 dark:text-surface-300">
        {isPdf ? 'The first page becomes a picture in your message box.' : 'The picture goes into your message box.'} Everyone in the room you have open will see it when you send.
      </p>
      {!alreadyShared && (
        <label htmlFor={`${id}-share`} className="flex items-center gap-2 text-surface-700 dark:text-surface-300">
          <input id={`${id}-share`} type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} disabled={busy} />
          Also share this file with all players in Files
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} onClick={() => void post()} disabled={busy}>
          {busy ? 'Preparing…' : 'Add to message'}
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={() => setAsking(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )
}
