// Every Supabase call the source library makes. Access rules live in the
// database: the table and the storage bucket are GM only.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { SOURCES_BUCKET, sourcePathFor, type CampaignSource } from './sourcesModel'

function fail(err: unknown): never {
  throw toError(err)
}

/** How long an "Open" link works. */
const LINK_SECONDS = 60 * 60

export async function listSources(channelId: string): Promise<CampaignSource[]> {
  const { data, error } = await supabase
    .from('ext_sources')
    .select('id, title, object_path, file_name, size_bytes, created_at')
    .eq('channel_id', channelId)
  if (error) fail(error)
  return (data ?? []).map(row => ({
    id: row.id,
    title: row.title,
    objectPath: row.object_path,
    fileName: row.file_name,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
  }))
}

/** Uploads the PDF, then registers it; a failed registration removes the upload again. */
export async function addSource(channelId: string, title: string, file: File): Promise<void> {
  const path = sourcePathFor(channelId, crypto.randomUUID())
  const { error: uploadError } = await supabase.storage
    .from(SOURCES_BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (uploadError) fail(uploadError)
  const { error } = await supabase.rpc('ext_add_source', {
    p_channel_id: channelId,
    p_title: title.trim(),
    p_object_path: path,
    p_file_name: file.name,
  })
  if (error) {
    await supabase.storage.from(SOURCES_BUCKET).remove([path]).catch(() => undefined)
    fail(error)
  }
}

export async function renameSource(sourceId: string, title: string): Promise<void> {
  const { error } = await supabase.rpc('ext_rename_source', { p_source_id: sourceId, p_title: title.trim() })
  if (error) fail(error)
}

/** Removes the source, then its stored PDF (best effort: only the GM could still read it). */
export async function deleteSource(sourceId: string): Promise<void> {
  const { data: path, error } = await supabase.rpc('ext_delete_source', { p_source_id: sourceId })
  if (error) fail(error)
  if (typeof path === 'string' && path) {
    await supabase.storage.from(SOURCES_BUCKET).remove([path]).catch(() => undefined)
  }
}

/** A link that opens the PDF in the browser's viewer, at a page when given. */
export async function sourceLink(objectPath: string, page: number | null = null): Promise<string> {
  const { data, error } = await supabase.storage.from(SOURCES_BUCKET).createSignedUrl(objectPath, LINK_SECONDS)
  if (error || !data?.signedUrl) fail(error ?? new Error('Could not open the source.'))
  return page ? `${data.signedUrl}#page=${page}` : data.signedUrl
}
