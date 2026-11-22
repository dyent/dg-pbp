// Every Supabase call the Case file makes. Each function throws an Error with a
// readable message on failure. Access rules live in the database (row-level
// security and functions); this file only asks.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import type { FieldChanges, ItemType } from '../characters/characterModel'
import {
  isRecordKind,
  isRecordVisibility,
  type CampaignRecord,
  type RecordEvent,
  type RecordField,
  type RecordKind,
  type RecordVisibility,
} from './recordModel'

function fail(err: unknown): never {
  throw toError(err)
}

interface RecordRow {
  id: string
  kind: string
  name: string
  picture_url: string | null
  provenance: string
  visibility: string
  updated_at: string
}

/**
 * Records the caller may see (the database filters by sharing). The GM also
 * gets each record's tags and chosen players.
 */
export async function listRecords(channelId: string, isGM: boolean): Promise<CampaignRecord[]> {
  const { data, error } = await supabase
    .from('ext_records')
    .select('id, kind, name, picture_url, provenance, visibility, updated_at')
    .eq('channel_id', channelId)
    .order('name')
  if (error) fail(error)
  const rows = ((data ?? []) as RecordRow[]).filter(r => isRecordKind(r.kind))
  const tags = new Map<string, string[]>()
  const shares = new Map<string, string[]>()
  if (isGM && rows.length > 0) {
    const ids = rows.map(r => r.id)
    const [tagResult, shareResult] = await Promise.all([
      supabase.from('ext_record_tags').select('record_id, tag_id').in('record_id', ids),
      supabase.from('ext_record_shares').select('record_id, user_id').in('record_id', ids),
    ])
    if (tagResult.error) fail(tagResult.error)
    if (shareResult.error) fail(shareResult.error)
    for (const t of tagResult.data ?? []) tags.set(t.record_id, [...(tags.get(t.record_id) ?? []), t.tag_id])
    for (const s of shareResult.data ?? []) shares.set(s.record_id, [...(shares.get(s.record_id) ?? []), s.user_id])
  }
  return rows.map(r => ({
    id: r.id,
    kind: r.kind as RecordKind,
    name: r.name,
    pictureUrl: r.picture_url,
    provenance: r.provenance === 'source' ? 'source' : 'canon',
    visibility: isRecordVisibility(r.visibility) ? r.visibility : 'gm',
    updatedAt: r.updated_at,
    tagIds: tags.get(r.id) ?? [],
    sharedWith: shares.get(r.id) ?? [],
  }))
}

export async function createRecord(channelId: string, kind: RecordKind, name: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('ext_records')
    .insert({ channel_id: channelId, kind, name: name.trim(), created_by: userId })
    .select('id')
    .single()
  if (error) fail(error)
  return (data as { id: string }).id
}

export async function updateRecord(recordId: string, patch: { name?: string; picture_url?: string | null }): Promise<void> {
  const { error } = await supabase.from('ext_records').update(patch).eq('id', recordId)
  if (error) fail(error)
}

export async function deleteRecord(recordId: string): Promise<void> {
  const { error } = await supabase.from('ext_records').delete().eq('id', recordId)
  if (error) fail(error)
}

export async function setRecordVisibility(recordId: string, visibility: RecordVisibility, playerIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('ext_set_record_visibility', {
    p_record_id: recordId,
    p_visibility: visibility,
    p_player_ids: visibility === 'selected' ? playerIds : [],
  })
  if (error) fail(error)
}

interface FieldRow {
  id: string
  record_id: string
  item_type: string
  field_key: string | null
  label: string
  body: string
  visibility: string
  sort_order: number
}

/** The fields the caller may read (players get only the Everyone ones). */
export async function listRecordFields(recordId: string): Promise<RecordField[]> {
  const { data, error } = await supabase
    .from('ext_record_fields')
    .select('id, record_id, item_type, field_key, label, body, visibility, sort_order')
    .eq('record_id', recordId)
    .order('sort_order')
  if (error) fail(error)
  return ((data ?? []) as FieldRow[]).map(row => ({
    id: row.id,
    recordId: row.record_id,
    itemType: (row.item_type === 'heading' ? 'heading' : 'field') as ItemType,
    fieldKey: row.field_key,
    label: row.label,
    body: row.body,
    visibility: row.visibility === 'players' ? 'players' : 'gm',
    private: false,
    sortOrder: row.sort_order,
  }))
}

/** Apply an edit-mode save: removals, then changes, then additions (each logged by the database). */
export async function saveRecordFields(recordId: string, channelId: string, changes: FieldChanges): Promise<void> {
  if (changes.deletes.length > 0) {
    const { error } = await supabase.from('ext_record_fields').delete().in('id', changes.deletes)
    if (error) fail(error)
  }
  for (const { id, patch } of changes.updates) {
    const { private: _private, ...rest } = patch
    const { error } = await supabase.from('ext_record_fields').update(rest).eq('id', id)
    if (error) fail(error)
  }
  if (changes.inserts.length > 0) {
    // The database copies channel_id from the record anyway.
    const rows = changes.inserts.map(({ private: _private, ...insert }) => ({ ...insert, record_id: recordId, channel_id: channelId }))
    const { error } = await supabase.from('ext_record_fields').insert(rows)
    if (error) fail(error)
  }
}

export const RECORD_HISTORY_LIMIT = 200

/** GM only: a record's history, newest first. */
export async function listRecordEvents(recordId: string): Promise<RecordEvent[]> {
  const { data, error } = await supabase
    .from('ext_record_events')
    .select('id, event_type, details, actor_id, created_at')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(RECORD_HISTORY_LIMIT)
  if (error) fail(error)
  return (data ?? []).map(row => ({
    id: row.id,
    eventType: row.event_type,
    details: (row.details && typeof row.details === 'object' && !Array.isArray(row.details) ? row.details : {}) as Record<
      string,
      unknown
    >,
    actorId: row.actor_id,
    createdAt: row.created_at,
  }))
}

export async function setRecordTags(recordId: string, add: string[], remove: string[]): Promise<void> {
  if (remove.length > 0) {
    const { error } = await supabase.from('ext_record_tags').delete().eq('record_id', recordId).in('tag_id', remove)
    if (error) fail(error)
  }
  if (add.length > 0) {
    const { error } = await supabase.from('ext_record_tags').insert(add.map(tagId => ({ record_id: recordId, tag_id: tagId })))
    if (error) fail(error)
  }
}
