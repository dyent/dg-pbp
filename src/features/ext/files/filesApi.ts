// Every Supabase call the campaign files panel makes. Each function throws an
// Error with a readable message on failure. Access rules live in the database
// (row-level security, storage policies and functions); this file only asks.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import {
  FILES_BUCKET,
  isVisibility,
  objectPathFor,
  type CampaignFile,
  type FileDetails,
  type FileEvent,
} from './filesModel'

function fail(err: unknown): never {
  throw toError(err)
}

/** How long an "Open" / "Download" link works (links are made when a file is opened). */
const LINK_SECONDS = 60 * 60

interface VersionRow {
  id: string
  version_no: number
  object_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_at: string
}

interface FileRow {
  id: string
  title: string
  description: string
  folder: string
  visibility: string
  created_at: string
  updated_at: string
  ext_campaign_file_versions: VersionRow[] | null
}

/** Files the caller may see (the database filters by visibility). */
export async function listFiles(channelId: string): Promise<CampaignFile[]> {
  const { data, error } = await supabase
    .from('ext_campaign_files')
    .select(
      'id, title, description, folder, visibility, created_at, updated_at, ' +
        'ext_campaign_file_versions(id, version_no, object_path, file_name, mime_type, size_bytes, uploaded_at)',
    )
    .eq('channel_id', channelId)
  if (error) fail(error)
  return ((data ?? []) as unknown as FileRow[]).map(row => ({
    id: row.id,
    title: row.title,
    description: row.description,
    folder: row.folder,
    visibility: isVisibility(row.visibility) ? row.visibility : 'gm',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versions: (row.ext_campaign_file_versions ?? [])
      .map(v => ({
        id: v.id,
        versionNo: v.version_no,
        objectPath: v.object_path,
        fileName: v.file_name,
        mimeType: v.mime_type,
        sizeBytes: Number(v.size_bytes),
        uploadedAt: v.uploaded_at,
      }))
      .sort((a, b) => b.versionNo - a.versionNo),
  }))
}

/** GM only: who each 'Chosen players' file is shared with (file id → user ids). */
export async function listShares(fileIds: string[]): Promise<Map<string, string[]>> {
  const shares = new Map<string, string[]>()
  if (fileIds.length === 0) return shares
  const { data, error } = await supabase.from('ext_campaign_file_shares').select('file_id, user_id').in('file_id', fileIds)
  if (error) fail(error)
  for (const row of data ?? []) {
    shares.set(row.file_id, [...(shares.get(row.file_id) ?? []), row.user_id])
  }
  return shares
}

/** GM only: one file's history, newest first. */
export async function listEvents(fileId: string): Promise<FileEvent[]> {
  const { data, error } = await supabase
    .from('ext_campaign_file_events')
    .select('id, file_id, actor_id, kind, details, created_at')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
  if (error) fail(error)
  return (data ?? []).map(row => ({
    id: row.id,
    fileId: row.file_id,
    actorId: row.actor_id,
    kind: row.kind as FileEvent['kind'],
    details: (row.details && typeof row.details === 'object' && !Array.isArray(row.details) ? row.details : {}) as Record<
      string,
      unknown
    >,
    createdAt: row.created_at,
  }))
}

/** Upload the bytes to Storage; returns the object path. */
async function uploadObject(channelId: string, file: File): Promise<string> {
  const path = objectPathFor(channelId, file.name, crypto.randomUUID())
  const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) fail(error)
  return path
}

/** Best effort: remove stored objects (e.g. after a failed registration). */
async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    await supabase.storage.from(FILES_BUCKET).remove(paths)
  } catch {
    // An orphaned object is harmless: nobody but the GM can read it.
  }
}

export async function addFile(channelId: string, file: File, details: FileDetails): Promise<string> {
  const path = await uploadObject(channelId, file)
  const { data, error } = await supabase.rpc('ext_add_campaign_file', {
    p_channel_id: channelId,
    p_title: details.title,
    p_description: details.description,
    p_folder: details.folder,
    p_visibility: details.visibility,
    p_player_ids: details.visibility === 'selected' ? details.playerIds : [],
    p_object_path: path,
    p_file_name: file.name,
  })
  if (error) {
    await removeObjects([path])
    fail(error)
  }
  return data as string
}

export async function replaceFile(channelId: string, fileId: string, file: File): Promise<number> {
  const path = await uploadObject(channelId, file)
  const { data, error } = await supabase.rpc('ext_replace_campaign_file', {
    p_file_id: fileId,
    p_object_path: path,
    p_file_name: file.name,
  })
  if (error) {
    await removeObjects([path])
    fail(error)
  }
  return data as number
}

export async function updateFile(fileId: string, details: FileDetails): Promise<void> {
  const { error } = await supabase.rpc('ext_update_campaign_file', {
    p_file_id: fileId,
    p_title: details.title,
    p_description: details.description,
    p_folder: details.folder,
    p_visibility: details.visibility,
    p_player_ids: details.visibility === 'selected' ? details.playerIds : [],
  })
  if (error) fail(error)
}

export async function deleteFile(fileId: string): Promise<void> {
  const { data, error } = await supabase.rpc('ext_delete_campaign_file', { p_file_id: fileId })
  if (error) fail(error)
  await removeObjects((data as string[] | null) ?? [])
}

/** A short-lived link to view (or, with `downloadAs`, download) a stored version. */
export async function fileLink(objectPath: string, downloadAs?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(objectPath, LINK_SECONDS, downloadAs ? { download: downloadAs } : undefined)
  if (error) fail(error)
  if (!data?.signedUrl) throw new Error('Could not open the file.')
  return data.signedUrl
}
