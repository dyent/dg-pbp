import { useCallback, useContext, useEffect, useId, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { dateAt, dayToIso, formatDay, isoToDay } from '../calendar/calendarModel'
import { useCalendar } from '../calendar/calendarContext'
import { BADGE, BTN_ICON, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, SECTION_TITLE } from '../characters/ui'
import { OpenCharacterContext, requestCharacter } from '../npcTags/characterOpener'
import * as api from './clueApi'
import { OpenRecordContext, requestRecord } from './recordOpener'
import { CLUE_STATUSES, CLUE_STATUS_LABELS, type CampaignRecord, type ClueStatus } from './recordModel'

const STATUS_CLASSES: Record<ClueStatus, string> = {
  unexamined: 'bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-200',
  investigated: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
}

export function ClueStatusBadge({ status }: { status: ClueStatus }) {
  return (
    <span className={`${BADGE} ${STATUS_CLASSES[status]}`} title="Clue status">
      {CLUE_STATUS_LABELS[status]}
    </span>
  )
}

interface ClueSectionProps {
  channelId: string
  record: CampaignRecord
  isGM: boolean
  isArchived: boolean
  /** The record list shows the status, so it reloads after a change. */
  onChanged: () => void
}

/**
 * Clue extras (Phase 2b step 4): status, who found it / where / when, and the
 * GM's checklist of what the clue really points to.
 */
export function ClueSection({ channelId, record, isGM, isArchived, onChanged }: ClueSectionProps) {
  const { addToast } = useToast()
  const [details, setDetails] = useState<api.ClueDetails | null>(null)
  const [error, setError] = useState(false)
  const [token, setToken] = useState(0)
  const [editingFound, setEditingFound] = useState(false)
  const canManage = isGM && !isArchived
  const recordId = record.id

  useEffect(() => {
    let mounted = true
    api
      .getClueDetails(recordId)
      .then(d => {
        if (!mounted) return
        setDetails(d)
        setError(false)
      })
      .catch(err => {
        console.error('Failed to load the clue details:', err)
        if (mounted) setError(true)
      })
    return () => {
      mounted = false
    }
  }, [recordId, token])

  const reload = useCallback(() => setToken(t => t + 1), [])

  const run = async (action: () => Promise<void>, success: string): Promise<boolean> => {
    try {
      await action()
      addToast(success, 'success')
      reload()
      onChanged()
      return true
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Something went wrong.', 'error')
      return false
    }
  }

  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
        <span>Couldn't load the clue details.</span>
        <button type="button" onClick={reload} className={BTN_SECONDARY}>
          Retry
        </button>
      </div>
    )
  }
  if (!details) return <div className="h-16 animate-pulse rounded bg-surface-100 dark:bg-surface-700" aria-label="Loading clue details" />

  return (
    <section aria-label="Clue" className="space-y-3 rounded-md border border-surface-200 p-3 dark:border-surface-700">
      {/* Players (and an archived campaign) see the status badge in the header. */}
      {canManage && (
      <div className="flex flex-wrap items-center gap-2">
        <h4 className={SECTION_TITLE}>Status</h4>
          <select
            aria-label="Clue status"
            className={`${INPUT} w-auto py-1`}
            value={details.status}
            onChange={e => {
              const status = e.target.value as ClueStatus
              void run(() => api.setClueStatus(recordId, status), `Status set to ${CLUE_STATUS_LABELS[status]}.`)
            }}
          >
            {CLUE_STATUSES.map(s => (
              <option key={s} value={s}>
                {CLUE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
      </div>
      )}

      {editingFound ? (
        <FoundForm
          channelId={channelId}
          details={details}
          onCancel={() => setEditingFound(false)}
          onSave={async found => {
            if (await run(() => api.setClueFound(recordId, found), 'Saved where the clue was found.')) setEditingFound(false)
          }}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <FoundText details={details} isGM={isGM} />
          {canManage && (
            <button type="button" className={BTN_SECONDARY} onClick={() => setEditingFound(true)}>
              Edit found
            </button>
          )}
        </div>
      )}

      {isGM && <Checklist channelId={channelId} recordId={recordId} canManage={canManage} />}
    </section>
  )
}

const CHIP =
  'inline-flex items-center rounded bg-teal-50 px-1.5 py-0.5 font-medium text-teal-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-teal-950 dark:text-teal-200'

/** "Found by Reyes at the morgue on Fri 24 Oct 1997" with the names as links. */
function FoundText({ details, isGM }: { details: api.ClueDetails; isGM: boolean }) {
  const openCharacterHere = useContext(OpenCharacterContext)
  const openRecordHere = useContext(OpenRecordContext)
  const { foundBy, foundAt, foundDay } = details
  if (!foundBy && !foundAt && foundDay === null) {
    return <p className="flex-1 text-sm text-surface-500 dark:text-surface-400">{isGM ? 'Not found yet.' : 'Where it was found isn’t recorded.'}</p>
  }
  return (
    <p className="flex-1 text-sm leading-7 text-surface-700 dark:text-surface-300">
      Found
      {foundBy && (
        <>
          {' by '}
          <button type="button" className={CHIP} onClick={() => (openCharacterHere ?? requestCharacter)(foundBy.id)}>
            {foundBy.name}
          </button>
        </>
      )}
      {foundAt && (
        <>
          {' at '}
          <button type="button" className={CHIP} onClick={() => (openRecordHere ?? requestRecord)(foundAt.id)}>
            {foundAt.name}
          </button>
        </>
      )}
      {foundDay !== null && ` on ${formatDay(foundDay)}`}.
    </p>
  )
}

function FoundForm({
  channelId,
  details,
  onSave,
  onCancel,
}: {
  channelId: string
  details: api.ClueDetails
  onSave: (found: api.FoundDraft) => Promise<void>
  onCancel: () => void
}) {
  const ids = useId()
  const { changes } = useCalendar()
  const [options, setOptions] = useState<{ pcs: api.FoundOption[]; locations: api.FoundOption[] } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [byId, setById] = useState(details.foundBy?.id ?? '')
  const [atId, setAtId] = useState(details.foundAt?.id ?? '')
  // A new "found" defaults to the campaign's current in-game date.
  const startDay = details.foundDay ?? (details.foundBy || details.foundAt ? null : dateAt(changes, null)?.day ?? null)
  const [iso, setIso] = useState(startDay !== null ? dayToIso(startDay) : '')
  const [saving, setSaving] = useState(false)
  const day = iso.trim() ? isoToDay(iso) : null
  const badDate = iso.trim() !== '' && day === null

  useEffect(() => {
    let mounted = true
    api
      .listFoundOptions(channelId)
      .then(o => {
        if (mounted) setOptions(o)
      })
      .catch(err => {
        console.error('Failed to load PCs and locations:', err)
        if (mounted) setLoadError(true)
      })
    return () => {
      mounted = false
    }
  }, [channelId])

  const save = async (found: api.FoundDraft) => {
    setSaving(true)
    await onSave(found)
    setSaving(false)
  }

  return (
    <form
      aria-label="Where the clue was found"
      className="space-y-2"
      onSubmit={e => {
        e.preventDefault()
        if (!badDate) void save({ byId: byId || null, atId: atId || null, day })
      }}
    >
      {loadError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Couldn't load the PCs and locations.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor={`${ids}-by`} className={LABEL}>
            Found by
          </label>
          <select id={`${ids}-by`} className={INPUT} value={byId} disabled={!options} onChange={e => setById(e.target.value)}>
            <option value="">{options ? 'Nobody in particular' : 'Loading…'}</option>
            {options?.pcs.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-at`} className={LABEL}>
            Where
          </label>
          <select id={`${ids}-at`} className={INPUT} value={atId} disabled={!options} onChange={e => setAtId(e.target.value)}>
            <option value="">{options ? 'Not recorded' : 'Loading…'}</option>
            {options?.locations.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-day`} className={LABEL}>
            In-game date
          </label>
          <input id={`${ids}-day`} type="date" className={INPUT} value={iso} aria-invalid={badDate} onChange={e => setIso(e.target.value)} />
        </div>
      </div>
      {badDate && <p className="text-xs text-red-600 dark:text-red-400">Enter a full date, or leave it empty.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={saving || badDate}>
          Save
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className={BTN_SECONDARY} disabled={saving} onClick={() => void save({ byId: null, atId: null, day: null })}>
          Clear
        </button>
      </div>
    </form>
  )
}

/** The GM's checklist of what the clue points to, with "worked out" ticks. */
function Checklist({ channelId, recordId, canManage }: { channelId: string; recordId: string; canManage: boolean }) {
  const { addToast } = useToast()
  const [points, setPoints] = useState<api.CluePoint[] | null>(null)
  const [error, setError] = useState(false)
  const [token, setToken] = useState(0)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    api
      .listCluePoints(recordId)
      .then(list => {
        if (!mounted) return
        setPoints(list)
        setError(false)
      })
      .catch(err => {
        console.error('Failed to load the checklist:', err)
        if (mounted) setError(true)
      })
    return () => {
      mounted = false
    }
  }, [recordId, token])

  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      setToken(t => t + 1)
      return true
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Something went wrong.', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const done = points?.filter(p => p.workedOut).length ?? 0
  const tooLong = draft.trim().length > api.CLUE_POINT_MAX

  return (
    <div className="space-y-2" aria-label="GM checklist" role="group">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className={SECTION_TITLE}>GM checklist</h4>
        {points && points.length > 0 && (
          <span className="text-xs text-surface-500 dark:text-surface-400">
            {done} of {points.length} worked out
          </span>
        )}
      </div>
      <p className="text-xs text-surface-500 dark:text-surface-400">What the clue really points to. Only you see this; tick a line once the agents have worked it out.</p>
      {error ? (
        <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <span>Couldn't load the checklist.</span>
          <button type="button" onClick={() => setToken(t => t + 1)} className={BTN_SECONDARY}>
            Retry
          </button>
        </div>
      ) : !points ? (
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-200 dark:bg-surface-700" aria-label="Loading checklist" />
      ) : points.length === 0 ? (
        <p className="text-sm text-surface-400 dark:text-surface-500">Nothing on the checklist yet.</p>
      ) : (
        <ul className="space-y-1">
          {points.map(p => (
            <li key={p.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                checked={p.workedOut}
                disabled={!canManage || busy}
                aria-label={`Worked out: ${p.body}`}
                onChange={e => {
                  const workedOut = e.target.checked
                  void act(() => api.updateCluePoint(p.id, { worked_out: workedOut }))
                }}
              />
              <span className={`flex-1 break-words ${p.workedOut ? 'text-surface-500 line-through dark:text-surface-400' : 'text-surface-800 dark:text-surface-200'}`}>
                {p.body}
              </span>
              {canManage && (
                <button
                  type="button"
                  className={`${BTN_ICON} h-6 w-6`}
                  aria-label={`Remove: ${p.body}`}
                  disabled={busy}
                  onClick={() => void act(() => api.deleteCluePoint(p.id))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && points && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async e => {
            e.preventDefault()
            if (!draft.trim() || tooLong) return
            const order = points.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1
            if (await act(() => api.addCluePoint(recordId, channelId, draft, order))) setDraft('')
          }}
        >
          <input
            className={`${INPUT} min-w-0 flex-1`}
            aria-label="New checklist point"
            placeholder="e.g. The glove belongs to Dr Hale"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <button type="submit" className={BTN_PRIMARY} disabled={busy || !draft.trim() || tooLong}>
            Add
          </button>
          {tooLong && <p className="w-full text-xs text-red-600 dark:text-red-400">Points can be at most {api.CLUE_POINT_MAX} characters.</p>}
        </form>
      )}
    </div>
  )
}
