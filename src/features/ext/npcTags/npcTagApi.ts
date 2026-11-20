import { supabase } from '../../../lib/supabase'
import { listCharacters } from '../characters/characterApi'
import type { NpcTagOption } from './npcTagModel'

/** NPCs the viewer may tag: every NPC (with aliases) for the GM, revealed ones for players. */
export async function listTaggableNpcs(channelId: string, isGM: boolean, myUserId: string | undefined): Promise<NpcTagOption[]> {
  const characters = await listCharacters(channelId, isGM, myUserId)
  return characters
    .filter(c => c.kind === 'npc')
    .map(c => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, aliases: isGM ? (c.aliases ?? []) : [] }))
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
  characterId: string
  alias: string
}

/** The campaign's alias tags. Only the GM can read them; players get none. */
export async function listAliasTags(channelId: string): Promise<AliasTag[]> {
  const { data, error } = await supabase.from('ext_npc_alias_tags').select('id, character_id, alias').eq('channel_id', channelId)
  if (error) throw new Error(error.message)
  return (data ?? []).map(row => ({ id: row.id, characterId: row.character_id, alias: row.alias }))
}

/** The tag id for one of an NPC's aliases (GM only; created the first time). */
export async function aliasTagId(characterId: string, alias: string): Promise<string> {
  const { data, error } = await supabase.rpc('ext_npc_alias_tag', { p_character_id: characterId, p_alias: alias })
  if (error || !data) throw new Error(error?.message ?? 'Could not tag the alias')
  return data
}
