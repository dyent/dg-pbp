import { useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { usePostingIdentities } from '../authorship/usePostingIdentities'
import { STATUS_LABELS, type CharacterSummary } from './characterModel'
import { BTN_SECONDARY, INPUT } from './ui'

interface PostingAsSwitcherProps {
  channelId: string
  myUserId: string | undefined
  characters: CharacterSummary[]
  disabled: boolean
  onSwitch: (characterId: string) => Promise<void>
}

/**
 * "You're posting as X": lets a player choose which of their in-play PCs their
 * posts and rolls are labelled with. Only Active characters can be chosen.
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
  const choices = mine.filter(c => c.status === 'active' && c.id !== currentCharacter?.id)

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
            You're posting as <strong>{currentCharacter.name}</strong>
            {currentCharacter.status && currentCharacter.status !== 'active' && ` (${STATUS_LABELS[currentCharacter.status]})`}.
          </>
        ) : (
          "You're posting under your own name."
        )}
      </span>
      {choices.length > 0 && !disabled && (
        <span className="flex items-center gap-2">
          <select value={choice} onChange={e => setChoice(e.target.value)} aria-label="Switch to character" className={`${INPUT} w-auto py-1`}>
            <option value="">Switch to…</option>
            {choices.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className={BTN_SECONDARY} onClick={handleSwitch} disabled={!choice || busy}>
            {busy ? 'Switching…' : 'Switch'}
          </button>
        </span>
      )}
    </div>
  )
}
