import { isMeaningfulChange, pathLabel } from '../../dg/sheet/sheetModel'
import { describeEvent, editDetails, sheetChanges, type CharacterEvent } from './characterModel'
import { BADGE } from './ui'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

interface HistoryEntryProps {
  event: CharacterEvent
  isGM: boolean
  nameOf: (userId: string) => string
  /** Extra line under the date, e.g. the in-game date (Activity tab). */
  extra?: React.ReactNode
}

/**
 * One history entry (status, role, profile and sheet changes, old GM notes),
 * shown in the character's Activity tab. The GM can open the details of field
 * and sheet edits.
 */
export function HistoryEntry({ event, isGM, nameOf, extra }: HistoryEntryProps) {
  const edit = isGM ? editDetails(event) : null
  const logged = isGM ? sheetChanges(event) : []
  const sheet = logged.filter(isMeaningfulChange)
  const hidden = typeof event.details.total === 'number' ? Math.max(event.details.total - logged.length, 0) : 0
  return (
    <>
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
        {extra}
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
    </>
  )
}
