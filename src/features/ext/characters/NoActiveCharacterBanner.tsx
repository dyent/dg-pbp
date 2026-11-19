import { useState, type ReactNode } from 'react'
import { useAuthorLookup } from '../authorship/authorshipContext'

const FROM_NOW_ON = '9999-12-31T00:00:00Z'

interface NoActiveCharacterBannerProps {
  myUserId: string | undefined
  /** The button that opens the Characters panel (rendered by ChannelView). */
  children?: ReactNode
}

/**
 * Reminder for a player whose active character went into Reserve (wounded, on
 * holiday…): they now post under their own name until they make a character
 * active. Shown only after they have posted as a character at least once, so
 * new players and GMs never see it. Fork hook point in ChannelView (FORK-EXT).
 */
export function NoActiveCharacterBanner({ myUserId, children }: NoActiveCharacterBannerProps) {
  const authorAt = useAuthorLookup()
  const [dismissed, setDismissed] = useState(false)
  // "From now on": an open period covers any later time, so a far-future
  // lookup gives the current state. characterId '' = posting under their own
  // name after a character period.
  const postingAsPlayer = !!myUserId && authorAt(myUserId, FROM_NOW_ON)?.characterId === ''

  if (!postingAsPlayer || dismissed) return null
  return (
    <div
      role="status"
      data-testid="no-active-character"
      className="flex flex-wrap items-center gap-2 border-b border-primary-200 bg-primary-50 px-4 py-2 text-sm text-surface-800 dark:border-primary-800 dark:bg-primary-900/30 dark:text-surface-100"
    >
      <span className="flex-1">
        None of your characters is active, so you’re posting under your own name. Make a character active to post as them.
      </span>
      {children}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-xs text-surface-500 underline hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
      >
        Not now
      </button>
    </div>
  )
}
