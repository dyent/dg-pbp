// Files attached to records (DECISIONS.md #50). The GM attaches and removes
// them; ext_record_files_for gives each viewer only files they may open on
// records they may see.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { fileLink, listFiles } from '../files/filesApi'
import { isImage } from '../files/filesModel'

export interface RecordFile {
  fileId: string
  title: string
  description: string
  folder: string
  visibility: 'gm' | 'players' | 'selected'
}

export async function listRecordFiles(recordId: string): Promise<RecordFile[]> {
  const { data, error } = await supabase.rpc('ext_record_files_for', { p_record_id: recordId })
  if (error) throw toError(error)
  return ((data ?? []) as { file_id: string; title: string; description: string; folder: string; visibility: string }[]).map(row => ({
    fileId: row.file_id,
    title: row.title,
    description: row.description,
    folder: row.folder,
    visibility: row.visibility === 'players' || row.visibility === 'selected' ? row.visibility : 'gm',
  }))
}

/** GM: the campaign's files, to choose one to attach. */
export async function listAttachableFiles(channelId: string): Promise<{ id: string; title: string; folder: string }[]> {
  const files = await listFiles(channelId)
  return files
    .map(f => ({ id: f.id, title: f.title, folder: f.folder }))
    .sort((a, b) => (a.folder || '').localeCompare(b.folder || '') || a.title.localeCompare(b.title))
}

export async function attachFile(channelId: string, recordId: string, fileId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('ext_record_files').insert({ channel_id: channelId, record_id: recordId, file_id: fileId, created_by: userId })
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('That file is already attached.')
    throw toError(error)
  }
}

export async function detachFile(recordId: string, fileId: string): Promise<void> {
  const { error } = await supabase.from('ext_record_files').delete().eq('record_id', recordId).eq('file_id', fileId)
  if (error) throw toError(error)
}

/** A link to the file's current version, and whether it is a picture. */
export async function recordFileLink(fileId: string): Promise<{ url: string; isImage: boolean }> {
  const { data, error } = await supabase
    .from('ext_campaign_file_versions')
    .select('object_path, mime_type')
    .eq('file_id', fileId)
    .order('version_no', { ascending: false })
    .limit(1)
  if (error) throw toError(error)
  const row = data?.[0]
  if (!row) throw new Error('That file has no content.')
  return { url: await fileLink(row.object_path), isImage: isImage(row.mime_type) }
}
