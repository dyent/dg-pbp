import { useState } from 'react'
import { isMeaningfulChange, pathLabel } from '../../dg/sheet/sheetModel'
import { LIMITS, describeEvent, editDetails, sheetChanges, type CharacterEvent } from './characterModel'
import { BADGE, BTN_PRIMARY, INPUT } from './ui'

interface CharacterHistoryProps {
  events: CharacterEvent[]
  isGM: boolean
  canAddNote: boolean
  nameOf: (userId: string) => string
  onAddNote: (note: string) => Promise<boolean>
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function CharacterHistory({ events, isGM, canAddNote, nameOf, onAddNote }: CharacterHistoryProps) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    const ok = await onAddNote(note)
    setSaving(false)
    if (ok) setNote('')
  }

  return (
    <div className="space-y-3">
      {isGM && canAddNote && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={LIMITS.note}
            rows={2}
            placeholder="Add a GM note to this character's history"
            aria-label="New history note"
            className={INPUT}
          />
          <button type="submit" className={BTN_PRIMARY} disabled={saving || !note.trim()}>
            {saving ? 'Adding…' : 'Add note'}
          </button>
        </form>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-surface-500 dark:text-surface-400">No history yet.</p>
      ) : (
        <ol className="space-y-2">
          {events.map(event => {
            const edit = isGM ? editDetails(event) : null
            const logged = isGM ? sheetChanges(event) : []
            const sheet = logged.filter(isMeaningfulChange)
            const hidden = typeof event.details.total === 'number' ? Math.max(event.details.total - logged.length, 0) : 0
            return (
              <li key={event.id} className="border-l-2 border-surface-200 pl-3 dark:border-surface-700">
                <p className="text-sm text-surface-900 dark:text-surface-100">
                  {event.eventType === 'note' && <span className="font-medium">Note: </span>}
                  <span className="whitespace-pre-wrap">{describeEvent(event, nameOf)}</span>
                </p>
                {event.note && event.eventType !== 'note' && (
                  <p className="text-sm italic text-surface-700 dark:text-surface-300">"{event.note}"</p>
                )}
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
                  <time dateTime={event.createdAt}>{dateFormat.format(new Date(event.createdAt))}</time>
                  {event.actorId && <span>by {nameOf(event.actorId)}</span>}
                  {isGM && event.visibility === 'gm' && <span className={`${BADGE} bg-surface-100 dark:bg-surface-700`}>GM only</span>}
                </p>
                {sheet.length > 0 && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-primary-600 dark:text-primary-400">Show the changes</summary>
                    <ul className="mt-1 space-y-0.5 text-surface-800 dark:text-surface-200">
                      {sheet.map(change => (
                        <li key={change.path}>
                          <span className="font-medium">{pathLabel(change.path)}:</span>{' '}
                          <span className="whitespace-pre-wrap">{change.from || '(empty)'}</span> → <span className="whitespace-pre-wrap">{change.to || '(empty)'}</span>
                        </li>
                      ))}
                      {hidden > 0 && <li className="italic">…and {hidden} more.</li>}
                    </ul>
                  </details>
                )}
                {edit && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-primary-600 dark:text-primary-400">Show the change</summary>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="font-medium text-surface-600 dark:text-surface-400">Before</p>
                        <p className="whitespace-pre-wrap rounded bg-red-50 p-1.5 text-surface-800 dark:bg-red-900/20 dark:text-surface-200">{edit.before || '(empty)'}</p>
                      </div>
                      <div>
                        <p className="font-medium text-surface-600 dark:text-surface-400">After</p>
                        <p className="whitespace-pre-wrap rounded bg-emerald-50 p-1.5 text-surface-800 dark:bg-emerald-900/20 dark:text-surface-200">{edit.after || '(empty)'}</p>
                      </div>
                    </div>
                  </details>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
