import { useState } from 'react'
import { STATUS_LABELS, TEMPORARY_STATUSES, isTemporaryStatus, type CharacterSummary, type Status } from './characterModel'
import { INPUT, LABEL } from './ui'

interface OwnStatusProps {
  character: CharacterSummary
  disabled?: boolean
  /** Saves the new status; resolves true on success. */
  onChange: (status: Status) => Promise<boolean>
}

/**
 * A player's own in-play PC: switch between Active and the Reserve statuses
 * (Backup, Temporarily unavailable, Incapacitated). Statuses only the GM sets
 * (Missing, Insane, Retired, Deceased) are shown read-only.
 */
export function OwnStatus({ character, disabled, onChange }: OwnStatusProps) {
  const [busy, setBusy] = useState(false)
  if (!character.status) return null

  if (!isTemporaryStatus(character.status)) {
    return (
      <p className="text-sm text-surface-600 dark:text-surface-400">
        Status: {STATUS_LABELS[character.status]}. Only the GM can change this status.
      </p>
    )
  }

  const handleChange = async (status: Status) => {
    setBusy(true)
    await onChange(status)
    setBusy(false)
  }

  return (
    <div className="space-y-1">
      <label className={`${LABEL} max-w-xs`}>
        Status
        <select
          value={character.status}
          disabled={disabled || busy}
          onChange={e => void handleChange(e.target.value as Status)}
          className={`${INPUT} mt-1`}
        >
          {TEMPORARY_STATUSES.map(s => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-surface-500 dark:text-surface-400">
        {character.status === 'active'
          ? 'Active: you can post as this character. Choose another status to move them to Reserve.'
          : 'Reserve: you keep this character but can’t post as them. Choose Active to bring them back (at most 3 active at once).'}
      </p>
    </div>
  )
}
