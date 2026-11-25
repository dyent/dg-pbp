import { useCallback, useEffect, useId, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, INPUT, SECTION_TITLE } from '../characters/ui'
import * as api from './recordFilesApi'
import { canPostToChat } from '../chatPost/chatPostApi'
import { PostToChatButton } from '../chatPost/PostToChatButton'

interface RecordFilesSectionProps {
  channelId: string
  recordId: string
  isGM: boolean
  isArchived: boolean
  myUserId: string | undefined
}

const VISIBILITY_TEXT: Record<api.RecordFile['visibility'], string> = {
  gm: 'GM only',
  players: 'All players',
  selected: 'Chosen players',
}

/**
 * The Files box on a record (DECISIONS.md #50): campaign files attached to it,
 * such as a handout, a map or a photo. Each file keeps its own sharing.
 */
export function RecordFilesSection({ channelId, recordId, isGM, isArchived, myUserId }: RecordFilesSectionProps) {
  const { addToast } = useToast()
  const ids = useId()
  const [files, setFiles] = useState<api.RecordFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [token, setToken] = useState(0)
  const [choosing, setChoosing] = useState(false)
  const [options, setOptions] = useState<{ id: string; title: string; folder: string }[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const canManage = isGM && !isArchived

  useEffect(() => {
    let mounted = true
    api
      .listRecordFiles(recordId)
      .then(list => {
        if (!mounted) return
        setFiles(list)
        setError(false)
      })
      .catch(err => {
        console.error('Failed to load record files:', err)
        if (mounted) setError(true)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [recordId, token])

  const reload = useCallback(() => setToken(t => t + 1), [])

  const startChoosing = async () => {
    setChoosing(true)
    setChosen('')
    try {
      setOptions(await api.listAttachableFiles(channelId))
    } catch (err) {
      console.error('Failed to load campaign files:', err)
      setOptions([])
      addToast('Couldn\'t load the campaign\'s files.', 'error')
    }
  }

  const attach = async () => {
    if (!chosen || !myUserId) return
    setBusy(true)
    try {
      await api.attachFile(channelId, recordId, chosen, myUserId)
      addToast('File attached.', 'success')
      setChoosing(false)
      reload()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not attach the file.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const detach = async (fileId: string) => {
    try {
      await api.detachFile(recordId, fileId)
      addToast('File removed from this record (it stays in Files).', 'success')
      reload()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not remove the file.', 'error')
    }
  }

  // Players only get the box when there is something to see.
  if (!isGM && !error && files.length === 0) return null

  const available = (options ?? []).filter(o => !files.some(f => f.fileId === o.id))
  return (
    <section aria-label="Files" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className={SECTION_TITLE}>Files</h4>
        {canManage && !choosing && (
          <button type="button" className={BTN_SECONDARY} onClick={() => void startChoosing()}>
            Attach a file
          </button>
        )}
      </div>
      {isGM && <p className="text-xs text-surface-500 dark:text-surface-400">Players see an attached file only if you have shared both the record and the file with them.</p>}

      {choosing && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-surface-200 p-2 dark:border-surface-700">
          {options && available.length === 0 ? (
            <p className="text-sm text-surface-500 dark:text-surface-400">No other files to attach. Add them in Files first.</p>
          ) : (
            <div>
              <label htmlFor={`${ids}-file`} className="block text-xs font-medium text-surface-700 dark:text-surface-300">
                File
              </label>
              <select id={`${ids}-file`} className={INPUT} value={chosen} disabled={!options} onChange={e => setChosen(e.target.value)}>
                <option value="">{options ? 'Choose…' : 'Loading…'}</option>
                {available.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.folder ? `${o.folder} / ` : ''}
                    {o.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className={BTN_PRIMARY} disabled={busy || !chosen} onClick={() => void attach()}>
            Attach
          </button>
          <button type="button" className={BTN_SECONDARY} onClick={() => setChoosing(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      )}

      {error ? (
        <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <span>Couldn't load the files.</span>
          <button type="button" onClick={reload} className={BTN_SECONDARY}>
            Retry
          </button>
        </div>
      ) : loading && files.length === 0 ? (
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-200 dark:bg-surface-700" aria-label="Loading files" />
      ) : files.length === 0 ? (
        <p className="text-sm text-surface-400 dark:text-surface-500">No files attached.</p>
      ) : (
        <ul className="space-y-2">
          {files.map(f => (
            <FileItem key={f.fileId} channelId={channelId} file={f} isGM={isGM} canManage={canManage} onDetach={() => void detach(f.fileId)} onShared={reload} />
          ))}
        </ul>
      )}
    </section>
  )
}

function FileItem({
  channelId,
  file,
  isGM,
  canManage,
  onDetach,
  onShared,
}: {
  channelId: string
  file: api.RecordFile
  isGM: boolean
  canManage: boolean
  onDetach: () => void
  onShared: () => void
}) {
  const { addToast } = useToast()
  const [preview, setPreview] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Pictures get a small preview.
  useEffect(() => {
    let mounted = true
    api
      .recordFileLink(file.fileId)
      .then(link => {
        if (!mounted) return
        setMimeType(link.mimeType)
        if (link.isImage) setPreview(link.url)
      })
      .catch(() => undefined)
    return () => {
      mounted = false
    }
  }, [file.fileId])

  const open = async () => {
    const tab = window.open('', '_blank')
    try {
      const { url } = await api.recordFileLink(file.fileId)
      if (tab) tab.location.href = url
      else window.location.assign(url)
    } catch (err) {
      tab?.close()
      addToast(err instanceof Error ? err.message : 'Could not open the file.', 'error')
    }
  }

  return (
    <li className="flex items-start gap-3 text-sm text-surface-800 dark:text-surface-200">
      {preview && (
        <button type="button" onClick={() => void open()} className="flex-shrink-0" title={`Open ${file.title}`}>
          <img src={preview} alt={file.title} className="h-16 w-16 rounded border border-surface-200 object-cover dark:border-surface-700" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{file.title}</span>
          {isGM && <span className={`${BADGE} bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300`}>{VISIBILITY_TEXT[file.visibility]}</span>}
          <button type="button" className="text-xs text-primary-600 hover:underline dark:text-primary-400" onClick={() => void open()}>
            Open
          </button>
          {canManage && mimeType && canPostToChat(mimeType) && (
            <PostToChatButton
              channelId={channelId}
              file={{ id: file.fileId, title: file.title, description: file.description, folder: file.folder, visibility: file.visibility }}
              isPdf={mimeType === 'application/pdf'}
              onShared={onShared}
              compact
            />
          )}
          {canManage && !confirming && (
            <button type="button" className="text-xs text-red-600 hover:underline dark:text-red-400" onClick={() => setConfirming(true)} aria-label={`Remove ${file.title} from this record`}>
              Remove
            </button>
          )}
          {confirming && (
            <span className="flex items-center gap-2 text-xs">
              Remove from this record? (It stays in Files.)
              <button type="button" className="font-medium text-red-600 hover:underline dark:text-red-400" onClick={onDetach}>
                Yes, remove
              </button>
              <button type="button" className="hover:underline" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          )}
        </div>
        {file.description && <p className="text-xs text-surface-500 dark:text-surface-400">{file.description}</p>}
      </div>
    </li>
  )
}
