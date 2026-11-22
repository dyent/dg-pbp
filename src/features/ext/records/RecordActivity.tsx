import { useMemo } from 'react'
import { ActivityLog, type NoteActions } from '../activity/CharacterActivity'
import { searchTerms, type ActivityFilter } from '../activity/activityModel'
import { useActivity } from '../activity/useActivity'
import * as api from './recordActivityApi'
import { describeRecordEvent, type CampaignRecord, type RecordEvent } from './recordModel'

const RECORD_FILTERS: readonly ActivityFilter[] = ['all', 'mentions', 'notes', 'changes']

interface RecordActivityProps {
  channelId: string
  record: CampaignRecord
  /** GM-only aliases (searched for the GM only). */
  aliases: string[]
  isGM: boolean
  isArchived: boolean
  myUserId: string | undefined
  /** History (GM only; empty for players). */
  events: RecordEvent[]
  nameOf: (userId: string) => string
}

/** A record's Activity tab: posts that tag or mention it, notes and (for the GM) history. */
export function RecordActivity({ channelId, record, aliases, isGM, isArchived, myUserId, events, nameOf }: RecordActivityProps) {
  const terms = useMemo(() => searchTerms({ name: record.name, aliases }, isGM), [record.name, aliases, isGM])
  const data = useActivity(channelId, [record.id, ...terms].join('\u0000'), {
    posts: before => api.listRecordPosts(channelId, record.id, terms, before),
    notes: () => api.listRecordNotes(record.id),
  })
  const notes = useMemo<NoteActions>(
    () => ({
      add: (body, visibility, day) => api.addRecordNote(record.id, body, visibility, day),
      update: api.updateRecordNote,
      remove: api.deleteRecordNote,
    }),
    [record.id],
  )
  return (
    <ActivityLog
      data={data}
      events={events}
      renderChange={(event, extra) => (
        <p className="text-sm text-surface-800 dark:text-surface-200">
          {describeRecordEvent(event, nameOf)}
          <span className="block text-xs text-surface-500 dark:text-surface-400">
            {new Date(event.createdAt).toLocaleString()} {extra}
          </span>
        </p>
      )}
      subjectName={record.name}
      subjectNoun="record"
      isGM={isGM}
      isArchived={isArchived}
      myUserId={myUserId}
      nameOf={nameOf}
      notes={notes}
      filters={RECORD_FILTERS}
    />
  )
}
