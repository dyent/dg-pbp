// Turns a campaign file into a picture for the chat (DECISIONS.md #51).
// Pictures are used as they are; a PDF's first page is drawn as a picture.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { updateFile } from '../files/filesApi'
import { FILES_BUCKET, isImage } from '../files/filesModel'
import { renderPagesAsPng } from '../import/pdfImage'

/** Files that can go into the chat: pictures and PDFs. */
export function canPostToChat(mimeType: string): boolean {
  return isImage(mimeType) || mimeType === 'application/pdf'
}

/** The picture to post: the file's current version, or page 1 of a PDF. */
export async function pictureForChat(fileId: string): Promise<File> {
  const { data, error } = await supabase
    .from('ext_campaign_file_versions')
    .select('object_path, mime_type, file_name')
    .eq('file_id', fileId)
    .order('version_no', { ascending: false })
    .limit(1)
  if (error) throw toError(error)
  const row = data?.[0]
  if (!row) throw new Error('That file has no content.')
  if (!canPostToChat(row.mime_type)) throw new Error('Only pictures and PDFs can be posted in the chat.')

  const { data: blob, error: downloadError } = await supabase.storage.from(FILES_BUCKET).download(row.object_path)
  if (downloadError || !blob) throw toError(downloadError ?? new Error('Could not read the file.'))

  const base = row.file_name.replace(/\.[^.]+$/, '') || 'handout'
  if (isImage(row.mime_type)) return new File([blob], row.file_name, { type: row.mime_type })
  const png = await renderPagesAsPng(await blob.arrayBuffer(), 1, 1)
  return new File([png], `${base}.png`, { type: 'image/png' })
}

/** Shares a file with all players in Files, keeping its other details. */
export async function shareWithAllPlayers(fileId: string, details: { title: string; description: string; folder: string }): Promise<void> {
  await updateFile(fileId, { ...details, visibility: 'players', playerIds: [] })
}
