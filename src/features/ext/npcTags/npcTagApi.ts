// cspell:words recalias
import { supabase } from '../../../lib/supabase'
import { listCharacters } from '../characters/characterApi'
import { listRecords } from '../records/recordApi'
import type { NpcTagOption } from './npcTagModel'

/** NPCs the viewer may tag: every NPC (with aliases) for the GM, revealed ones for players. */
export async function listTaggableNpcs(channelId: string, isGM: boolean, myUserId: string | undefined): Promise<NpcTagOption[]> {
  const characters = await listCharacters(channelId, isGM, myUserId)
  return characters
    .filter(c => c.kind === 'npc')
    .map(c => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, aliases: isGM ? (c.aliases ?? []) : [] }))
}

/**
 * Campaign records the viewer may tag: every record (with its GM-only aliases)
 * for the GM, the records shown to them for players.
 */
export async function listTaggableRecords(channelId: string, isGM: boolean): Promise<NpcTagOption[]> {
  const records = await listRecords(channelId, isGM)
  const aliases = new Map<string, string[]>()
  if (isGM && records.length > 0) {
    const { data, error } = await supabase
      .from('ext_record_aliases')
      .select('record_id, alias, sort_order')
      .eq('channel_id', channelId)
      .order('sort_order')
    if (error) throw new Error(error.message)
    for (const row of data ?? []) aliases.set(row.record_id, [...(aliases.get(row.record_id) ?? []), row.alias])
  }
  return records.map(r => ({ id: r.id, name: r.name, portraitUrl: r.pictureUrl, recordKind: r.kind, aliases: aliases.get(r.id) ?? [] }))
}

/**
 * Current name and portrait of tagged NPCs, including hidden ones (only what
 * the tag itself shows; their profile stays hidden).
 */
export async function fetchNpcLabels(channelId: string, ids: string[]): Promise<NpcTagOption[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.rpc('ext_npc_tag_labels', { p_channel_id: channelId, p_ids: ids })
  if (error) throw new Error(error.message)
  return (data ?? []).map(row => ({ id: row.id, name: row.name, portraitUrl: row.portrait_url || null }))
}

export interface AliasTag {
  id: string
  /** The NPC or record the alias belongs to. */
  targetId: string
  alias: string
}

/** The campaign's alias tags (NPCs and records). Only the GM can read them; players get none. */
export async function listAliasTags(channelId: string): Promise<AliasTag[]> {
  const [npcs, records] = await Promise.all([
    supabase.from('ext_npc_alias_tags').select('id, character_id, alias').eq('channel_id', channelId),
    supabase.from('ext_record_alias_tags').select('id, record_id, alias').eq('channel_id', channelId),
  ])
  if (npcs.error) throw new Error(npcs.error.message)
  if (records.error) throw new Error(records.error.message)
  return [
    ...(npcs.data ?? []).map(row => ({ id: row.id, targetId: row.character_id, alias: row.alias })),
    ...(records.data ?? []).map(row => ({ id: row.id, targetId: row.record_id, alias: row.alias })),
  ]
}

/** The tag id for one of an NPC's or record's aliases (GM only; created the first time). */
export async function aliasTagId(target: NpcTagOption, alias: string): Promise<string> {
  const { data, error } = target.recordKind
    ? await supabase.rpc('ext_record_alias_tag', { p_record_id: target.id, p_alias: alias })
    : await supabase.rpc('ext_npc_alias_tag', { p_character_id: target.id, p_alias: alias })
  if (error || !data) throw new Error(error?.message ?? 'Could not tag the alias')
  return data
}
