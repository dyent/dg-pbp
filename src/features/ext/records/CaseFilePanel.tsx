// cspell:words organisation organisations
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useEscapeToClose } from '../../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { useToast } from '../../../contexts/ToastContext'
import type { PlayerOption } from '../characters/GmControls'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, SECTION_TITLE } from '../characters/ui'
import { createRecord } from './recordApi'
import { OpenRecordContext } from './recordOpener'
import { RecordIcon } from './RecordIcon'
import { RecordProfile, SharingBadge } from './RecordProfile'
import { ClueStatusBadge } from './ClueSection'
import {
  KIND_HINTS,
  KIND_LABELS,
  CLUE_STATUSES,
  CLUE_STATUS_LABELS,
  KIND_PLURALS,
  RECORD_KINDS,
  RECORD_LIMITS,
  groupRecords,
  newRecordProblem,
  type RecordFilter,
  type ClueStatus,
  type RecordKind,
} from './recordModel'
import { useRecords } from './useRecords'
import { SourcesView } from '../sources/SourcesView'

export interface CaseFilePanelProps {
  channelId: string
  isGM: boolean
  isArchived: boolean
  myUserId: string | undefined
  /** Campaign players (not the GM), for sharing with chosen players. */
  players: PlayerOption[]
  nameOf: (userId: string) => string
  onClose: () => void
  /** Open on this record (a record tag in the chat was clicked). */
  initialRecordId?: string | null
}

type View = { mode: 'none' } | { mode: 'record'; id: string } | { mode: 'new' }

export function CaseFilePanel({ channelId, isGM, isArchived, myUserId, players, nameOf, onClose, initialRecordId }: CaseFilePanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const { records, tags, loading, error, reload } = useRecords(channelId, isGM)
  const [view, setView] = useState<View>(initialRecordId ? { mode: 'record', id: initialRecordId } : { mode: 'none' })
  const [filter, setFilter] = useState<RecordFilter>({ search: '', kind: 'all', tagId: null, status: 'all' })
  const [editing, setEditing] = useState(false)
  // GM only: the records list, or the source library (Phase 3).
  const [tab, setTab] = useState<'records' | 'sources'>('records')
  const busy = editing || view.mode === 'new'
  const canManage = isGM && !isArchived

  useEscapeToClose(() => {
    if (!busy) onClose()
  })
  useFocusTrap(dialogRef)

  const groups = useMemo(() => groupRecords(records, filter), [records, filter])
  const selectedId = view.mode === 'record' ? view.id : null
  const selected = records.find(r => r.id === selectedId) ?? null
  const onEditingChange = useCallback((value: boolean) => setEditing(value), [])
  const showingDetail = view.mode !== 'none'
  // A record tag inside this panel (e.g. in Activity) switches to that record.
  const openRecord = useCallback((id: string) => {
    if (busy) return
    setTab('records')
    setView({ mode: 'record', id })
  }, [busy])

  return (
    <OpenRecordContext.Provider value={openRecord}>
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-surface-600 bg-opacity-75 sm:items-center dark:bg-surface-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={() => !busy && onClose()} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ext-case-file-title"
        className="relative flex h-full w-full flex-col bg-white shadow-xl sm:h-[90vh] sm:max-w-5xl sm:rounded-lg dark:bg-surface-800"
      >
        <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3 dark:border-surface-700">
          <div className="flex items-center gap-2">
            {showingDetail && (
              <button type="button" className={`${BTN_SECONDARY} md:hidden`} onClick={() => setView({ mode: 'none' })} disabled={busy}>
                ← List
              </button>
            )}
            <h2 id="ext-case-file-title" className="text-lg font-bold text-surface-900 dark:text-surface-100">
              Case files
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1 text-surface-400 hover:text-surface-600 disabled:opacity-30 dark:hover:text-surface-200"
            aria-label="Close case file"
            title={busy ? 'Save or cancel first' : undefined}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-3">
          {isGM && (
            <div role="group" aria-label="Case files section" className="mb-3 flex gap-1">
              {(['records', 'sources'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tab === t}
                  disabled={busy}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-sm font-medium disabled:opacity-50 ${
                    tab === t
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600'
                  }`}
                >
                  {t === 'records' ? 'Records' : 'Sources (GM only)'}
                </button>
              ))}
            </div>
          )}
          {isGM && tab === 'sources' ? (
            <SourcesView channelId={channelId} isArchived={isArchived} />
          ) : error ? (
            <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <span>Couldn't load the case file.</span>
              <button type="button" onClick={reload} className={BTN_SECONDARY}>
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="animate-pulse space-y-3 py-2" aria-label="Loading case file">
              <div className="h-10 rounded bg-surface-200 dark:bg-surface-700" />
              <div className="h-10 rounded bg-surface-200 dark:bg-surface-700" />
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[18rem_1fr]">
              <div className={`flex min-h-0 flex-col gap-3 pb-4 ${showingDetail ? 'hidden md:flex' : ''}`}>
                {canManage && (
                  <button type="button" className={BTN_PRIMARY} onClick={() => setView({ mode: 'new' })} disabled={busy}>
                    + New record
                  </button>
                )}
                {records.length > 0 && (
                  <Filters filter={filter} onChange={setFilter} tags={isGM ? tags : []} hasClues={records.some(r => r.kind === 'clue')} />
                )}
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                  {records.length === 0 ? (
                    <p className="py-6 text-center text-sm text-surface-500 dark:text-surface-400">
                      {isGM
                        ? 'No records yet. Add the operations, locations, organisations and clues of your campaign.'
                        : 'Nothing has been added to your case file yet.'}
                    </p>
                  ) : groups.length === 0 ? (
                    <p className="py-6 text-center text-sm text-surface-500 dark:text-surface-400">No records match.</p>
                  ) : (
                    groups.map(group => (
                      <section key={group.kind} aria-label={KIND_PLURALS[group.kind]}>
                        <h3 className={SECTION_TITLE}>{KIND_PLURALS[group.kind]}</h3>
                        <ul className="mt-1 space-y-1">
                          {group.records.map(r => {
                            const active = r.id === selectedId
                            return (
                              <li key={r.id}>
                                <button
                                  type="button"
                                  onClick={() => !busy && setView({ mode: 'record', id: r.id })}
                                  aria-current={active ? 'true' : undefined}
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                                    active
                                      ? 'bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
                                      : 'text-surface-800 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-700'
                                  }`}
                                >
                                  <RecordIcon kind={r.kind} pictureUrl={r.pictureUrl} size="sm" />
                                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                                  {r.clueStatus && <ClueStatusBadge status={r.clueStatus} />}
                                  {isGM && <SharingBadge record={r} nameOf={nameOf} />}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    ))
                  )}
                </div>
              </div>

              <div className={`min-h-0 overflow-y-auto pb-4 ${showingDetail ? '' : 'hidden md:block'}`}>
                {view.mode === 'new' ? (
                  <NewRecordForm
                    channelId={channelId}
                    myUserId={myUserId}
                    onCreated={id => {
                      reload()
                      setView({ mode: 'record', id })
                    }}
                    onCancel={() => setView({ mode: 'none' })}
                  />
                ) : selected ? (
                  <RecordProfile
                    key={selected.id}
                    channelId={channelId}
                    record={selected}
                    isGM={isGM}
                    isArchived={isArchived}
                    players={players}
                    tags={tags}
                    nameOf={nameOf}
                    onChanged={reload}
                    onDeleted={() => {
                      setEditing(false)
                      setView({ mode: 'none' })
                      reload()
                    }}
                    onEditingChange={onEditingChange}
                    myUserId={myUserId}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">
                    {records.length > 0 ? 'Choose a record to open it.' : ''}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </OpenRecordContext.Provider>
  )
}

function Filters({
  filter,
  onChange,
  tags,
  hasClues,
}: {
  filter: RecordFilter
  onChange: (f: RecordFilter) => void
  tags: { id: string; name: string }[]
  hasClues: boolean
}) {
  return (
    <div className="space-y-2">
      <input
        type="search"
        className={INPUT}
        placeholder="Search the case file"
        aria-label="Search the case file"
        value={filter.search}
        onChange={e => onChange({ ...filter, search: e.target.value })}
      />
      <div className="flex gap-2">
        <select
          className={`${INPUT} min-w-0 flex-1`}
          aria-label="Show kind"
          value={filter.kind}
          onChange={e => onChange({ ...filter, kind: e.target.value as RecordFilter['kind'] })}
        >
          <option value="all">All kinds</option>
          {RECORD_KINDS.map(k => (
            <option key={k} value={k}>
              {KIND_PLURALS[k]}
            </option>
          ))}
        </select>
        {tags.length > 0 && (
          <select
            className={`${INPUT} min-w-0 flex-1`}
            aria-label="Show tag"
            value={filter.tagId ?? ''}
            onChange={e => onChange({ ...filter, tagId: e.target.value || null })}
          >
            <option value="">All tags</option>
            {tags.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {hasClues && (
        <select
          className={INPUT}
          aria-label="Show clue status"
          value={filter.status ?? 'all'}
          onChange={e => onChange({ ...filter, status: e.target.value as ClueStatus | 'all' })}
        >
          <option value="all">Any clue status</option>
          {CLUE_STATUSES.map(s => (
            <option key={s} value={s}>
              {CLUE_STATUS_LABELS[s]} clues
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function NewRecordForm({
  channelId,
  myUserId,
  onCreated,
  onCancel,
}: {
  channelId: string
  myUserId: string | undefined
  onCreated: (id: string) => void
  onCancel: () => void
}) {
  const id = useId()
  const { addToast } = useToast()
  const [kind, setKind] = useState<RecordKind>('location')
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const issue = newRecordProblem(name) ?? (myUserId ? null : 'You need to be signed in.')
    if (issue || !myUserId) {
      setProblem(issue)
      return
    }
    setSaving(true)
    try {
      const newId = await createRecord(channelId, kind, name, myUserId)
      addToast(`${name.trim()} added (GM only until you share it).`, 'success')
      onCreated(newId)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not add the record.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">New record</h3>
      <fieldset>
        <legend className={LABEL}>Kind</legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {RECORD_KINDS.map(k => (
            <label key={k} className="flex items-start gap-2 rounded-md border border-surface-200 p-2 text-sm text-surface-800 dark:border-surface-700 dark:text-surface-200">
              <input type="radio" name={`${id}-kind`} className="mt-1" checked={kind === k} onChange={() => setKind(k)} />
              <span>
                {KIND_LABELS[k]}
                <span className="block text-xs text-surface-500 dark:text-surface-400">{KIND_HINTS[k]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-name`} className={LABEL}>
          Name
        </label>
        <input
          id={`${id}-name`}
          className={`${INPUT} mt-1`}
          value={name}
          maxLength={RECORD_LIMITS.name}
          onChange={e => {
            setName(e.target.value)
            setProblem(null)
          }}
        />
      </div>
      <p className="text-xs text-surface-500 dark:text-surface-400">New records are GM only. Fill them in, then choose who can see them.</p>
      {problem && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  )
}
