// Every Supabase call for links. Access rules live in the database: the table
// is GM-only, and ext_links_for gives players only shown links whose two ends
// they can see.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { isRecordKind } from '../records/recordModel'
import {
  isLinkVisibility,
  type CampaignLink,
  type LinkEnd,
  type LinkTarget,
  type LinkVisibility,
} from './linkModel'

function fail(err: unknown): never {
  if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
    throw new Error('These two are already linked with that label.')
  }
  throw toError(err)
}

interface LinkRow {
  id: string
  label: string
  visibility: string
  outgoing: boolean
  other_type: string
  other_id: string
  other_name: string
  other_kind: string
  other_picture_url: string | null
}

/** The links of one character or record that the caller may see. */
export async function listLinks(subject: LinkEnd): Promise<CampaignLink[]> {
  const args = subject.type === 'character' ? { p_character_id: subject.id } : { p_record_id: subject.id }
  const { data, error } = await supabase.rpc('ext_links_for', args)
  if (error) fail(error)
  return ((data ?? []) as LinkRow[]).map(row => ({
    id: row.id,
    label: row.label,
    visibility: isLinkVisibility(row.visibility) ? row.visibility : 'gm',
    outgoing: row.outgoing,
    other: {
      type: row.other_type === 'character' ? 'character' : 'record',
      id: row.other_id,
      name: row.other_name,
      kind: (row.other_kind === 'pc' || row.other_kind === 'npc' || isRecordKind(row.other_kind) ? row.other_kind : 'npc') as LinkTarget['kind'],
      pictureUrl: row.other_picture_url,
    },
  }))
}

/** Everything the GM can link to in a campaign: characters and records. */
export async function listLinkTargets(channelId: string): Promise<LinkTarget[]> {
  const [characters, records] = await Promise.all([
    supabase.from('ext_characters').select('id, name, kind, portrait_url').eq('channel_id', channelId),
    supabase.from('ext_records').select('id, name, kind, picture_url').eq('channel_id', channelId),
  ])
  if (characters.error) fail(characters.error)
  if (records.error) fail(records.error)
  return [
    ...(characters.data ?? []).map(c => ({
      type: 'character' as const,
      id: c.id,
      name: c.name,
      kind: c.kind === 'pc' ? ('pc' as const) : ('npc' as const),
      pictureUrl: c.portrait_url,
    })),
    ...(records.data ?? [])
      .filter(r => isRecordKind(r.kind))
      .map(r => ({ type: 'record' as const, id: r.id, name: r.name, kind: r.kind as LinkTarget['kind'], pictureUrl: r.picture_url })),
  ]
}

const characterId = (end: LinkEnd) => (end.type === 'character' ? end.id : null)
const recordId = (end: LinkEnd) => (end.type === 'record' ? end.id : null)

export interface NewLink {
  channelId: string
  from: LinkEnd
  to: LinkEnd
  label: string
  visibility: LinkVisibility
  userId: string
}

export async function addLink({ channelId, from, to, label, visibility, userId }: NewLink): Promise<void> {
  const { error } = await supabase.from('ext_links').insert({
    channel_id: channelId,
    from_character_id: characterId(from),
    from_record_id: recordId(from),
    to_character_id: characterId(to),
    to_record_id: recordId(to),
    label: label.trim(),
    visibility,
    created_by: userId,
  })
  if (error) fail(error)
}

export async function updateLink(linkId: string, patch: { label?: string; visibility?: LinkVisibility }): Promise<void> {
  const { error } = await supabase
    .from('ext_links')
    .update(patch.label === undefined ? patch : { ...patch, label: patch.label.trim() })
    .eq('id', linkId)
  if (error) fail(error)
}

export async function deleteLink(linkId: string): Promise<void> {
  const { error } = await supabase.from('ext_links').delete().eq('id', linkId)
  if (error) fail(error)
}

/** Swaps the two ends of a link, keeping its label and visibility. */
export async function reverseLink(linkId: string): Promise<void> {
  const { error } = await supabase.rpc('ext_reverse_link', { p_link_id: linkId })
  if (error) fail(error)
}
