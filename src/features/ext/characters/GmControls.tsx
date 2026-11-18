import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import {
  LIMITS,
  ROLE_OPTION_LABELS,
  STATUSES,
  STATUS_LABELS,
  describeRoleChange,
  isTemporaryStatus,
  roleOf,
  roleToArgs,
  type CharacterSummary,
  type Role,
  type Status,
  type Tag,
} from './characterModel'
import type { CharacterActions } from './useCharacterActions'
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, SECTION_TITLE } from './ui'

export interface PlayerOption {
  userId: string
  name: string
}

interface GmControlsProps {
  character: CharacterSummary
  players: PlayerOption[]
  tags: Tag[]
  nameOf: (userId: string) => string
  actions: CharacterActions
  /** Runs an action, reports errors, and reloads on success. Resolves true on success. */
  run: (action: () => Promise<unknown>, success: string) => Promise<boolean>
  onDeleted: () => void
}

export function GmControls({ character, players, tags, nameOf, actions, run, onDeleted }: GmControlsProps) {
  return (
    <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-900/10" data-testid="gm-controls">
      <p className={SECTION_TITLE}>GM controls</p>
      <RoleSection key={`role-${character.id}-${character.kind}-${character.inPlay}-${character.ownerId}-${character.status}`} character={character} players={players} nameOf={nameOf} actions={actions} run={run} />
      <StatusSection character={character} actions={actions} run={run} />
      {character.kind === 'npc' && <TagSection character={character} tags={tags} actions={actions} run={run} />}
      <AliasSection key={`aliases-${character.id}`} character={character} actions={actions} run={run} />
      <DeleteSection character={character} actions={actions} run={run} onDeleted={onDeleted} />
    </div>
  )
}

type SectionProps = Pick<GmControlsProps, 'character' | 'actions' | 'run'>

function RoleSection({ character, players, nameOf, actions, run }: SectionProps & Pick<GmControlsProps, 'players' | 'nameOf'>) {
  const [role, setRole] = useState<Role>(roleOf(character))
  const [ownerId, setOwnerId] = useState<string>(character.ownerId ?? '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const { kind, inPlay, status } = roleToArgs(role, character)
  const nextOwner = kind === 'npc' ? null : ownerId || null
  const consequences = describeRoleChange(
    character.name,
    { kind: character.kind, inPlay: character.inPlay, ownerId: character.ownerId, status: character.status },
    { kind, inPlay, ownerId: nextOwner, status: status ?? character.status },
    nameOf,
  )
  // Former owners stay selectable even if they have left, so the dropdown
  // can show the current value.
  const options = character.ownerId && !players.some(p => p.userId === character.ownerId)
    ? [...players, { userId: character.ownerId, name: nameOf(character.ownerId) }]
    : players

  const handleSave = async () => {
    setSaving(true)
    const ok = await run(() => actions.setRole(character.id, kind, inPlay, nextOwner, note, status), 'Role updated.')
    setSaving(false)
    if (ok) setNote('')
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-surface-900 dark:text-surface-100">Role</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={LABEL}>
          Role
          <select value={role} onChange={e => setRole(e.target.value as Role)} className={`${INPUT} mt-1`}>
            {(Object.keys(ROLE_OPTION_LABELS) as Role[]).map(r => (
              <option key={r} value={r}>
                {ROLE_OPTION_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {kind === 'pc' && (
          <label className={LABEL}>
            Player
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className={`${INPUT} mt-1`}>
              <option value="">No player</option>
              {options.map(p => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {consequences.length > 0 && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
          <p className="font-medium">When you save:</p>
          <ul className="ml-4 list-disc">
            {consequences.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <label className={`${LABEL} mt-2`}>
            Note for the history (optional)
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={LIMITS.roleNote} className={`${INPUT} mt-1`} />
          </label>
          <div className="mt-2 flex gap-2">
            <button type="button" className={BTN_PRIMARY} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save role'}
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => {
                setRole(roleOf(character))
                setOwnerId(character.ownerId ?? '')
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </fieldset>
  )
}

function StatusSection({ character, actions, run }: SectionProps) {
  const [busy, setBusy] = useState(false)
  const update = async (patch: Parameters<CharacterActions['updateCharacter']>[1], success: string) => {
    setBusy(true)
    await run(() => actions.updateCharacter(character.id, patch), success)
    setBusy(false)
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-surface-900 dark:text-surface-100">Status and visibility</legend>
      <label className={LABEL}>
        Status
        <select
          value={character.status ?? 'active'}
          disabled={busy}
          onChange={e => void update({ status: e.target.value as Status }, 'Status updated.')}
          className={`${INPUT} mt-1`}
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {character.kind === 'pc' && character.inPlay && character.status !== 'active' && (
        <p className="text-xs text-surface-600 dark:text-surface-400">
          Any status other than Active puts this PC in Reserve: the player keeps control but can't post as them, and they don't count toward the limit of 3 active characters.
          {character.status && !isTemporaryStatus(character.status) && ' The player can’t change this status; for a PC who has left the story, set the role to Retired.'}
        </p>
      )}
      {character.kind === 'pc' && character.inPlay && (
        <p className="text-xs text-surface-500 dark:text-surface-400">Players can set Active, Backup, Temporarily unavailable and Incapacitated on their own PCs.</p>
      )}
      <label className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
        <input
          type="checkbox"
          checked={!!character.revealed}
          disabled={busy}
          onChange={e => void update({ revealed: e.target.checked }, e.target.checked ? 'Revealed to players.' : 'Hidden from players.')}
        />
        Revealed to players
      </label>
      <label className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
        <input
          type="checkbox"
          checked={character.statusVisible !== false}
          disabled={busy}
          onChange={e => void update({ status_visible: e.target.checked }, 'Status visibility updated.')}
        />
        Players can see the status
      </label>
    </fieldset>
  )
}

function TagSection({ character, tags, actions, run }: SectionProps & { tags: Tag[] }) {
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)
  const current = new Set(character.tagIds ?? [])

  const toggle = async (tagId: string) => {
    setBusy(true)
    const on = current.has(tagId)
    await run(() => actions.setCharacterTags(character.id, on ? [] : [tagId], on ? [tagId] : []), on ? 'Tag removed.' : 'Tag added.')
    setBusy(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newTag.trim()
    if (!name) return
    setBusy(true)
    const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase())
    const ok = await run(async () => {
      const tag = existing ?? (await actions.createTag(name))
      if (!current.has(tag.id)) await actions.setCharacterTags(character.id, [tag.id], [])
    }, 'Tag added.')
    setBusy(false)
    if (ok) setNewTag('')
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-surface-900 dark:text-surface-100">Tags</legend>
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
        <p className="text-xs text-surface-500 dark:text-surface-400">No tags yet. Tags help you sort NPCs, e.g. Witness, Federal, Suspect.</p>
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

function AliasSection({ character, actions, run }: SectionProps) {
  const [text, setText] = useState((character.aliases ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const aliases = text.split(',').map(a => a.trim()).filter(Boolean)
  const unchanged = aliases.join('\u0000') === (character.aliases ?? []).join('\u0000')
  const problem =
    aliases.length > LIMITS.aliases
      ? `At most ${LIMITS.aliases} aliases.`
      : aliases.some(a => a.length > LIMITS.alias)
        ? `Each alias can be at most ${LIMITS.alias} characters.`
        : null

  const handleSave = async () => {
    setBusy(true)
    await run(() => actions.updateCharacter(character.id, { aliases }), 'Aliases saved.')
    setBusy(false)
  }

  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium text-surface-900 dark:text-surface-100">Aliases</legend>
      <p className="text-xs text-surface-500 dark:text-surface-400">Other names this character goes by, separated by commas. GM only.</p>
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} aria-label="Aliases" className={`${INPUT} min-w-0 flex-1`} />
        <button type="button" className={BTN_SECONDARY} onClick={handleSave} disabled={busy || unchanged || !!problem}>
          Save
        </button>
      </div>
      {problem && <p className="text-xs text-red-600 dark:text-red-400">{problem}</p>}
    </fieldset>
  )
}

function DeleteSection({ character, actions, run, onDeleted }: SectionProps & { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="border-t border-amber-200 pt-3 dark:border-amber-800">
      <button type="button" className={BTN_DANGER} onClick={() => setConfirming(true)}>
        Delete character
      </button>
      {confirming && (
        <ConfirmDialog
          title={`Delete ${character.name}?`}
          description="This removes the character, its profile and its history for good. Characters that have posted in the campaign can't be deleted: change their status or role instead."
          onConfirm={async () => {
            setConfirming(false)
            const ok = await run(() => actions.deleteCharacter(character.id), `${character.name} deleted.`)
            if (ok) onDeleted()
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
