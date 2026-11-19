import { useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { usePostingIdentities } from '../authorship/usePostingIdentities'
import { isTemporaryStatus, type CharacterSummary } from './characterModel'
import { BTN_SECONDARY, INPUT } from './ui'

interface PostingAsSwitcherProps {
  channelId: string
  myUserId: string | undefined
  characters: CharacterSummary[]
  disabled: boolean
  /** Makes one of the player's Reserve PCs their active character. */
  onSwitch: (characterId: string) => Promise<void>
}

/**
 * "You're posting as X": a player posts as their one active PC (or under their
 * own name when none is active) and can make a Reserve PC active instead.
 * Reserve PCs with a status only the GM sets (e.g. Missing) aren't offered.
 */
export function PostingAsSwitcher({ channelId, myUserId, characters, disabled, onSwitch }: PostingAsSwitcherProps) {
  const { identities } = usePostingIdentities(channelId)
  const { addToast } = useToast()
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)

  const mine = characters.filter(c => c.isMine && c.kind === 'pc' && c.inPlay)
  if (!myUserId || mine.length === 0) return null

  const current = identities.find(i => i.userId === myUserId && i.endedAt === null)
  const currentCharacter = current ? mine.find(c => c.id === current.characterId) : undefined
  const choices = mine.filter(c => c.status !== 'active' && isTemporaryStatus(c.status))

  const handleSwitch = async () => {
    if (!choice) return
    setBusy(true)
    try {
      await onSwitch(choice)
      addToast(`You're now posting as ${mine.find(c => c.id === choice)?.name ?? 'that character'}.`, 'success')
      setChoice('')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not switch character.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-primary-50 px-3 py-2 text-sm dark:bg-primary-900/20" data-testid="posting-as">
      <span className="text-surface-800 dark:text-surface-200">
        {currentCharacter ? (
          <>
            You're posting as <strong>{currentCharacter.name}</strong>.
          </>
        ) : (
          "You're posting under your own name: none of your characters is active."
        )}
      </span>
      {choices.length > 0 && !disabled && (
        <span className="flex items-center gap-2">
          <select value={choice} onChange={e => setChoice(e.target.value)} aria-label="Make a character active" className={`${INPUT} w-auto py-1`}>
            <option value="">Make active…</option>
            {choices.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className={BTN_SECONDARY} onClick={handleSwitch} disabled={!choice || busy}>
            {busy ? 'Switching…' : 'Make active'}
          </button>
        </span>
      )}
    </div>
  )
}
