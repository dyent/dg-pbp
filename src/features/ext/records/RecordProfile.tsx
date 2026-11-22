import { useEffect, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import type { PlayerOption } from '../characters/GmControls'
import { createTag } from '../characters/characterApi'
import { VISIBILITY_LABELS, hasChanges, type Tag } from '../characters/characterModel'
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, SECTION_TITLE } from '../characters/ui'
import * as api from './recordApi'
import { RecordEditor, type RecordSave } from './RecordEditor'
import { RecordGmControls, type RecordGmActions } from './RecordGmControls'
import { KindBadge, RecordIcon } from './RecordIcon'
import { RecordActivity } from './RecordActivity'
import { setRecordAliases } from './recordActivityApi'
import { RECORD_COLUMNS, sharingLabel, type CampaignRecord, type RecordField } from './recordModel'
import { useRecordProfile } from './useRecords'

interface RecordProfileProps {
  channelId: string
  record: CampaignRecord
  isGM: boolean
  isArchived: boolean
  players: PlayerOption[]
  tags: Tag[]
  nameOf: (userId: string) => string
  onChanged: () => void
  onDeleted: () => void
  onEditingChange: (editing: boolean) => void
  /** The viewer, to offer Edit on their own notes. */
  myUserId?: string
}

type RecordTab = 'profile' | 'activity'

export function RecordProfile({
  channelId,
  record,
  isGM,
  isArchived,
  players,
  tags,
  nameOf,
  onChanged,
  onDeleted,
  onEditingChange,
  myUserId,
}: RecordProfileProps) {
  const { fields, events, aliases, loading, error, reload } = useRecordProfile(record.id, isGM)
  const { addToast } = useToast()
  const [tab, setTab] = useState<RecordTab>('profile')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const canManage = isGM && !isArchived

  useEffect(() => {
    onEditingChange(editing)
  }, [editing, onEditingChange])

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

  const handleSave = async ({ name, pictureUrl, changes }: RecordSave) => {
    setSaving(true)
    const ok = await run(async () => {
      if (name !== record.name || pictureUrl !== record.pictureUrl) {
        await api.updateRecord(record.id, { name, picture_url: pictureUrl })
      }
      if (hasChanges(changes)) await api.saveRecordFields(record.id, channelId, changes)
    }, 'Record saved.')
    setSaving(false)
    if (ok) setEditing(false)
  }

  const gmActions: RecordGmActions = {
    setVisibility: (visibility, playerIds) => run(() => api.setRecordVisibility(record.id, visibility, playerIds), 'Sharing saved.'),
    setAliases: list => run(() => setRecordAliases(record.id, list), 'Aliases saved.'),
    setTags: (add, remove, success) => run(() => api.setRecordTags(record.id, add, remove), success),
    createTag: async name => {
      try {
        return await createTag(channelId, name)
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Could not add the tag.', 'error')
        throw err
      }
    },
    remove: async () => {
      try {
        await api.deleteRecord(record.id)
        addToast(`${record.name} deleted.`, 'success')
        onDeleted()
        return true
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Could not delete the record.', 'error')
        return false
      }
    },
  }

  const columns = isGM ? RECORD_COLUMNS : RECORD_COLUMNS.filter(c => c === 'players')

  return (
    <article aria-label={record.name} className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <RecordIcon kind={record.kind} pictureUrl={record.pictureUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-bold text-surface-900 dark:text-surface-100">{record.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <KindBadge kind={record.kind} />
            {isGM && <SharingBadge record={record} nameOf={nameOf} />}
          </div>
        </div>
        {canManage && !editing && tab === 'profile' && (
          <button type="button" className={BTN_PRIMARY} onClick={() => setEditing(true)} disabled={loading || !!error}>
            Edit
          </button>
        )}
      </header>

      {editing ? (
        <RecordEditor channelId={channelId} record={record} fields={fields} saving={saving} onCancel={() => setEditing(false)} onSave={save => void handleSave(save)} />
      ) : error ? (
        <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <span>Couldn't load this record.</span>
          <button type="button" onClick={reload} className={BTN_SECONDARY}>
            Retry
          </button>
        </div>
      ) : loading && fields.length === 0 ? (
        <div className="animate-pulse space-y-3" aria-label="Loading">
          <div className="h-4 w-3/4 rounded bg-surface-200 dark:bg-surface-700" />
          <div className="h-4 w-1/2 rounded bg-surface-200 dark:bg-surface-700" />
        </div>
      ) : (
        <>
          {canManage && <RecordGmControls record={record} players={players} tags={tags} aliases={aliases} actions={gmActions} />}
          <div role="tablist" aria-label="Record sections" className="flex gap-4 border-b border-surface-200 dark:border-surface-700">
            {(['profile', 'activity'] as const).map(t => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-1 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  tab === t
                    ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                    : 'border-transparent text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-200'
                }`}
              >
                {t === 'profile' ? 'Profile' : 'Activity'}
              </button>
            ))}
          </div>
          {tab === 'activity' ? (
            <RecordActivity
              channelId={channelId}
              record={record}
              aliases={aliases}
              isGM={isGM}
              isArchived={isArchived}
              myUserId={myUserId}
              events={events}
              nameOf={nameOf}
            />
          ) : (
          <div className={`grid gap-4 ${columns.length === 2 ? 'lg:grid-cols-2' : ''}`}>
            {columns.map(column => (
              <section key={column} aria-label={`${VISIBILITY_LABELS[column]} fields`}>
                {isGM && (
                  <>
                    <h4 className={SECTION_TITLE}>{VISIBILITY_LABELS[column]}</h4>
                    <p className="mb-2 text-xs text-surface-500 dark:text-surface-400">
                      {column === 'players' ? 'Players who can see the record read these.' : 'Only you can see these.'}
                    </p>
                  </>
                )}
                <FieldList fields={fields.filter(f => f.visibility === column)} showEmpty={isGM} />
              </section>
            ))}
          </div>
          )}
        </>
      )}
    </article>
  )
}

export function SharingBadge({ record, nameOf }: { record: CampaignRecord; nameOf: (userId: string) => string }) {
  const color =
    record.visibility === 'gm'
      ? 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
      : record.visibility === 'players'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
        : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
  return (
    <span className={`${BADGE} ${color}`} title="Who can see this record">
      {record.visibility === 'gm' ? 'Hidden' : sharingLabel(record, nameOf)}
    </span>
  )
}

/** Fields as read. Players don't see empty fields; the GM sees them as "—". */
function FieldList({ fields, showEmpty }: { fields: RecordField[]; showEmpty: boolean }) {
  const filled = showEmpty ? fields : fields.filter(f => f.itemType === 'heading' || f.body.trim())
  if (filled.length === 0) return <p className="text-sm text-surface-400 dark:text-surface-500">Nothing here yet.</p>
  return (
    <dl className="space-y-3">
      {filled.map(field =>
        field.itemType === 'heading' ? (
          <dt key={field.id} className="border-b border-surface-200 pb-0.5 pt-1 text-sm font-semibold uppercase tracking-wide text-surface-800 dark:border-surface-700 dark:text-surface-200">
            {field.label}
          </dt>
        ) : (
          <div key={field.id}>
            <dt className="text-xs font-medium text-surface-600 dark:text-surface-400">{field.label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm text-surface-900 dark:text-surface-100">
              {field.body || <span className="text-surface-400 dark:text-surface-500">—</span>}
            </dd>
          </div>
        ),
      )}
    </dl>
  )
}
