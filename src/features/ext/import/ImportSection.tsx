import { useCallback, useEffect, useId, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '../characters/ui'
import { formatUsd } from '../ai/aiApi'
import { parsePage, type CampaignSource } from '../sources/sourcesModel'
import * as api from './importApi'
import { ReviewList } from './ReviewList'
import { SUGGESTED_IMPORT_PAGES, bigRunNote, estimateCost, importRangeProblem, isStalled, type ImportRun } from './importModel'

const POLL_MS = 4000
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

interface ImportSectionProps {
  channelId: string
  source: CampaignSource
  /** The GM may start imports (server admin, AI allowed, campaign not archived). */
  canImport: boolean
  /** The GM may review suggestions (campaign not archived). */
  canReview: boolean
  /** Called when a run ends, so spending can be shown afresh. */
  onRunEnded: () => void
}

function useRuns(sourceId: string) {
  const [runs, setRuns] = useState<ImportRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let mounted = true
    api
      .listRuns(sourceId)
      .then(list => {
        if (!mounted) return
        setRuns(list)
        setError(false)
      })
      .catch(err => {
        console.error('Failed to load imports:', err)
        if (mounted) setError(true)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [sourceId, token])

  const reload = useCallback(() => setToken(t => t + 1), [])
  return { runs, loading, error, reload }
}

/** One source's AI imports (Phase 3 step 3): choose pages, run, and see what was found. */
export function ImportSection({ channelId, source, canImport, canReview, onRunEnded }: ImportSectionProps) {
  const { addToast } = useToast()
  const ids = useId()
  const { runs, loading, error, reload } = useRuns(source.id)
  const [open, setOpen] = useState(false)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const firstPage = parsePage(first)
  const lastPage = parsePage(last)
  const problem = importRangeProblem(firstPage, lastPage)
  const anyRunning = runs.some(r => r.status === 'running' && !isStalled(r))

  // While a run is going, check on it every few seconds; tell the parent when it ends.
  useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(reload, POLL_MS)
    return () => {
      clearInterval(timer)
      onRunEnded()
    }
  }, [anyRunning, reload, onRunEnded])

  const start = async () => {
    setTried(true)
    if (problem || firstPage === null || lastPage === null) return
    try {
      await api.startImport({
        channelId,
        sourceId: source.id,
        objectPath: source.objectPath,
        firstPage,
        lastPage,
        onStage: setStage,
      })
      addToast(`Importing pages ${firstPage}–${lastPage}. This can take a minute or two.`, 'success')
      setOpen(false)
      setTried(false)
      reload()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not start the import.', 'error')
    } finally {
      setStage(null)
    }
  }

  if (!canImport && !loading && runs.length === 0 && !error) return null

  return (
    <div className="space-y-2 border-t border-surface-100 pt-2 dark:border-surface-700">
      {canImport && !open && (
        <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(true)} disabled={anyRunning} title={anyRunning ? 'Wait for the current import to finish' : undefined}>
          Import pages with AI
        </button>
      )}
      {canImport && open && (
        <form
          aria-label="Import pages"
          className="space-y-2"
          onSubmit={e => {
            e.preventDefault()
            void start()
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={`${ids}-first`} className={`${LABEL} text-xs`}>
                From page
              </label>
              <input id={`${ids}-first`} inputMode="numeric" className={`${INPUT} w-20 py-1`} value={first} onChange={e => setFirst(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${ids}-last`} className={`${LABEL} text-xs`}>
                To page
              </label>
              <input id={`${ids}-last`} inputMode="numeric" className={`${INPUT} w-20 py-1`} value={last} onChange={e => setLast(e.target.value)} />
            </div>
            <button type="submit" className={BTN_PRIMARY} disabled={stage !== null}>
              {stage ?? 'Import'}
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(false)} disabled={stage !== null}>
              Cancel
            </button>
          </div>
          <p className="text-xs text-surface-500 dark:text-surface-400">
            PDF page numbers, as your PDF viewer shows them. About {SUGGESTED_IMPORT_PAGES} pages at a time works best; a chapter a little longer is fine.
            {!problem && firstPage !== null && lastPage !== null && ` Estimated cost ${estimateCost(lastPage - firstPage + 1)}.`}
          </p>
          {!problem && firstPage !== null && lastPage !== null && bigRunNote(lastPage - firstPage + 1) && (
            <p className="text-xs text-amber-700 dark:text-amber-300">{bigRunNote(lastPage - firstPage + 1)}</p>
          )}
          {tried && problem && <p className="text-xs text-red-600 dark:text-red-400">{problem}</p>}
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Couldn't load the imports.{' '}
          <button type="button" className="underline" onClick={reload}>
            Retry
          </button>
        </p>
      ) : (
        runs.length > 0 && (
          <ul className="space-y-1" aria-label="Imports">
            {runs.map(run => (
              <RunItem key={run.id} run={run} channelId={channelId} source={source} canManage={canReview} onDeleted={reload} />
            ))}
          </ul>
        )
      )}
    </div>
  )
}

function RunItem({
  run,
  channelId,
  source,
  canManage,
  onDeleted,
}: {
  run: ImportRun
  channelId: string
  source: CampaignSource
  canManage: boolean
  onDeleted: () => void
}) {
  const { addToast } = useToast()
  const [showing, setShowing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const stalled = isStalled(run)
  const pages = run.firstPage === run.lastPage ? `Page ${run.firstPage}` : `Pages ${run.firstPage}–${run.lastPage}`

  const remove = async () => {
    try {
      await api.deleteRun(run.id)
      addToast('Import removed.', 'success')
      onDeleted()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not remove the import.', 'error')
    }
  }

  return (
    <li className="rounded bg-surface-50 p-2 text-sm dark:bg-surface-800/60">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-surface-800 dark:text-surface-100">{pages}</span>
        {run.status === 'running' && !stalled && (
          <span className={`${BADGE} animate-pulse bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200`}>Reading…</span>
        )}
        {stalled && <span className={`${BADGE} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`}>Stopped</span>}
        {run.status === 'done' && (
          <span className={`${BADGE} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200`}>
            {run.suggestionCount} suggestion{run.suggestionCount === 1 ? '' : 's'}
            {run.combinedCount > 0 && `, ${run.combinedCount} combined with earlier pages`}
          </span>
        )}
        {run.status === 'failed' && <span className={`${BADGE} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`}>Failed</span>}
        <span className="text-xs text-surface-500 dark:text-surface-400">
          {dateFormat.format(new Date(run.createdAt))}
          {run.status !== 'running' && ` · ${formatUsd(run.costUsd)}`}
        </span>
        <span className="ml-auto flex gap-1">
          {run.status === 'done' && run.suggestionCount > 0 && (
            <button type="button" className="text-xs text-primary-600 hover:underline dark:text-primary-400" onClick={() => setShowing(s => !s)} aria-expanded={showing}>
              {showing ? 'Hide' : 'Review'}
            </button>
          )}
          {canManage && (run.status !== 'running' || stalled) && !confirming && (
            <button type="button" className="text-xs text-red-600 hover:underline dark:text-red-400" onClick={() => setConfirming(true)}>
              Remove
            </button>
          )}
          {confirming && (
            <span className="flex items-center gap-2 text-xs">
              Remove this import and its suggestions?
              <button type="button" className="font-medium text-red-600 hover:underline dark:text-red-400" onClick={() => void remove()}>
                Yes, remove
              </button>
              <button type="button" className="hover:underline" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          )}
        </span>
      </div>
      {run.status === 'failed' && run.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{run.error}</p>}
      {stalled && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">This import stopped without finishing. Remove it and try again.</p>}
      {showing && <ReviewList runId={run.id} channelId={channelId} source={source} canReview={canManage} />}
    </li>
  )
}

