import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeToClose } from '../../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { useAuthorLookup } from '../../ext/authorship/authorshipContext'
import { useCharacterList } from '../../ext/characters/useCharacterList'
import { BTN_SECONDARY } from '../../ext/characters/ui'
import { CharacterSheet } from './CharacterSheet'

interface MySheetButtonProps {
  channelId: string
  myUserId: string | undefined
  isGM: boolean
  isArchived: boolean
}

/**
 * Fork hook point (FORK-EXT in ChannelView's header): "My sheet" opens the
 * player's own character sheets from anywhere in the campaign. The GM uses the
 * Characters panel instead.
 */
export function MySheetButton({ channelId, myUserId, isGM, isArchived }: MySheetButtonProps) {
  const [open, setOpen] = useState(false)
  if (isGM || !myUserId) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="My sheet"
        aria-label="My sheet"
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-surface-500 transition-colors hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="hidden sm:inline">My sheet</span>
      </button>
      {open &&
        createPortal(
          <MySheetDialog channelId={channelId} myUserId={myUserId} isArchived={isArchived} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </>
  )
}

function MySheetDialog({ channelId, myUserId, isArchived, onClose }: { channelId: string; myUserId: string; isArchived: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const { characters, loading, error, reload } = useCharacterList(channelId, false, myUserId)
  const authorAt = useAuthorLookup()
  const mine = characters.filter(c => c.isMine && c.kind === 'pc')
  // Start on the character the player is posting as right now, else the first in play.
  const [openedAt] = useState(() => new Date().toISOString())
  const postingAs = authorAt(myUserId, openedAt)?.characterId
  const [chosenId, setChosenId] = useState<string | null>(null)
  const selected =
    mine.find(c => c.id === chosenId) ?? mine.find(c => c.id === postingAs) ?? mine.find(c => c.inPlay) ?? mine[0] ?? null

  useEscapeToClose(() => {
    if (!editing) onClose()
  })
  useFocusTrap(dialogRef)
  const handleEditingChange = useCallback((value: boolean) => setEditing(value), [])

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-surface-600 bg-opacity-75 sm:items-center dark:bg-surface-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={() => !editing && onClose()} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dg-my-sheet-title"
        className="relative flex h-full w-full flex-col bg-white shadow-xl sm:h-[90vh] sm:max-w-5xl sm:rounded-lg dark:bg-surface-800"
      >
        <div className="flex items-center justify-between gap-2 border-b border-surface-100 px-4 py-3 dark:border-surface-700">
          <h2 id="dg-my-sheet-title" className="truncate text-lg font-bold text-surface-900 dark:text-surface-100">
            {selected ? selected.name : 'My sheet'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={editing}
            className="p-1 text-surface-400 hover:text-surface-600 disabled:opacity-30 dark:hover:text-surface-200"
            aria-label="Close my sheet"
            title={editing ? 'Save or cancel your edits first' : undefined}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <span>Couldn't load your characters.</span>
              <button type="button" onClick={reload} className={BTN_SECONDARY}>
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="animate-pulse space-y-3" aria-label="Loading your characters">
              <div className="h-10 rounded bg-surface-200 dark:bg-surface-700" />
            </div>
          ) : !selected ? (
            <p className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">
              You don't have a character in this campaign yet. Your GM sets that up in the Characters panel.
            </p>
          ) : (
            <>
              {mine.length > 1 && (
                <div role="tablist" aria-label="Your characters" className="mb-3 flex flex-wrap gap-2">
                  {mine.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={c.id === selected.id}
                      disabled={editing && c.id !== selected.id}
                      onClick={() => setChosenId(c.id)}
                      className={`rounded-full border px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 ${
                        c.id === selected.id
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-surface-300 text-surface-700 hover:bg-surface-100 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-700'
                      }`}
                    >
                      {c.name}
                      {!c.inPlay && ' (retired)'}
                    </button>
                  ))}
                </div>
              )}
              <CharacterSheet
                key={selected.id}
                channelId={channelId}
                characterId={selected.id}
                kind="pc"
                canEdit={selected.inPlay && !isArchived}
                isGM={false}
                onEditingChange={handleEditingChange}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
