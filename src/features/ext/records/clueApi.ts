// Supabase calls for clue extras (Phase 2b step 4): status, found details and
// the GM checklist. The database decides who may see and change what.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { isClueStatus, type ClueStatus } from './recordModel'

function fail(err: unknown): never {
  throw toError(err)
}

export interface ClueDetails {
  status: ClueStatus
  /** Who found it and where; null when not set or hidden from the viewer. */
  foundBy: { id: string; name: string } | null
  foundAt: { id: string; name: string } | null
  foundDay: number | null
}

interface DetailsRow {
  clue_status: string | null
  found_by_character_id: string | null
  found_by_name: string | null
  found_at_record_id: string | null
  found_at_name: string | null
  found_day: number | null
}

/** The clue's status and found details, with only the names the viewer may see. */
export async function getClueDetails(recordId: string): Promise<ClueDetails | null> {
  const { data, error } = await supabase.rpc('ext_clue_details', { p_record_id: recordId })
  if (error) fail(error)
  const row = ((data ?? []) as DetailsRow[])[0]
  if (!row) return null
  return {
    status: isClueStatus(row.clue_status) ? row.clue_status : 'unexamined',
    foundBy: row.found_by_character_id && row.found_by_name ? { id: row.found_by_character_id, name: row.found_by_name } : null,
    foundAt: row.found_at_record_id && row.found_at_name ? { id: row.found_at_record_id, name: row.found_at_name } : null,
    foundDay: row.found_day,
  }
}

export async function setClueStatus(recordId: string, status: ClueStatus): Promise<void> {
  const { error } = await supabase.from('ext_records').update({ clue_status: status }).eq('id', recordId)
  if (error) fail(error)
}

export interface FoundDraft {
  byId: string | null
  atId: string | null
  day: number | null
}

export async function setClueFound(recordId: string, found: FoundDraft): Promise<void> {
  const { error } = await supabase
    .from('ext_records')
    .update({ found_by_character_id: found.byId, found_at_record_id: found.atId, found_day: found.day })
    .eq('id', recordId)
  if (error) fail(error)
}

export interface FoundOption {
  id: string
  name: string
}

/** For the GM: the campaign's PCs and locations, to say who found a clue and where. */
export async function listFoundOptions(channelId: string): Promise<{ pcs: FoundOption[]; locations: FoundOption[] }> {
  const [pcs, locations] = await Promise.all([
    supabase.from('ext_characters').select('id, name').eq('channel_id', channelId).eq('kind', 'pc').order('name'),
    supabase.from('ext_records').select('id, name').eq('channel_id', channelId).eq('kind', 'location').order('name'),
  ])
  if (pcs.error) fail(pcs.error)
  if (locations.error) fail(locations.error)
  return { pcs: (pcs.data ?? []) as FoundOption[], locations: (locations.data ?? []) as FoundOption[] }
}

export interface CluePoint {
  id: string
  body: string
  workedOut: boolean
  sortOrder: number
}

export const CLUE_POINT_MAX = 300

export async function listCluePoints(recordId: string): Promise<CluePoint[]> {
  const { data, error } = await supabase
    .from('ext_clue_points')
    .select('id, body, worked_out, sort_order')
    .eq('record_id', recordId)
    .order('sort_order')
    .order('created_at')
  if (error) fail(error)
  return (data ?? []).map(p => ({ id: p.id, body: p.body, workedOut: p.worked_out, sortOrder: p.sort_order }))
}

export async function addCluePoint(recordId: string, channelId: string, body: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('ext_clue_points')
    .insert({ record_id: recordId, channel_id: channelId, body: body.trim(), sort_order: sortOrder })
  if (error) fail(error)
}

export async function updateCluePoint(pointId: string, patch: { body?: string; worked_out?: boolean }): Promise<void> {
  const { error } = await supabase
    .from('ext_clue_points')
    .update(patch.body === undefined ? patch : { ...patch, body: patch.body.trim() })
    .eq('id', pointId)
  if (error) fail(error)
}

export async function deleteCluePoint(pointId: string): Promise<void> {
  const { error } = await supabase.from('ext_clue_points').delete().eq('id', pointId)
  if (error) fail(error)
}
