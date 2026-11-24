import { useId, useState } from 'react'
import type { PlayerOption } from '../characters/GmControls'
import { LIMITS, type Tag } from '../characters/characterModel'
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '../characters/ui'
import {
  KIND_LABELS,
  RECORD_VISIBILITY_HINTS,
  RECORD_VISIBILITY_LABELS,
  sharingProblem,
  type CampaignRecord,
  type RecordVisibility,
} from './recordModel'

export interface RecordGmActions {
  setVisibility: (visibility: RecordVisibility, playerIds: string[]) => Promise<boolean>
  setAliases: (aliases: string[]) => Promise<boolean>
  setTags: (add: string[], remove: string[], success: string) => Promise<boolean>
  createTag: (name: string) => Promise<Tag>
  remove: () => Promise<boolean>
}

interface RecordGmControlsProps {
  record: CampaignRecord
  players: PlayerOption[]
  tags: Tag[]
  /** GM-only other names. */
  aliases: string[]
  actions: RecordGmActions
}

/** GM-only settings shown above a record's profile: sharing, aliases, tags, delete. */
export function RecordGmControls({ record, players, tags, aliases, actions }: RecordGmControlsProps) {
  return (
    <div className="space-y-4 rounded-md border border-surface-200 p-3 dark:border-surface-700">
      <SharingSection key={`${record.id}-${record.visibility}-${record.sharedWith.join()}`} record={record} players={players} actions={actions} />
      <AliasSection key={`${record.id}-${aliases.join('|')}`} aliases={aliases} actions={actions} />
      <TagSection record={record} tags={tags} actions={actions} />
      <DeleteSection record={record} actions={actions} />
    </div>
  )
}

function SharingSection({ record, players, actions }: Pick<RecordGmControlsProps, 'record' | 'players' | 'actions'>) {
  const id = useId()
  const [visibility, setVisibility] = useState<RecordVisibility>(record.visibility)
  const [playerIds, setPlayerIds] = useState<string[]>(record.sharedWith)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const changed =
    visibility !== record.visibility ||
    (visibility === 'selected' && [...playerIds].sort().join() !== [...record.sharedWith].sort().join())

  const toggle = (userId: string) => {
    setProblem(null)
    setPlayerIds(ids => (ids.includes(userId) ? ids.filter(p => p !== userId) : [...ids, userId]))
  }

  const save = async () => {
    const issue = sharingProblem(visibility, playerIds)
    if (issue) {
      setProblem(issue)
      return
    }
    setBusy(true)
    await actions.setVisibility(visibility, visibility === 'selected' ? playerIds : [])
    setBusy(false)
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-surface-900 dark:text-surface-100">Who can see it</legend>
      <div className="space-y-1">
        {(Object.keys(RECORD_VISIBILITY_LABELS) as RecordVisibility[]).map(v => (
          <label key={v} className="flex items-start gap-2 text-sm text-surface-800 dark:text-surface-200">
            <input
              type="radio"
              name={`${id}-visibility`}
              className="mt-1"
              checked={visibility === v}
              onChange={() => {
                setVisibility(v)
                setProblem(null)
              }}
            />
            <span>
              {RECORD_VISIBILITY_LABELS[v]}
              <span className="block text-xs text-surface-500 dark:text-surface-400">{RECORD_VISIBILITY_HINTS[v]}</span>
            </span>
          </label>
        ))}
      </div>
      {visibility === 'selected' && (
        <div>
          <p className={LABEL}>Share with</p>
          {players.length === 0 ? (
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">No players have joined yet.</p>
          ) : (
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {players.map(p => (
                <label key={p.userId} className="flex items-center gap-2 text-sm text-surface-800 dark:text-surface-200">
                  <input type="checkbox" checked={playerIds.includes(p.userId)} onChange={() => toggle(p.userId)} />
                  {p.name}
                </label>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">Shared with the player, so all of their characters can use it.</p>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}
      {changed && (
        <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save sharing'}
        </button>
      )}
    </fieldset>
  )
}

/** Other names, comma-separated: findable in posts and taggable with `@` (GM only). */
function AliasSection({ aliases, actions }: { aliases: string[]; actions: RecordGmActions }) {
  const id = useId()
  const [text, setText] = useState(aliases.join(', '))
  const [busy, setBusy] = useState(false)
  const list = text.split(',').map(a => a.trim()).filter(Boolean)
  const problem =
    list.length > LIMITS.aliases
      ? `At most ${LIMITS.aliases} aliases.`
      : list.some(a => a.length > LIMITS.alias)
        ? `Aliases can be at most ${LIMITS.alias} characters.`
        : null
  const changed = list.join('|') !== aliases.join('|')

  const save = async () => {
    setBusy(true)
    await actions.setAliases(list)
    setBusy(false)
  }

  return (
    <div className="space-y-1">
      <label htmlFor={`${id}-aliases`} className="text-sm font-medium text-surface-900 dark:text-surface-100">
        Aliases (GM only)
      </label>
      <p className="text-xs text-surface-500 dark:text-surface-400">
        Other names, separated by commas, e.g. The Hollow, the Choir. You can tag them with @ in posts; players see only the alias.
      </p>
      <div className="flex gap-2">
        <input id={`${id}-aliases`} value={text} onChange={e => setText(e.target.value)} className={`${INPUT} min-w-0 flex-1`} />
        {changed && (
          <button type="button" className={BTN_SECONDARY} onClick={() => void save()} disabled={busy || !!problem}>
            {busy ? 'Saving…' : 'Save aliases'}
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}
    </div>
  )
}

function TagSection({ record, tags, actions }: { record: CampaignRecord; tags: Tag[]; actions: RecordGmActions }) {
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)
  const current = new Set(record.tagIds)

  const toggle = async (tagId: string) => {
    setBusy(true)
    const on = current.has(tagId)
    await actions.setTags(on ? [] : [tagId], on ? [tagId] : [], on ? 'Tag removed.' : 'Tag added.')
    setBusy(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newTag.trim()
    if (!name) return
    setBusy(true)
    try {
      const tag = tags.find(t => t.name.toLowerCase() === name.toLowerCase()) ?? (await actions.createTag(name))
      const ok = current.has(tag.id) ? true : await actions.setTags([tag.id], [], 'Tag added.')
      if (ok) setNewTag('')
    } catch {
      // createTag failures are reported by the caller's toast.
    }
    setBusy(false)
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-surface-900 dark:text-surface-100">Tags (GM only)</legend>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => (
            <button
              key={t.id}
              type="button"
              aria-pressed={current.has(t.id)}
              disabled={busy}
              onClick={() => void toggle(t.id)}
              className={`rounded-full border px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                current.has(t.id)
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-surface-300 text-surface-700 hover:bg-surface-100 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-700'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-surface-500 dark:text-surface-400">No tags yet. Tags help you sort records, e.g. Hollow Creek, Suspect.</p>
      )}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input value={newTag} onChange={e => setNewTag(e.target.value)} maxLength={LIMITS.tag} placeholder="New tag" aria-label="New tag" className={`${INPUT} min-w-0 flex-1`} />
        <button type="submit" className={BTN_SECONDARY} disabled={busy || !newTag.trim()}>
          Add tag
        </button>
      </form>
    </fieldset>
  )
}

function DeleteSection({ record, actions }: { record: CampaignRecord; actions: RecordGmActions }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!confirming) {
    return (
      <button type="button" className={BTN_DANGER} onClick={() => setConfirming(true)}>
        Delete {KIND_LABELS[record.kind].toLowerCase()}
      </button>
    )
  }
  return (
    <div role="alert" className="space-y-2 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
      <p>
        Delete <strong>{record.name}</strong> with all its fields and history? Players lose it from their Case files. This can’t be undone.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={BTN_DANGER}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const ok = await actions.remove()
            setBusy(false)
            if (!ok) setConfirming(false)
          }}
        >
          {busy ? 'Deleting…' : 'Delete for good'}
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )
}
