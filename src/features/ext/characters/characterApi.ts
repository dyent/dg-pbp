// Every Supabase call the characters panel makes. Each function throws an
// Error with a readable message on failure. Access rules live in the database
// (row-level security and functions); this file only asks.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import {
  isStatus,
  type CharacterEvent,
  type CharacterField,
  type CharacterKind,
  type CharacterSummary,
  type FieldChanges,
  type ItemType,
  type Status,
  type Tag,
  type Visibility,
} from './characterModel'

function fail(err: unknown): never {
  throw toError(err)
}

interface GmCharacterRow {
  id: string
  kind: string
  in_play: boolean
  name: string
  portrait_url: string | null
  status: string
  owner_id: string | null
  updated_at: string
  revealed: boolean
  status_visible: boolean
  aliases: string[] | null
  ext_character_tags?: { tag_id: string }[] | null
}

interface PlayerCharacterRow {
  id: string
  kind: string
  in_play: boolean
  name: string
  portrait_url: string | null
  status: string | null
  owner_id: string | null
  is_mine: boolean
  updated_at: string
}

const kindOf = (value: string): CharacterKind => (value === 'npc' ? 'npc' : 'pc')

export function fromGmRow(row: GmCharacterRow, myUserId: string | undefined): CharacterSummary {
  return {
    id: row.id,
    kind: kindOf(row.kind),
    inPlay: row.in_play,
    name: row.name,
    portraitUrl: row.portrait_url,
    status: isStatus(row.status) ? row.status : null,
    ownerId: row.owner_id,
    isMine: row.kind === 'pc' && !!myUserId && row.owner_id === myUserId,
    updatedAt: row.updated_at,
    revealed: row.revealed,
    statusVisible: row.status_visible,
    aliases: row.aliases ?? [],
    tagIds: (row.ext_character_tags ?? []).map(t => t.tag_id),
  }
}

export function fromPlayerRow(row: PlayerCharacterRow): CharacterSummary {
  return {
    id: row.id,
    kind: kindOf(row.kind),
    inPlay: row.in_play,
    name: row.name,
    portraitUrl: row.portrait_url,
    status: isStatus(row.status) ? row.status : null,
    ownerId: row.owner_id,
    isMine: row.is_mine,
    updatedAt: row.updated_at,
  }
}

/** GM: every character with GM extras. Players: what they're allowed to see. */
export async function listCharacters(
  channelId: string,
  isGM: boolean,
  myUserId: string | undefined,
): Promise<CharacterSummary[]> {
  if (isGM) {
    const { data, error } = await supabase
      .from('ext_characters')
      .select('id, kind, in_play, name, portrait_url, status, owner_id, updated_at, revealed, status_visible, aliases, ext_character_tags(tag_id)')
      .eq('channel_id', channelId)
      .order('name')
    if (error) fail(error)
    return ((data ?? []) as GmCharacterRow[]).map(row => fromGmRow(row, myUserId))
  }
  const { data, error } = await supabase.rpc('ext_list_revealed_characters', { p_channel_id: channelId })
  if (error) fail(error)
  return ((data ?? []) as PlayerCharacterRow[]).map(fromPlayerRow)
}

export async function createCharacter(
  channelId: string,
  kind: CharacterKind,
  name: string,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('ext_characters')
    .insert({ channel_id: channelId, kind, name: name.trim(), created_by: userId })
    .select('id')
    .single()
  if (error) fail(error)
  return (data as { id: string }).id
}

export interface GmCharacterPatch {
  name?: string
  portrait_url?: string | null
  status?: Status
  status_visible?: boolean
  revealed?: boolean
  aliases?: string[]
}

/** GM-only settings (status, reveal, aliases, name, portrait). */
export async function updateCharacter(characterId: string, patch: GmCharacterPatch): Promise<void> {
  const { error } = await supabase.from('ext_characters').update(patch).eq('id', characterId)
  if (error) fail(error)
}

/** The owner of an in-play PC (or the GM) renames or repictures it. */
export async function updateMyCharacter(characterId: string, name: string, portraitUrl: string | null): Promise<void> {
  const { error } = await supabase.rpc('ext_update_my_character', {
    p_character_id: characterId,
    p_name: name,
    p_portrait_url: portraitUrl ?? '',
  })
  if (error) fail(error)
}

export async function deleteCharacter(characterId: string): Promise<void> {
  const { error } = await supabase.from('ext_characters').delete().eq('id', characterId)
  if (error) fail(error)
}

export async function setRole(
  characterId: string,
  kind: CharacterKind,
  inPlay: boolean,
  ownerId: string | null,
  note: string,
  status?: Status,
): Promise<void> {
  const { error } = await supabase.rpc('ext_set_role', {
    p_character_id: characterId,
    p_kind: kind,
    p_in_play: inPlay,
    // The generated types mark this as required text; the function accepts NULL.
    p_owner_id: ownerId as string,
    p_note: note.trim() || undefined,
    p_status: status,
  })
  if (error) fail(error)
}

/** A player switches their own in-play PC between the temporary statuses. */
export async function setMyStatus(characterId: string, status: Status): Promise<void> {
  const { error } = await supabase.rpc('ext_set_my_status', { p_character_id: characterId, p_status: status })
  if (error) fail(error)
}

export async function postAs(characterId: string): Promise<void> {
  const { error } = await supabase.rpc('ext_post_as', { p_character_id: characterId })
  if (error) fail(error)
}

// ---------------------------------------------------------------------------
// Fields and history
// ---------------------------------------------------------------------------

interface FieldRow {
  id: string
  character_id: string
  channel_id: string
  item_type: string
  field_key: string | null
  label: string
  body: string
  visibility: string
  private: boolean
  sort_order: number
}

const visibilityOf = (value: string): Visibility =>
  value === 'players' || value === 'owner' ? value : 'gm'

export async function listFields(characterId: string): Promise<CharacterField[]> {
  const { data, error } = await supabase
    .from('ext_character_fields')
    .select('id, character_id, channel_id, item_type, field_key, label, body, visibility, private, sort_order')
    .eq('character_id', characterId)
    .order('sort_order')
  if (error) fail(error)
  return ((data ?? []) as FieldRow[]).map(row => ({
    id: row.id,
    characterId: row.character_id,
    channelId: row.channel_id,
    itemType: (row.item_type === 'heading' ? 'heading' : 'field') as ItemType,
    fieldKey: row.field_key,
    label: row.label,
    body: row.body,
    visibility: visibilityOf(row.visibility),
    private: row.private,
    sortOrder: row.sort_order,
  }))
}

/**
 * Apply an edit-mode save. Removals first, then changes, then additions. Each
 * write is logged by the database for the GM.
 */
export async function saveFields(characterId: string, channelId: string, changes: FieldChanges): Promise<void> {
  if (changes.deletes.length > 0) {
    const { error } = await supabase.from('ext_character_fields').delete().in('id', changes.deletes)
    if (error) fail(error)
  }
  for (const { id, patch } of changes.updates) {
    const { error } = await supabase.from('ext_character_fields').update(patch).eq('id', id)
    if (error) fail(error)
  }
  if (changes.inserts.length > 0) {
    const rows = changes.inserts.map(insert => ({ ...insert, character_id: characterId, channel_id: channelId }))
    const { error } = await supabase.from('ext_character_fields').insert(rows)
    if (error) fail(error)
  }
}

interface EventRow {
  id: string
  event_type: string
  details: unknown
  note: string | null
  visibility: string
  actor_id: string | null
  created_at: string
}

export const HISTORY_LIMIT = 200

export async function listEvents(characterId: string): Promise<CharacterEvent[]> {
  const { data, error } = await supabase
    .from('ext_character_events')
    .select('id, event_type, details, note, visibility, actor_id, created_at')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  if (error) fail(error)
  return ((data ?? []) as EventRow[]).map(row => ({
    id: row.id,
    eventType: row.event_type,
    details: row.details && typeof row.details === 'object' ? (row.details as Record<string, unknown>) : {},
    note: row.note,
    visibility: visibilityOf(row.visibility),
    actorId: row.actor_id,
    createdAt: row.created_at,
  }))
}

/** GM adds a private note to a character's history. */
export async function addNote(characterId: string, channelId: string, note: string, userId: string): Promise<void> {
  const { error } = await supabase.from('ext_character_events').insert({
    character_id: characterId,
    channel_id: channelId,
    event_type: 'note',
    note: note.trim(),
    visibility: 'gm',
    actor_id: userId,
  })
  if (error) fail(error)
}

// ---------------------------------------------------------------------------
// Tags (GM only)
// ---------------------------------------------------------------------------

export async function listTags(channelId: string): Promise<Tag[]> {
  const { data, error } = await supabase.from('ext_tags').select('id, name').eq('channel_id', channelId).order('name')
  if (error) fail(error)
  return (data ?? []) as Tag[]
}

export async function createTag(channelId: string, name: string): Promise<Tag> {
  const { data, error } = await supabase
    .from('ext_tags')
    .insert({ channel_id: channelId, name: name.trim() })
    .select('id, name')
    .single()
  if (error) fail(error)
  return data as Tag
}

export async function setCharacterTags(characterId: string, add: string[], remove: string[]): Promise<void> {
  if (remove.length > 0) {
    const { error } = await supabase
      .from('ext_character_tags')
      .delete()
      .eq('character_id', characterId)
      .in('tag_id', remove)
    if (error) fail(error)
  }
  if (add.length > 0) {
    const { error } = await supabase
      .from('ext_character_tags')
      .insert(add.map(tagId => ({ character_id: characterId, tag_id: tagId })))
    if (error) fail(error)
  }
}
