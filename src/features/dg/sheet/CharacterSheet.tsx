import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useToast } from '../../../contexts/ToastContext'
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY } from '../../ext/characters/ui'
import { NpcBlockEditor, SheetEditor } from './SheetEditor'
import { NpcBlockView, SheetView, type PoolChange } from './SheetView'
import { newAgentSheet, newNpcBlock, parseSheet, type SheetData } from './sheetModel'
import { useSheet } from './useSheet'

interface CharacterSheetProps {
  channelId: string
  characterId: string
  kind: 'pc' | 'npc'
  /** May this viewer edit (GM, or the owner of an in-play PC; never archived)? */
  canEdit: boolean
  isGM: boolean
  onEditingChange?: (editing: boolean) => void
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/**
 * A character's Delta Green sheet (PC) or stat block (NPC): view, create, edit,
 * remove. PCs that became NPCs keep their full sheet.
 */
export function CharacterSheet({ channelId, characterId, kind, canEdit, isGM, onEditingChange }: CharacterSheetProps) {
  const { row, loading, error, reload, create, save, remove, setPool } = useSheet(characterId, channelId)
  const { addToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const noun = kind === 'pc' ? 'sheet' : 'stat block'

  useEffect(() => {
    onEditingChange?.(editing)
  }, [editing, onEditingChange])

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true)
    try {
      await action()
      addToast(success, 'success')
      reload()
      return true
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Something went wrong.', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3" aria-label="Loading sheet">
        <div className="h-4 w-3/4 rounded bg-surface-200 dark:bg-surface-700" />
        <div className="h-4 w-1/2 rounded bg-surface-200 dark:bg-surface-700" />
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
        <span>Couldn't load the {noun}.</span>
        <button type="button" onClick={reload} className={BTN_SECONDARY}>
          Retry
        </button>
      </div>
    )
  }

  if (!row) {
    if (!canEdit) return <p className="text-sm text-surface-500 dark:text-surface-400">No {noun} yet.</p>
    return (
      <div className="space-y-2">
        <p className="text-sm text-surface-600 dark:text-surface-400">
          {kind === 'pc'
            ? 'No Delta Green sheet yet. It starts with every skill at its base value.'
            : 'No stats yet. Not every NPC needs them; add a short stat block when one does.'}
        </p>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy}
          onClick={() => void run(() => create(kind === 'pc' ? newAgentSheet() : newNpcBlock()), kind === 'pc' ? 'Sheet created.' : 'Stat block added.')}
        >
          {kind === 'pc' ? 'Create Delta Green sheet' : 'Add stats'}
        </button>
      </div>
    )
  }

  const sheet = parseSheet(row.data, kind === 'pc' ? 'agent' : 'npc')

  // Quick HP/WP/SAN changes: no success message (they'd pile up); on failure
  // say why and reload the saved values.
  const poolChange: PoolChange | undefined = canEdit
    ? (pool, value) => {
        setPool(pool, value).catch((err: unknown) => {
          addToast(err instanceof Error ? err.message : 'Could not save the change.', 'error')
          reload()
        })
      }
    : undefined

  const handleSave = async (next: SheetData) => {
    const ok = await run(() => save(next), 'Sheet saved.')
    if (ok) setEditing(false)
  }

  if (editing) {
    return sheet.format === 'agent' ? (
      <SheetEditor sheet={sheet} saving={busy} onCancel={() => setEditing(false)} onSave={s => void handleSave(s)} />
    ) : (
      <NpcBlockEditor sheet={sheet} saving={busy} onCancel={() => setEditing(false)} onSave={s => void handleSave(s)} />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-surface-500 dark:text-surface-400">
          {kind === 'npc' && isGM && 'GM only. '}
          {row.updatedAt && <>Last saved {dateFormat.format(new Date(row.updatedAt))}.</>}
        </p>
        <div className="flex gap-2">
          {canEdit && (
            <button type="button" className={BTN_PRIMARY} onClick={() => setEditing(true)}>
              Edit {noun}
            </button>
          )}
          {canEdit && isGM && (
            <button type="button" className={BTN_DANGER} onClick={() => setConfirmRemove(true)}>
              Remove
            </button>
          )}
        </div>
      </div>
      {canEdit && (
        <p className="text-xs text-surface-500 dark:text-surface-400">
          Use − / + (or click a number) to change current HP, WP or SAN without opening the editor. Changes save by themselves.
        </p>
      )}
      {sheet.format === 'agent' ? (
        <SheetView sheet={sheet} calc={row.calc} onPoolChange={poolChange} />
      ) : (
        <NpcBlockView block={sheet} calc={row.calc} onPoolChange={poolChange} />
      )}
      {confirmRemove && (
        <ConfirmDialog
          title={`Remove this ${noun}?`}
          description="Everything on it is deleted. The history keeps a note that it was removed."
          confirmLabel="Remove"
          onConfirm={async () => {
            setConfirmRemove(false)
            await run(remove, `The ${noun} was removed.`)
          }}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </div>
  )
}
