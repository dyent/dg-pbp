import { useMemo } from 'react'
import { dividersBetween } from './calendarModel'
import { useCalendar } from './calendarContext'

interface InGameDateDividerProps {
  /** Room of the chat (null = Main). */
  subChannelId: string | null | undefined
  /** Created time of the post above; null at the start of the loaded history. */
  from: string | null | undefined
  /** Created time of the post below; null after the last post. */
  to: string | null | undefined
}

/**
 * "— 3 days later: Fri 17 Oct 1997 —" lines between posts, one per in-game date
 * change made between them. Fork hook point in upstream's MessageList (FORK-EXT).
 */
export function InGameDateDivider({ subChannelId, from, to }: InGameDateDividerProps) {
  const { changes } = useCalendar()
  const dividers = useMemo(
    () => (changes.length ? dividersBetween(changes, subChannelId ?? null, from ?? null, to ?? null) : []),
    [changes, subChannelId, from, to],
  )
  return (
    <>
      {dividers.map(d => (
        <div key={d.id} data-testid="in-game-date-divider" role="separator" aria-label={`In-game date: ${d.label}`} className="my-3 flex items-center">
          <div className="flex-grow border-t border-dashed border-primary-300 dark:border-primary-700" />
          <span className="mx-4 flex-shrink-0 text-xs font-semibold text-primary-700 dark:text-primary-300">{d.label}</span>
          <div className="flex-grow border-t border-dashed border-primary-300 dark:border-primary-700" />
        </div>
      ))}
    </>
  )
}
