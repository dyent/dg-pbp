// Every Supabase call the in-game calendar makes. Each function throws an Error
// with a readable message on failure; the GM-only rules live in the database.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { SHIFT_UNITS, type CalendarChange, type ShiftUnit } from './calendarModel'

function fail(err: unknown): never {
  throw toError(err)
}

// The generated types mark every function argument as required text; the
// database treats a missing room as "the whole campaign".
const room = (subChannelId: string | null) => subChannelId as string

export async function listChanges(channelId: string): Promise<CalendarChange[]> {
  const { data, error } = await supabase
    .from('ext_calendar_changes')
    .select('id, sub_channel_id, kind, day_number, shift_amount, shift_unit, created_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
  if (error) fail(error)
  return (data ?? []).map(row => ({
    id: row.id,
    subChannelId: row.sub_channel_id,
    kind: row.kind as CalendarChange['kind'],
    dayNumber: row.day_number,
    shiftAmount: row.shift_amount,
    shiftUnit: SHIFT_UNITS.includes(row.shift_unit as ShiftUnit) ? (row.shift_unit as ShiftUnit) : null,
    createdAt: row.created_at,
  }))
}

export async function setDate(channelId: string, subChannelId: string | null, dayNumber: number): Promise<void> {
  const { error } = await supabase.rpc('ext_set_in_game_date', {
    p_channel_id: channelId,
    p_sub_channel_id: room(subChannelId),
    p_day_number: dayNumber,
  })
  if (error) fail(error)
}

export async function shiftDate(channelId: string, subChannelId: string | null, amount: number, unit: ShiftUnit): Promise<void> {
  const { error } = await supabase.rpc('ext_shift_in_game_date', {
    p_channel_id: channelId,
    p_sub_channel_id: room(subChannelId),
    p_amount: amount,
    p_unit: unit,
  })
  if (error) fail(error)
}

export async function clearRoomDate(channelId: string, subChannelId: string): Promise<void> {
  const { error } = await supabase.rpc('ext_clear_room_date', { p_channel_id: channelId, p_sub_channel_id: subChannelId })
  if (error) fail(error)
}

export async function undoChange(changeId: string): Promise<void> {
  const { error } = await supabase.rpc('ext_undo_in_game_date_change', { p_change_id: changeId })
  if (error) fail(error)
}
