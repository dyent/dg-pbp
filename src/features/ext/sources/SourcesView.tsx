import { useCallback, useEffect, useId, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, SECTION_TITLE } from '../characters/ui'
import { formatSize } from '../files/filesModel'
import { AiStatusCard } from '../ai/AiStatusCard'
import { useAiStatus } from '../ai/useAiStatus'
import { ImportSection } from '../import/ImportSection'
import * as api from './sourcesApi'
import {
  SOURCE_TITLE_MAX,
  parsePage,
  sortSources,
  sourceFileProblem,
  sourceTitleProblem,
  titleFromFileName,
  type CampaignSource,
} from './sourcesModel'

interface SourcesViewProps {
  channelId: string
  isArchived: boolean
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function useSources(channelId: string) {
  const [sources, setSources] = useState<CampaignSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api
      .listSources(channelId)
      .then(list => {
        if (!mounted) return
        setSources(sortSources(list))
        setError(false)
      })
      .catch(err => {
        console.error('Failed to load sources:', err)
        if (mounted) setError(true)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [channelId, token])

  const reload = useCallback(() => setToken(t => t + 1), [])
  return { sources, loading, error, reload }
}

/**
 * The GM's source library (Phase 3 step 1): published adventures, kept GM only
 * in their own private storage. Players never see this view or its files.
 */
export function SourcesView({ channelId, isArchived }: SourcesViewProps) {
  const { sources, loading, error, reload } = useSources(channelId)
  const ai = useAiStatus(channelId)
  const canImport = !isArchived && ai.status?.allowed === true
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
      <p className="text-sm text-surface-600 dark:text-surface-300">
        The published adventures this campaign uses. Only you can see them, and they are never shared with players.
      </p>
      <AiStatusCard channelId={channelId} ai={ai} />
      {!isArchived && !adding && (
        <div>
          <button type="button" className={BTN_PRIMARY} onClick={() => setAdding(true)}>
            + Add a source
          </button>
        </div>
      )}
      {adding && (
        <AddSourceForm
          channelId={channelId}
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            reload()
          }}
        />
      )}

      {error ? (
        <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <span>Couldn't load the sources.</span>
          <button type="button" onClick={reload} className={BTN_SECONDARY}>
            Retry
          </button>
        </div>
      ) : loading && sources.length === 0 ? (
        <div className="animate-pulse space-y-3" aria-label="Loading sources">
          <div className="h-14 rounded bg-surface-200 dark:bg-surface-700" />
          <div className="h-14 rounded bg-surface-200 dark:bg-surface-700" />
        </div>
      ) : sources.length === 0 ? (
        <p className="py-6 text-center text-sm text-surface-500 dark:text-surface-400">
          No sources yet. Add the PDF of a published adventure to import from it later.
        </p>
      ) : (
        <section aria-label="Sources" className="space-y-2">
          <h3 className={SECTION_TITLE}>Sources</h3>
          <ul className="space-y-2">
            {sources.map(source => (
              <SourceItem
                key={source.id}
                source={source}
                canManage={!isArchived}
                onChanged={reload}
                importSlot={<ImportSection channelId={channelId} source={source} canImport={canImport} canReview={!isArchived} onRunEnded={ai.reload} />}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function AddSourceForm({ channelId, onCancel, onAdded }: { channelId: string; onCancel: () => void; onAdded: () => void }) {
  const { addToast } = useToast()
  const ids = useId()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileProblem = file ? sourceFileProblem(file) : 'Choose a PDF.'
  const titleProblem = sourceTitleProblem(title)
  const problem = fileProblem ?? titleProblem

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (problem || !file) return
    setSaving(true)
    try {
      await api.addSource(channelId, title, file)
      addToast('Source added.', 'success')
      onAdded()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not add the source.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form aria-label="Add a source" onSubmit={submit} className="space-y-2 rounded-md border border-surface-200 p-3 dark:border-surface-700">
      <div>
        <label htmlFor={`${ids}-file`} className={LABEL}>
          Adventure PDF (up to 50 MB)
        </label>
        <input
          id={`${ids}-file`}
          type="file"
          accept=".pdf,application/pdf"
          className="mt-1 block w-full text-sm text-surface-700 dark:text-surface-300"
          onChange={e => {
            const chosen = e.target.files?.[0] ?? null
            setFile(chosen)
            if (chosen && !titleTouched) setTitle(titleFromFileName(chosen.name))
          }}
        />
        {file && fileProblem && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fileProblem}</p>}
      </div>
      <div>
        <label htmlFor={`${ids}-title`} className={LABEL}>
          Title
        </label>
        <input
          id={`${ids}-title`}
          className={INPUT}
          value={title}
          maxLength={SOURCE_TITLE_MAX}
          placeholder="e.g. Last Things Last"
          onChange={e => {
            setTitle(e.target.value)
            setTitleTouched(true)
          }}
        />
      </div>
      {tried && problem && <p className="text-xs text-red-600 dark:text-red-400">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={saving}>
          {saving ? 'Uploading…' : 'Add source'}
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function SourceItem({
  source,
  canManage,
  onChanged,
  importSlot,
}: {
  source: CampaignSource
  canManage: boolean
  onChanged: () => void
  importSlot?: React.ReactNode
}) {
  const { addToast } = useToast()
  const ids = useId()
  const [page, setPage] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(source.title)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const pageNumber = page.trim() ? parsePage(page) : null
  const badPage = page.trim() !== '' && pageNumber === null
  const titleProblem = renaming ? sourceTitleProblem(title) : null

  const open = async () => {
    if (badPage) return
    // Open the tab during the click, so pop-up blockers allow it; the link follows.
    const tab = window.open('', '_blank')
    try {
      const url = await api.sourceLink(source.objectPath, pageNumber)
      if (tab) tab.location.href = url
      else window.location.assign(url)
    } catch (err) {
      tab?.close()
      addToast(err instanceof Error ? err.message : 'Could not open the source.', 'error')
    }
  }

  const act = async (action: () => Promise<void>, success: string) => {
    setBusy(true)
    try {
      await action()
      addToast(success, 'success')
      onChanged()
      return true
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Something went wrong.', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="space-y-2 rounded-md border border-surface-200 p-3 dark:border-surface-700">
      {renaming ? (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Source title" className={`${INPUT} min-w-0 flex-1`} value={title} maxLength={SOURCE_TITLE_MAX} onChange={e => setTitle(e.target.value)} />
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy || !!titleProblem}
            onClick={async () => {
              if (title.trim() === source.title) return setRenaming(false)
              if (await act(() => api.renameSource(source.id, title), 'Source renamed.')) setRenaming(false)
            }}
          >
            Save
          </button>
          <button type="button" className={BTN_SECONDARY} onClick={() => { setRenaming(false); setTitle(source.title) }}>
            Cancel
          </button>
          {titleProblem && <p className="w-full text-xs text-red-600 dark:text-red-400">{titleProblem}</p>}
        </div>
      ) : (
        <div>
          <p className="font-medium text-surface-900 dark:text-surface-100">{source.title}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400">
            {source.fileName} · {formatSize(source.sizeBytes)} · added {dateFormat.format(new Date(source.createdAt))}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`${ids}-page`} className={`${LABEL} text-xs`}>
            Page
          </label>
          <input
            id={`${ids}-page`}
            inputMode="numeric"
            className={`${INPUT} w-20 py-1`}
            value={page}
            placeholder="1"
            aria-invalid={badPage}
            onChange={e => setPage(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void open()
              }
            }}
          />
        </div>
        <button type="button" className={BTN_SECONDARY} onClick={() => void open()} disabled={badPage}>
          Open
        </button>
        {canManage && !renaming && !confirming && (
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setRenaming(true)}>
              Rename
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={() => setConfirming(true)}>
              Delete
            </button>
          </>
        )}
        {confirming && (
          <span className="flex flex-wrap items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
            Delete this source and its PDF? This can't be undone.
            <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void act(() => api.deleteSource(source.id), 'Source deleted.')}>
              Delete source
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        )}
      </div>
      {badPage && <p className="text-xs text-red-600 dark:text-red-400">Enter a page number, or leave it empty for page 1.</p>}
      {importSlot}
    </li>
  )
}
