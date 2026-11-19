// Supabase calls for the character activity log (step 5b). Access rules live
// in the database: notes have row-level security, and ext_character_posts runs
// with the caller's own rights, so a player never gets a post they can't read.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { isNoteVisibility, isPostKind, type ActivityNote, type ActivityPost, type NoteVisibility } from './activityModel'

function fail(err: unknown): never {
  throw toError(err)
}

export const POSTS_PAGE = 50

interface NoteRow {
  id: string
  author_id: string | null
  author_character_name: string | null
  body: string
  visibility: string
  in_game_day: number | null
  created_at: string
  updated_at: string
}

export async function listNotes(characterId: string): Promise<ActivityNote[]> {
  const { data, error } = await supabase
    .from('ext_character_notes')
    .select('id, author_id, author_character_name, body, visibility, in_game_day, created_at, updated_at')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
  if (error) fail(error)
  return ((data ?? []) as NoteRow[]).map(row => ({
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

interface PostRow {
  id: string
  kind: string
  sender_id: string | null
  type: string
  content: string
  npc_name: string | null
  sub_channel_id: string | null
  whisper_to: string | null
  created_at: string
}

/** Posts about a character, newest first; `before` loads older ones. */
export async function listPosts(
  channelId: string,
  characterId: string,
  npcName: string | null,
  terms: string[],
  before: string | null = null,
): Promise<ActivityPost[]> {
  const { data, error } = await supabase.rpc('ext_character_posts', {
    p_channel_id: channelId,
    p_character_id: characterId,
    p_npc_name: npcName as string,
    p_terms: terms,
    p_before: before as string,
    p_limit: POSTS_PAGE,
  })
  if (error) fail(error)
  return ((data ?? []) as PostRow[])
    .filter(row => isPostKind(row.kind))
    .map(row => ({
      id: row.id,
      kind: row.kind as ActivityPost['kind'],
      senderId: row.sender_id,
      type: row.type,
      content: row.content,
      npcName: row.npc_name,
      subChannelId: row.sub_channel_id,
      whisper: row.whisper_to !== null,
      createdAt: row.created_at,
    }))
}

export async function listRoomNames(channelId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('sub_channels').select('id, name').eq('channel_id', channelId)
  if (error) fail(error)
  return new Map(((data ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name]))
}

export async function addNote(characterId: string, body: string, visibility: NoteVisibility, inGameDay: number | null): Promise<void> {
  const { error } = await supabase.rpc('ext_add_character_note', {
    p_character_id: characterId,
    p_body: body,
    p_visibility: visibility,
    p_in_game_day: inGameDay as number,
  })
  if (error) fail(error)
}

export async function updateNote(noteId: string, body: string, visibility: NoteVisibility, inGameDay: number | null): Promise<void> {
  const { error } = await supabase.rpc('ext_update_character_note', {
    p_note_id: noteId,
    p_body: body,
    p_visibility: visibility,
    p_in_game_day: inGameDay as number,
  })
  if (error) fail(error)
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.rpc('ext_delete_character_note', { p_note_id: noteId })
  if (error) fail(error)
}
