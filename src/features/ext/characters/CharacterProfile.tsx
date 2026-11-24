import { useEffect, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { CharacterSheet } from '../../dg/sheet/CharacterSheet'
import { HiddenBadge, Portrait, RoleBadge, StatusBadge } from './CharacterBadges'
import { CharacterActivity } from '../activity/CharacterActivity'
import { GmControls, type PlayerOption } from './GmControls'
import { LinksSection } from '../links/LinksSection'
import { OwnStatus } from './OwnStatus'
import { ProfileEditor, type ProfileSave } from './ProfileEditor'
import {
  STATUS_LABELS,
  VISIBILITY_LABELS,
  columnsFor,
  hasChanges,
  type CharacterField,
  type CharacterSummary,
  type Tag,
  type Visibility,
} from './characterModel'
import type { CharacterActions } from './useCharacterActions'
import { useCharacterProfile } from './useCharacterProfile'
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, SECTION_TITLE } from './ui'

interface CharacterProfileProps {
  channelId: string
  character: CharacterSummary
  isGM: boolean
  isArchived: boolean
  players: PlayerOption[]
  tags: Tag[]
  nameOf: (userId: string) => string
  actions: CharacterActions
  onChanged: () => void
  onDeleted: () => void
  onEditingChange: (editing: boolean) => void
  /** The viewer, to offer Edit on their own notes. */
  myUserId?: string
}

type ProfileTab = 'profile' | 'sheet' | 'activity'

const TAB_LABELS: Record<ProfileTab, (c: CharacterSummary) => string> = {
  profile: () => 'Profile',
  sheet: c => (c.kind === 'npc' ? 'Stats' : 'Sheet'),
  activity: () => 'Activity',
}

/**
 * Tabs this viewer gets. The sheet (Delta Green, step 4c) is Owner-level for
 * PCs and GM-only for NPCs, so others only get the tab once a PC is out of play.
 */
export function profileTabs(character: CharacterSummary, isGM: boolean): ProfileTab[] {
  const sheetVisible = isGM || (character.kind === 'pc' && (character.isMine || !character.inPlay))
  return sheetVisible ? ['profile', 'sheet', 'activity'] : ['profile', 'activity']
}

/** Columns shown to this viewer when reading the profile. */
export function viewColumns(character: CharacterSummary, fields: CharacterField[], isGM: boolean): Visibility[] {
  if (isGM) return columnsFor(character.kind)
  const columns: Visibility[] = ['players']
  if (character.kind === 'pc' && (character.isMine || fields.some(f => f.visibility === 'owner'))) {
    columns.push('owner')
  }
  return columns
}

function columnHint(column: Visibility, character: CharacterSummary, isGM: boolean): string {
  if (column === 'players') return 'All players can read these.'
  if (column === 'gm') return 'Only you can see these.'
  if (isGM) return character.inPlay ? "This character's player and you." : 'Retired: all players can read these, except Private ones.'
  if (character.isMine) return character.inPlay ? 'Only you and the GM.' : 'Retired: other players can read these, except Private ones.'
  return 'Shared now this character is retired.'
}

export function CharacterProfile({
  channelId,
  character,
  isGM,
  isArchived,
  players,
  tags,
  nameOf,
  actions,
  onChanged,
  onDeleted,
  onEditingChange,
  myUserId,
}: CharacterProfileProps) {
  const { fields, events, loading, error, reload } = useCharacterProfile(character.id)
  const { addToast } = useToast()
  const [tab, setTab] = useState<ProfileTab>('profile')
  const [editing, setEditing] = useState(false)
  const [sheetEditing, setSheetEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const canEdit = !isArchived && (isGM || (character.isMine && character.kind === 'pc' && character.inPlay))
  const tabs = profileTabs(character, isGM)

  useEffect(() => {
    onEditingChange(editing || sheetEditing)
  }, [editing, sheetEditing, onEditingChange])

  const run = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    try {
      await action()
      addToast(success, 'success')
      reload()
      onChanged()
      return true
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Something went wrong.', 'error')
      return false
    }
  }

  const handleSave = async ({ name, portraitUrl, changes }: ProfileSave) => {
    setSaving(true)
    const ok = await run(async () => {
      if (name !== character.name || portraitUrl !== character.portraitUrl) {
        await actions.updateMyCharacter(character.id, name, portraitUrl)
      }
      if (hasChanges(changes)) await actions.saveFields(character.id, changes)
    }, 'Character saved.')
    setSaving(false)
    if (ok) setEditing(false)
  }

  const columns = viewColumns(character, fields, isGM)
  const owner = character.kind === 'pc' && character.ownerId ? (character.isMine ? 'You' : nameOf(character.ownerId)) : null

  return (
    <article aria-label={character.name} className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <Portrait character={character} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-bold text-surface-900 dark:text-surface-100">{character.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <RoleBadge character={character} />
            <StatusBadge character={character} />
            <HiddenBadge character={character} />
            {owner && <span className="text-xs text-surface-600 dark:text-surface-400">Player: {owner}</span>}
          </div>
        </div>
        {canEdit && !editing && tab === 'profile' && (
          <button type="button" className={BTN_PRIMARY} onClick={() => setEditing(true)} disabled={loading || !!error}>
            Edit
          </button>
        )}
      </header>

      {!canEdit && character.isMine && !character.inPlay && !isArchived && (
        <p className="text-sm text-surface-600 dark:text-surface-400">This character is retired (has left the story), so you can read but not edit it.</p>
      )}

      {!isGM && canEdit && character.kind === 'pc' && !editing && !sheetEditing && (
        <OwnStatus
          character={character}
          onChange={status => run(() => actions.setMyStatus(character.id, status), `Status set to ${STATUS_LABELS[status]}.`)}
        />
      )}

      {editing ? (
        <ProfileEditor
          channelId={channelId}
          character={character}
          fields={fields}
          isGM={isGM}
          saving={saving}
          onCancel={() => setEditing(false)}
          onSave={save => void handleSave(save)}
        />
      ) : (
        <>
          {isGM && !isArchived && !sheetEditing && (
            <GmControls character={character} players={players} tags={tags} nameOf={nameOf} actions={actions} run={run} onDeleted={onDeleted} />
          )}

          <div role="tablist" aria-label="Profile sections" className="flex gap-4 border-b border-surface-200 dark:border-surface-700">
            {tabs.map(t => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                disabled={sheetEditing && tab !== t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-1 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  tab === t
                    ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                    : 'border-transparent text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-200'
                }`}
              >
                {TAB_LABELS[t](character)}
              </button>
            ))}
          </div>

          {tab === 'sheet' ? (
            <CharacterSheet
              channelId={channelId}
              characterId={character.id}
              kind={character.kind}
              canEdit={canEdit}
              isGM={isGM}
              onEditingChange={setSheetEditing}
            />
          ) : error ? (
            <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <span>Couldn't load this character.</span>
              <button type="button" onClick={reload} className={BTN_SECONDARY}>
                Retry
              </button>
            </div>
          ) : loading && fields.length === 0 ? (
            <div className="animate-pulse space-y-3" aria-label="Loading">
              <div className="h-4 w-3/4 rounded bg-surface-200 dark:bg-surface-700" />
              <div className="h-4 w-1/2 rounded bg-surface-200 dark:bg-surface-700" />
            </div>
          ) : tab === 'profile' ? (
            <div className="space-y-4">
            <div className={`grid gap-4 ${columns.length === 3 ? 'lg:grid-cols-3' : columns.length === 2 ? 'lg:grid-cols-2' : ''}`}>
              {columns.map(column => (
                <section key={column} aria-label={`${VISIBILITY_LABELS[column]} fields`}>
                  <h4 className={SECTION_TITLE}>{VISIBILITY_LABELS[column]}</h4>
                  <p className="mb-2 text-xs text-surface-500 dark:text-surface-400">{columnHint(column, character, isGM)}</p>
                  <FieldColumn fields={fields.filter(f => f.visibility === column)} />
                </section>
              ))}
            </div>
              <LinksSection
                channelId={channelId}
                subject={{ type: 'character', id: character.id }}
                subjectName={character.name}
                isGM={isGM}
                isArchived={isArchived}
                myUserId={myUserId}
              onChanged={reload}
              />
            </div>
          ) : (
            <CharacterActivity
              channelId={channelId}
              character={character}
              isGM={isGM}
              isArchived={isArchived}
              myUserId={myUserId}
              events={events}
              nameOf={nameOf}
            />
          )}
        </>
      )}
    </article>
  )
}

function FieldColumn({ fields }: { fields: CharacterField[] }) {
  if (fields.length === 0) return <p className="text-sm text-surface-400 dark:text-surface-500">Nothing here yet.</p>
  return (
    <dl className="space-y-3">
      {fields.map(field =>
        field.itemType === 'heading' ? (
          <dt key={field.id} className="border-b border-surface-200 pb-0.5 pt-1 text-sm font-semibold uppercase tracking-wide text-surface-800 dark:border-surface-700 dark:text-surface-200">
            {field.label}
          </dt>
        ) : (
          <div key={field.id}>
            <dt className="flex items-center gap-1.5 text-xs font-medium text-surface-600 dark:text-surface-400">
              {field.label}
              {field.private && (
                <span className={`${BADGE} bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200`} title="Stays private even after the character leaves play">
                  🔒 Private
                </span>
              )}
            </dt>
            <dd className="whitespace-pre-wrap break-words text-sm text-surface-900 dark:text-surface-100">
              {field.body || <span className="text-surface-400 dark:text-surface-500">—</span>}
            </dd>
          </div>
        ),
      )}
    </dl>
  )
}
