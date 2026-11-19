import { useCallback, useMemo, useRef, useState } from 'react'
import { useEscapeToClose } from '../../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { useToast } from '../../../contexts/ToastContext'
import { CharacterList } from './CharacterList'
import { CharacterProfile } from './CharacterProfile'
import type { PlayerOption } from './GmControls'
import { PostingAsSwitcher } from './PostingAsSwitcher'
import type { CharacterKind } from './characterModel'
import { useCharacterActions } from './useCharacterActions'
import { useCharacterList } from './useCharacterList'
import { BTN_SECONDARY } from './ui'

export interface CharactersPanelProps {
  channelId: string
  isGM: boolean
  isArchived: boolean
  myUserId: string | undefined
  /** Campaign players (not the GM), for the role dropdown and owner names. */
  players: PlayerOption[]
  /** Display name for any user id (players, the GM, people who have left). */
  nameOf: (userId: string) => string
  onClose: () => void
  /** Which list to start on (PCs unless opened from GM Tools → NPCs). */
  initialKind?: CharacterKind
}

export function CharactersPanel({ channelId, isGM, isArchived, myUserId, players, nameOf, onClose, initialKind = 'pc' }: CharactersPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()
  const { characters, tags, loading, error, reload } = useCharacterList(channelId, isGM, myUserId)
  const actions = useCharacterActions(channelId, myUserId)
  const [kind, setKind] = useState<CharacterKind>(initialKind)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  // Escape closes the panel, except while editing (it would lose the edits).
  useEscapeToClose(() => {
    if (!editing) onClose()
  })
  useFocusTrap(dialogRef)

  const selected = useMemo(() => characters.find(c => c.id === selectedId) ?? null, [characters, selectedId])
  const handleEditingChange = useCallback((value: boolean) => setEditing(value), [])

  const handleCreate = async (newKind: CharacterKind, name: string) => {
    try {
      const id = await actions.create(newKind, name)
      addToast(`${name} added.`, 'success')
      reload()
      setSelectedId(id)
      return true
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not add the character.', 'error')
      return false
    }
  }

  const handleSwitch = async (characterId: string) => {
    await actions.setMyStatus(characterId, 'active')
    reload()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-surface-600 bg-opacity-75 sm:items-center dark:bg-surface-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={() => !editing && onClose()} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ext-characters-title"
        className="relative flex h-full w-full flex-col bg-white shadow-xl sm:h-[90vh] sm:max-w-6xl sm:rounded-lg dark:bg-surface-800"
      >
        <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3 dark:border-surface-700">
          <div className="flex items-center gap-2">
            {selected && (
              <button type="button" className={`${BTN_SECONDARY} md:hidden`} onClick={() => setSelectedId(null)} disabled={editing}>
                ← List
              </button>
            )}
            <h2 id="ext-characters-title" className="text-lg font-bold text-surface-900 dark:text-surface-100">
              Characters
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={editing}
            className="p-1 text-surface-400 hover:text-surface-600 disabled:opacity-30 dark:hover:text-surface-200"
            aria-label="Close characters"
            title={editing ? 'Save or cancel your edits first' : undefined}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-3">
          <PostingAsSwitcher channelId={channelId} myUserId={myUserId} characters={characters} disabled={isArchived} onSwitch={handleSwitch} />

          {error ? (
            <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <span>Couldn't load the characters.</span>
              <button type="button" onClick={reload} className={BTN_SECONDARY}>
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="animate-pulse space-y-3 py-2" aria-label="Loading characters">
              <div className="h-10 rounded bg-surface-200 dark:bg-surface-700" />
              <div className="h-10 rounded bg-surface-200 dark:bg-surface-700" />
            </div>
          ) : (
            // flex-1 (not h-full): the "Posting as" bar above takes space too, and h-full
            // pushed the bottom of the profile (and its Save/Cancel bar) out of view.
            <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[18rem_1fr]">
              <div className={`min-h-0 pb-4 ${selected ? 'hidden md:block' : ''}`}>
                <CharacterList
                  characters={characters}
                  tags={tags}
                  isGM={isGM}
                  canCreate={isGM && !isArchived}
                  kind={kind}
                  onKindChange={setKind}
                  selectedId={selectedId}
                  onSelect={id => !editing && setSelectedId(id)}
                  ownerName={nameOf}
                  onCreate={handleCreate}
                />
              </div>
              <div className={`min-h-0 overflow-y-auto pb-4 ${selected ? '' : 'hidden md:block'}`}>
                {selected ? (
                  <CharacterProfile
                    key={selected.id}
                    channelId={channelId}
                    character={selected}
                    isGM={isGM}
                    isArchived={isArchived}
                    players={players}
                    tags={tags}
                    nameOf={nameOf}
                    actions={actions}
                    onChanged={reload}
                    onDeleted={() => setSelectedId(null)}
                    onEditingChange={handleEditingChange}
                    myUserId={myUserId}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">Choose a character to see their profile.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
