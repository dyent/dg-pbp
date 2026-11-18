// Database calls for Delta Green sheets. Access rules, validation, the change
// log and the rules maths live in the database (dg_character_sheets migration).
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import type { Json } from '../../../types/database'
import type { SheetData } from './sheetModel'

export interface SheetCalc {
  hpMax: number | null
  wpMax: number | null
  sanStart: number | null
  sanMax: number | null
  breakingPointStart: number | null
}

export interface SheetRow {
  characterId: string
  data: unknown
  calc: SheetCalc
  updatedAt: string
  updatedBy: string | null
}

interface ReadRow {
  character_id: string | null
  data: unknown
  updated_at: string | null
  updated_by: string | null
  hp_max_calc: number | null
  wp_max_calc: number | null
  san_start_calc: number | null
  san_max_calc: number | null
  breaking_point_start_calc: number | null
}

function fail(err: unknown): never {
  throw toError(err)
}

/** The sheet with the database's calculated values, or null when there is none (or it can't be seen). */
export async function getSheet(characterId: string): Promise<SheetRow | null> {
  const { data, error } = await supabase.rpc('dg_get_sheet', { p_character_id: characterId })
  if (error) fail(error)
  const row = ((data ?? []) as ReadRow[])[0]
  if (!row) return null
  return {
    characterId: row.character_id ?? characterId,
    data: row.data,
    calc: {
      hpMax: row.hp_max_calc,
      wpMax: row.wp_max_calc,
      sanStart: row.san_start_calc,
      sanMax: row.san_max_calc,
      breakingPointStart: row.breaking_point_start_calc,
    },
    updatedAt: row.updated_at ?? '',
    updatedBy: row.updated_by,
  }
}

export async function createSheet(characterId: string, channelId: string, sheet: SheetData): Promise<void> {
  const { error } = await supabase
    .from('dg_character_sheets')
    .insert({ character_id: characterId, channel_id: channelId, data: sheet as unknown as Json })
  if (error) fail(error)
}

export async function saveSheet(characterId: string, sheet: SheetData): Promise<void> {
  const { error } = await supabase
    .from('dg_character_sheets')
    .update({ data: sheet as unknown as Json })
    .eq('character_id', characterId)
  if (error) fail(error)
}

export type PoolKey = 'hp' | 'wp' | 'san'

/** Changes only the current HP, WP or SAN (logged like any other sheet change). */
export async function setPool(characterId: string, pool: PoolKey, value: number | null): Promise<void> {
  const { error } = await supabase.rpc('dg_set_pool', {
    p_character_id: characterId,
    p_pool: pool,
    // The generated types mark this as required; the function accepts NULL (clears the value).
    p_value: value as number,
  })
  if (error) fail(error)
}

export async function deleteSheet(characterId: string): Promise<void> {
  const { error } = await supabase.from('dg_character_sheets').delete().eq('character_id', characterId)
  if (error) fail(error)
}
