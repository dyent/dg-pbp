import { useCallback, useContext, useEffect, useId, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '../characters/ui'
import { requestCharacter } from '../npcTags/characterOpener'
import { OpenRecordContext, requestRecord } from '../records/recordOpener'
import { sourceLink } from '../sources/sourcesApi'
import type { CampaignSource } from '../sources/sourcesModel'
import * as api from './importApi'
import {
  SUGGESTION_KIND_PLURALS,
  approveAllOrder,
  groupSuggestions,
  mergeTargetKind,
  reviewSummary,
  type ImportSuggestion,
} from './importModel'

interface ReviewListProps {
  runId: string
  channelId: string
  source: CampaignSource
  /** The GM may change things (campaign not archived). */
  canReview: boolean
}

/** Adds one suggestion to the campaign (handouts become campaign files); returns what to tell the GM. */
async function approveOne(s: ImportSuggestion, channelId: string, source: CampaignSource, edit?: api.SuggestionEdit): Promise<string> {
  if (s.kind === 'handout') {
    if (!s.handout) throw new Error('This handout has no pages.')
    const result = await api.approveHandout({
      channelId,
      sourceObjectPath: source.objectPath,
      sourceTitle: source.title,
      suggestion: { id: s.id, name: edit?.name ?? s.name, summary: s.summary, handout: s.handout, handoutArea: s.handoutArea },
    })
    return `${result.asPicture ? 'Picture' : 'Pages'} added to Files → Handouts${result.attachedTo ? `, attached to ${result.attachedTo}` : ''}.`
  }
  await api.approveSuggestion(s.id, edit)
  return s.kind === 'clue' && s.checklist.length ? `Added, with ${s.checklist.length} checklist point${s.checklist.length === 1 ? '' : 's'}.` : 'Added.'
}

/** One run's suggestions with Approve / Edit / Merge / Reject (Phase 3 steps 4 and 5). */
export function ReviewList({ runId, channelId, source, canReview }: ReviewListProps) {
  const { addToast } = useToast()
  const [items, setItems] = useState<ImportSuggestion[] | null>(null)
  const [error, setError] = useState(false)
  const [token, setToken] = useState(0)
  const [busyAll, setBusyAll] = useState(false)

  useEffect(() => {
    let mounted = true
    api
      .listSuggestions(runId)
      .then(list => {
        if (!mounted) return
        setItems(list)
        setError(false)
      })
      .catch(err => {
        console.error('Failed to load suggestions:', err)
        if (mounted) setError(true)
      })
    return () => {
      mounted = false
    }
  }, [runId, token])

  const reload = useCallback(() => setToken(t => t + 1), [])

  const approveAll = async (list: ImportSuggestion[]) => {
    setBusyAll(true)
    let added = 0
    const problems: string[] = []
    for (const s of approveAllOrder(list)) {
      try {
        await approveOne(s, channelId, source)
        added++
      } catch (err) {
        problems.push(`${s.link ? `${s.link.from} — ${s.link.label} → ${s.link.to}` : s.name}: ${err instanceof Error ? err.message : 'failed'}`)
      }
    }
    setBusyAll(false)
    reload()
    const duplicates = list.filter(s => s.status === 'pending' && s.possibleDuplicateOf).length
    const left = [duplicates > 0 && `${duplicates} possible duplicate${duplicates === 1 ? '' : 's'} left for you to decide`, ...problems].filter(Boolean)
    addToast(`Added ${added}.${left.length ? ` ${left.join('; ')}.` : ''}`, problems.length ? 'error' : 'success')
  }

  if (error) {
    return (
      <p className="mt-2 text-xs text-red-600 dark:text-red-400">
        Couldn't load the suggestions.{' '}
        <button type="button" className="underline" onClick={reload}>
          Retry
        </button>
      </p>
    )
  }
  if (!items) return <div className="mt-2 h-8 animate-pulse rounded bg-surface-200 dark:bg-surface-700" aria-label="Loading suggestions" />

  const waiting = approveAllOrder(items).length
  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-surface-600 dark:text-surface-300">{reviewSummary(items) || 'No suggestions.'}</p>
        {canReview && waiting > 0 && (
          <button type="button" className={BTN_SECONDARY} disabled={busyAll} onClick={() => void approveAll(items)}>
            {busyAll ? 'Adding…' : `Approve all waiting (${waiting})`}
          </button>
        )}
      </div>
      <p className="text-xs text-surface-500 dark:text-surface-400">
        Approved NPCs arrive hidden and records GM only, labelled as coming from the book. Possible duplicates are left for you.
      </p>
      {groupSuggestions(items).map(group => (
        <section key={group.kind} aria-label={SUGGESTION_KIND_PLURALS[group.kind]}>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">{SUGGESTION_KIND_PLURALS[group.kind]}</h5>
          <ul className="mt-1 space-y-2">
            {group.items.map(s => (
              <SuggestionItem key={s.id} suggestion={s} channelId={channelId} source={source} canReview={canReview && !busyAll} onChanged={reload} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

type Mode = 'view' | 'edit' | 'merge'

function SuggestionItem({
  suggestion: s,
  channelId,
  source,
  canReview,
  onChanged,
}: {
  suggestion: ImportSuggestion
  channelId: string
  source: CampaignSource
  canReview: boolean
  onChanged: () => void
}) {
  const { addToast } = useToast()
  const openRecordHere = useContext(OpenRecordContext)
  const [mode, setMode] = useState<Mode>('view')
  const [busy, setBusy] = useState(false)
  const done = s.status === 'approved' || s.status === 'merged'
  const rejected = s.status === 'rejected'
  const title = s.link ? `${s.link.from} — ${s.link.label} → ${s.link.to}` : s.name

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      const said = await action()
      addToast(typeof said === 'string' ? said : success, 'success')
      setMode('view')
      onChanged()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Something went wrong.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const openPage = async (page: number) => {
    const tab = window.open('', '_blank')
    try {
      const url = await sourceLink(source.objectPath, page)
      if (tab) tab.location.href = url
      else window.location.assign(url)
    } catch (err) {
      tab?.close()
      addToast(err instanceof Error ? err.message : 'Could not open the source.', 'error')
    }
  }

  const openCreated = () => {
    if (!s.created) return
    if (s.created.type === 'record') (openRecordHere ?? requestRecord)(s.created.id)
    else if (s.created.type === 'character') requestCharacter(s.created.id)
  }

  return (
    <li className={`text-sm text-surface-800 dark:text-surface-200 ${rejected ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-medium ${rejected ? 'line-through' : ''}`}>{title}</span>
        {s.handout && (
          <span className="text-xs text-surface-500 dark:text-surface-400">
            (page{s.handout.firstPage === s.handout.lastPage ? ` ${s.handout.firstPage}` : `s ${s.handout.firstPage}–${s.handout.lastPage}`})
          </span>
        )}
        {s.pages.map(p => (
          <button key={p} type="button" className="text-xs text-primary-600 hover:underline dark:text-primary-400" onClick={() => void openPage(p)}>
            p. {p}
          </button>
        ))}
        {s.possibleDuplicateOf && !done && (
          <span className={`${BADGE} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`}>Maybe {s.possibleDuplicateOf}</span>
        )}
        {done && (
          <span className={`${BADGE} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200`}>
            {s.status === 'merged' ? 'Merged' : s.created?.type === 'file' ? `In Files → Handouts${s.attachedTo ? `, on ${s.attachedTo}` : ''}` : 'Added'}
          </span>
        )}
        {done && (s.created?.type === 'record' || s.created?.type === 'character') && (
          <button type="button" className="text-xs text-primary-600 hover:underline dark:text-primary-400" onClick={openCreated}>
            Open
          </button>
        )}
        {rejected && <span className={`${BADGE} bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300`}>Rejected</span>}
      </div>
      {s.summary && <p className="text-xs text-surface-600 dark:text-surface-300">{s.summary}</p>}
      {s.kind === 'handout' && s.relatedTo && !s.attachedTo && (
        <p className="text-xs text-surface-500 dark:text-surface-400">Belongs to {s.relatedTo} (attached when you approve, if it exists)</p>
      )}
      {s.checklist.length > 0 && (
        <div className="text-xs text-surface-600 dark:text-surface-300">
          <span className="font-medium">GM checklist:</span>
          <ul className="list-disc pl-5">
            {s.checklist.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'view' && s.fields.length > 0 && (
        <details className="text-xs text-surface-600 dark:text-surface-300">
          <summary className="cursor-pointer">{s.fields.length} field{s.fields.length === 1 ? '' : 's'}</summary>
          <dl className="mt-1 space-y-1 pl-3">
            {s.fields.map(f => (
              <div key={f.key}>
                <dt className="font-medium">{f.label}</dt>
                <dd className="whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {canReview && s.status === 'pending' && mode === 'view' && (
        <div className="mt-1 flex flex-wrap gap-1">
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void act(() => approveOne(s, channelId, source), 'Added.')}>
            {busy ? 'Adding…' : 'Approve'}
          </button>
          {s.kind !== 'link' && (
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setMode('edit')}>
              Edit first
            </button>
          )}
          {mergeTargetKind(s.kind) && (
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setMode('merge')}>
              Merge into…
            </button>
          )}
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void act(() => api.setSuggestionRejected(s.id, true), 'Rejected.')}>
            Reject
          </button>
        </div>
      )}
      {canReview && rejected && (
        <button type="button" className="mt-1 text-xs text-primary-600 hover:underline dark:text-primary-400" disabled={busy} onClick={() => void act(() => api.setSuggestionRejected(s.id, false), 'Back on the list.')}>
          Undo
        </button>
      )}

      {mode === 'edit' && (
        <EditForm
          suggestion={s}
          busy={busy}
          onCancel={() => setMode('view')}
          onSave={edit => act(() => approveOne(s, channelId, source, edit), 'Added.')}
        />
      )}
      {mode === 'merge' && (
        <MergeForm
          suggestion={s}
          channelId={channelId}
          busy={busy}
          onCancel={() => setMode('view')}
          onMerge={target =>
            act(async () => {
              await api.mergeSuggestion(s.id, target)
            }, `Merged into ${target.name}. Only empty or missing fields were filled.`)
          }
        />
      )}
    </li>
  )
}

function EditForm({
  suggestion: s,
  busy,
  onCancel,
  onSave,
}: {
  suggestion: ImportSuggestion
  busy: boolean
  onCancel: () => void
  onSave: (edit: api.SuggestionEdit) => void
}) {
  const ids = useId()
  const [name, setName] = useState(s.name.slice(0, 80))
  const [fields, setFields] = useState(s.fields.map(f => ({ ...f })))
  const badName = !name.trim()

  return (
    <form
      aria-label={`Edit ${s.name}`}
      className="mt-2 space-y-2 rounded-md border border-surface-200 p-2 dark:border-surface-700"
      onSubmit={e => {
        e.preventDefault()
        if (!badName) onSave({ name: name.trim(), fields: fields.filter(f => f.value.trim()) })
      }}
    >
      <div>
        <label htmlFor={`${ids}-name`} className={`${LABEL} text-xs`}>
          Name
        </label>
        <input id={`${ids}-name`} className={INPUT} value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-invalid={badName} />
        {badName && <p className="text-xs text-red-600 dark:text-red-400">Give it a name.</p>}
      </div>
      {fields.map((f, i) => (
        <div key={f.key}>
          <label htmlFor={`${ids}-${i}`} className={`${LABEL} text-xs`}>
            {f.label}
          </label>
          <textarea
            id={`${ids}-${i}`}
            className={INPUT}
            rows={2}
            value={f.value}
            maxLength={4000}
            onChange={e => setFields(prev => prev.map((p, j) => (j === i ? { ...p, value: e.target.value } : p)))}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={busy || badName}>
          {busy ? 'Adding…' : 'Approve'}
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function MergeForm({
  suggestion: s,
  channelId,
  busy,
  onCancel,
  onMerge,
}: {
  suggestion: ImportSuggestion
  channelId: string
  busy: boolean
  onCancel: () => void
  onMerge: (target: { type: 'character' | 'record'; id: string; name: string }) => void
}) {
  const ids = useId()
  const [targets, setTargets] = useState<{ type: 'character' | 'record'; id: string; name: string }[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [chosen, setChosen] = useState('')

  useEffect(() => {
    let mounted = true
    api
      .listMergeTargets(channelId, s.kind)
      .then(list => {
        if (!mounted) return
        setTargets(list)
        const guess = s.possibleDuplicateOf ?? s.name
        const match = list.find(t => t.name.toLowerCase() === guess.toLowerCase())
        if (match) setChosen(match.id)
      })
      .catch(err => {
        console.error('Failed to load merge targets:', err)
        if (mounted) setLoadError(true)
      })
    return () => {
      mounted = false
    }
  }, [channelId, s.kind, s.name, s.possibleDuplicateOf])

  const target = targets?.find(t => t.id === chosen)
  return (
    <form
      aria-label={`Merge ${s.name}`}
      className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-surface-200 p-2 dark:border-surface-700"
      onSubmit={e => {
        e.preventDefault()
        if (target) onMerge(target)
      }}
    >
      {loadError ? (
        <p className="text-xs text-red-600 dark:text-red-400">Couldn't load what to merge into.</p>
      ) : targets && targets.length === 0 ? (
        <p className="text-xs text-surface-500 dark:text-surface-400">There is nothing of this kind to merge into yet.</p>
      ) : (
        <div>
          <label htmlFor={`${ids}-target`} className={`${LABEL} text-xs`}>
            Merge into
          </label>
          <select id={`${ids}-target`} className={INPUT} value={chosen} disabled={!targets} onChange={e => setChosen(e.target.value)}>
            <option value="">{targets ? 'Choose…' : 'Loading…'}</option>
            {(targets ?? []).map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="submit" className={BTN_PRIMARY} disabled={busy || !target}>
        {busy ? 'Merging…' : 'Merge'}
      </button>
      <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      <p className="w-full text-xs text-surface-500 dark:text-surface-400">Fills only empty or missing fields; nothing you wrote is changed.</p>
    </form>
  )
}
