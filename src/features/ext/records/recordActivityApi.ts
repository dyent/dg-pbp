// Supabase calls for a record's Activity tab, aliases and notes (Phase 2b
// step 2). Access rules live in the database: notes have row-level security,
// aliases are GM only, and ext_record_posts runs with the caller's own rights.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { POSTS_PAGE } from '../activity/activityApi'
import { isNoteVisibility, type ActivityNote, type ActivityPost, type NoteVisibility } from '../activity/activityModel'

function fail(err: unknown): never {
  throw toError(err)
}

/** Posts that tag or mention a record, newest first; `before` loads older ones. */
export async function listRecordPosts(channelId: string, recordId: string, terms: string[], before: string | null = null): Promise<ActivityPost[]> {
  const { data, error } = await supabase.rpc('ext_record_posts', {
    p_channel_id: channelId,
    p_record_id: recordId,
    p_terms: terms,
    p_before: before as string,
    p_limit: POSTS_PAGE,
  })
  if (error) fail(error)
  return (data ?? []).map(row => ({
    id: row.id,
    kind: 'mentioned' as const,
    senderId: row.sender_id,
    type: row.type,
    content: row.content,
    npcName: row.npc_name,
    subChannelId: row.sub_channel_id,
    whisper: row.whisper_to !== null,
    createdAt: row.created_at,
  }))
}

export async function listRecordNotes(recordId: string): Promise<ActivityNote[]> {
  const { data, error } = await supabase
    .from('ext_record_notes')
    .select('id, author_id, author_character_name, body, visibility, in_game_day, created_at, updated_at')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
  if (error) fail(error)
  return (data ?? []).map(row => ({
    id: row.id,
    authorId: row.author_id,
    authorCharacterName: row.author_character_name,
    body: row.body,
    visibility: isNoteVisibility(row.visibility) ? row.visibility : 'gm',
    inGameDay: row.in_game_day,
    createdAt: row.created_at,
    edited: row.updated_at !== row.created_at,
  }))
}

export async function addRecordNote(recordId: string, body: string, visibility: NoteVisibility, inGameDay: number | null): Promise<void> {
  const { error } = await supabase.rpc('ext_add_record_note', {
    p_record_id: recordId,
    p_body: body,
    p_visibility: visibility,
    p_in_game_day: inGameDay as number,
  })
  if (error) fail(error)
}

export async function updateRecordNote(noteId: string, body: string, visibility: NoteVisibility, inGameDay: number | null): Promise<void> {
  const { error } = await supabase.rpc('ext_update_record_note', {
    p_note_id: noteId,
    p_body: body,
    p_visibility: visibility,
    p_in_game_day: inGameDay as number,
  })
  if (error) fail(error)
}

export async function deleteRecordNote(noteId: string): Promise<void> {
  const { error } = await supabase.rpc('ext_delete_record_note', { p_note_id: noteId })
  if (error) fail(error)
}

/** GM only: a record's aliases, in order. */
export async function listRecordAliases(recordId: string): Promise<string[]> {
  const { data, error } = await supabase.from('ext_record_aliases').select('alias, sort_order').eq('record_id', recordId).order('sort_order')
  if (error) fail(error)
  return (data ?? []).map(row => row.alias)
}

export async function setRecordAliases(recordId: string, aliases: string[]): Promise<void> {
  const { error } = await supabase.rpc('ext_set_record_aliases', { p_record_id: recordId, p_aliases: aliases })
  if (error) fail(error)
}
