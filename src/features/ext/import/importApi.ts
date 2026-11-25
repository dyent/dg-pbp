// Every Supabase call the import makes (Phase 3 step 3). Runs and suggestions
// are GM only; the AI work happens in the ext-ai-import server function.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'
import { AiCallError, functionError } from '../ai/aiApi'
import { SOURCES_BUCKET } from '../sources/sourcesModel'
import { addFile } from '../files/filesApi'
import { isSuggestionKind, type ImportRun, type ImportSuggestion, type RunStatus } from './importModel'
import { slicePdf } from './pdfSlice'
import { renderPagesAsPng } from './pdfImage'

interface RunRow {
  id: string
  first_page: number
  last_page: number
  status: string
  error: string | null
  cost_usd: number | string
  created_at: string
  combined_count: number | null
  ext_import_suggestions: { count: number }[] | null
}

export async function listRuns(sourceId: string): Promise<ImportRun[]> {
  const { data, error } = await supabase
    .from('ext_import_runs')
    .select('id, first_page, last_page, status, error, cost_usd, created_at, combined_count, ext_import_suggestions(count)')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
  if (error) throw toError(error)
  return ((data ?? []) as unknown as RunRow[]).map(row => ({
    id: row.id,
    firstPage: row.first_page,
    lastPage: row.last_page,
    status: (['running', 'done', 'failed'].includes(row.status) ? row.status : 'failed') as RunStatus,
    error: row.error,
    costUsd: Number(row.cost_usd),
    createdAt: row.created_at,
    suggestionCount: row.ext_import_suggestions?.[0]?.count ?? 0,
    combinedCount: row.combined_count ?? 0,
  }))
}

interface SuggestionDetails {
  summary?: unknown
  fields?: unknown
  possibleDuplicateOf?: unknown
  link?: { from?: unknown; to?: unknown; label?: unknown }
  handout?: { firstPage?: unknown; lastPage?: unknown }
  pages?: unknown
  created?: { type?: unknown; id?: unknown }
  checklist?: unknown
  handoutArea?: { left?: unknown; top?: unknown; width?: unknown; height?: unknown }
  relatedTo?: unknown
  attachedTo?: unknown
}

export async function listSuggestions(runId: string): Promise<ImportSuggestion[]> {
  const { data, error } = await supabase
    .from('ext_import_suggestions')
    .select('id, kind, name, page, details, status')
    .eq('run_id', runId)
    .order('sort_order')
  if (error) throw toError(error)
  return (data ?? []).flatMap(row => {
    if (!isSuggestionKind(row.kind)) return []
    const d = (row.details && typeof row.details === 'object' ? row.details : {}) as SuggestionDetails
    const text = (v: unknown) => (typeof v === 'string' ? v : '')
    const fields = Array.isArray(d.fields)
      ? d.fields.flatMap(f => (f && typeof f === 'object' && typeof (f as { value?: unknown }).value === 'string'
          ? [{ key: text((f as { key?: unknown }).key), label: text((f as { label?: unknown }).label), value: (f as { value: string }).value }]
          : []))
      : []
    const link = d.link && typeof d.link === 'object' && typeof d.link.from === 'string' && typeof d.link.to === 'string'
      ? { from: d.link.from, to: d.link.to, label: text(d.link.label) }
      : null
    const handout = d.handout && typeof d.handout.firstPage === 'number' && typeof d.handout.lastPage === 'number'
      ? { firstPage: d.handout.firstPage, lastPage: d.handout.lastPage }
      : null
    return [{
      id: row.id,
      kind: row.kind,
      name: row.name,
      page: row.page,
      summary: text(d.summary),
      fields,
      possibleDuplicateOf: typeof d.possibleDuplicateOf === 'string' ? d.possibleDuplicateOf : null,
      link,
      handout,
      pages: Array.isArray(d.pages) ? d.pages.filter((p): p is number => typeof p === 'number') : row.page === null ? [] : [row.page],
      checklist: Array.isArray(d.checklist) ? d.checklist.filter((c): c is string => typeof c === 'string') : [],
      handoutArea:
        d.handoutArea && ['left', 'top', 'width', 'height'].every(k => typeof (d.handoutArea as Record<string, unknown>)[k] === 'number')
          ? (d.handoutArea as { left: number; top: number; width: number; height: number })
          : null,
      relatedTo: typeof d.relatedTo === 'string' && d.relatedTo ? d.relatedTo : null,
      attachedTo: typeof d.attachedTo === 'string' && d.attachedTo ? d.attachedTo : null,
      created:
        d.created && typeof d.created.id === 'string' && ['character', 'record', 'link', 'file'].includes(d.created.type as string)
          ? { type: d.created.type as 'character' | 'record' | 'link' | 'file', id: d.created.id }
          : null,
      status: (['pending', 'approved', 'rejected', 'merged'].includes(row.status) ? row.status : 'pending') as ImportSuggestion['status'],
    }]
  })
}

export interface StartImport {
  channelId: string
  sourceId: string
  objectPath: string
  firstPage: number
  lastPage: number
  /** Told which stage is under way ("Cutting out pages…"). */
  onStage?: (stage: string) => void
}

/**
 * Cuts the pages out of the source in the browser, uploads them, and asks the
 * server to read them. Returns the new run's id; the run finishes in the
 * background (poll listRuns).
 */
export async function startImport({ channelId, sourceId, objectPath, firstPage, lastPage, onStage }: StartImport): Promise<string> {
  onStage?.('Opening the PDF…')
  const { data: file, error: downloadError } = await supabase.storage.from(SOURCES_BUCKET).download(objectPath)
  if (downloadError || !file) throw toError(downloadError ?? new Error('Could not open the source.'))

  onStage?.('Cutting out the pages…')
  const slice = await slicePdf(await file.arrayBuffer(), firstPage, lastPage)

  onStage?.('Uploading the pages…')
  const slicePath = `${channelId}/slice-${crypto.randomUUID()}.pdf`
  const { error: uploadError } = await supabase.storage
    .from(SOURCES_BUCKET)
    .upload(slicePath, new Blob([slice as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw toError(uploadError)

  onStage?.('Starting the import…')
  const { data, error } = await supabase.functions.invoke('ext-ai-import', {
    body: { channelId, sourceId, firstPage, lastPage, slicePath },
  })
  if (error) {
    await supabase.storage.from(SOURCES_BUCKET).remove([slicePath]).catch(() => undefined)
    throw await functionError(error)
  }
  const runId = (data as { runId?: unknown } | null)?.runId
  if (typeof runId !== 'string') throw new AiCallError('The import did not start.', 'error')
  return runId
}

export async function deleteRun(runId: string): Promise<void> {
  const { error } = await supabase.rpc('ext_delete_import_run', { p_run_id: runId })
  if (error) throw toError(error)
}

// ---------------------------------------------------------------------------
// Reviewing (Phase 3 steps 4 and 5)
// ---------------------------------------------------------------------------

export interface SuggestionEdit {
  name: string
  fields: { key: string; label: string; value: string }[]
}

/** Adds an NPC, record or link from a suggestion (optionally edited first). */
export async function approveSuggestion(id: string, edit?: SuggestionEdit): Promise<{ type: string; id: string }> {
  const { data, error } = await supabase.rpc('ext_approve_suggestion', {
    p_suggestion_id: id,
    ...(edit ? { p_name: edit.name, p_fields: edit.fields } : {}),
  })
  if (error) throw toError(error)
  const result = (data ?? {}) as { type?: unknown; id?: unknown }
  return { type: String(result.type ?? ''), id: String(result.id ?? '') }
}

/** Adds a suggestion's information to an existing NPC or record; returns how many fields were filled or added. */
export async function mergeSuggestion(id: string, target: { type: 'character' | 'record'; id: string }, edit?: SuggestionEdit): Promise<number> {
  const { data, error } = await supabase.rpc('ext_merge_suggestion', {
    p_suggestion_id: id,
    ...(target.type === 'character' ? { p_character_id: target.id } : { p_record_id: target.id }),
    ...(edit ? { p_fields: edit.fields } : {}),
  })
  if (error) throw toError(error)
  return Number(data ?? 0)
}

export async function setSuggestionRejected(id: string, rejected: boolean): Promise<void> {
  const { error } = await supabase.rpc('ext_set_suggestion_rejected', { p_suggestion_id: id, p_rejected: rejected })
  if (error) throw toError(error)
}

/** What a suggestion can be merged into: the campaign's characters, or its records of one kind. */
export async function listMergeTargets(channelId: string, kind: string): Promise<{ type: 'character' | 'record'; id: string; name: string }[]> {
  if (kind === 'npc') {
    const { data, error } = await supabase.from('ext_characters').select('id, name').eq('channel_id', channelId).order('name')
    if (error) throw toError(error)
    return (data ?? []).map(c => ({ type: 'character' as const, id: c.id, name: c.name }))
  }
  const { data, error } = await supabase.from('ext_records').select('id, name').eq('channel_id', channelId).eq('kind', kind).order('name')
  if (error) throw toError(error)
  return (data ?? []).map(r => ({ type: 'record' as const, id: r.id, name: r.name }))
}

/**
 * Approves a handout: cuts its pages out of the source, adds them as a GM-only
 * campaign file in the "Handouts" folder, then marks the suggestion done.
 * Returns the new file's id.
 */
export async function approveHandout(input: {
  channelId: string
  sourceObjectPath: string
  sourceTitle: string
  suggestion: {
    id: string
    name: string
    summary: string
    handout: { firstPage: number; lastPage: number }
    handoutArea?: { left: number; top: number; width: number; height: number } | null
  }
}): Promise<{ fileId: string; attachedTo: string | null; asPicture: boolean }> {
  const { data: file, error: downloadError } = await supabase.storage.from(SOURCES_BUCKET).download(input.sourceObjectPath)
  if (downloadError || !file) throw toError(downloadError ?? new Error('Could not open the source.'))
  const bytes = await file.arrayBuffer()
  const { firstPage, lastPage } = input.suggestion.handout
  const title = input.suggestion.name.slice(0, 120)
  const baseName = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'handout'
  // A picture of the handout (players see it at once); the pages as a PDF if that fails.
  let upload: File
  let asPicture = true
  try {
    const png = await renderPagesAsPng(bytes, firstPage, lastPage, input.suggestion.handoutArea)
    upload = new File([png], `${baseName}.png`, { type: 'image/png' })
  } catch (err) {
    console.error('Could not make a picture of the handout; adding the pages as a PDF:', err)
    asPicture = false
    const pages = await slicePdf(bytes, firstPage, lastPage)
    upload = new File([pages as Uint8Array<ArrayBuffer>], `${baseName}.pdf`, { type: 'application/pdf' })
  }
  const pageText = firstPage === lastPage ? `p. ${firstPage}` : `pp. ${firstPage}–${lastPage}`
  const fileId = await addFile(input.channelId, upload, {
    title,
    description: [input.suggestion.summary, `From ${input.sourceTitle}, ${pageText}.`].filter(Boolean).join(' ').slice(0, 1000),
    folder: 'Handouts',
    visibility: 'gm',
    playerIds: [],
  })
  const { data, error } = await supabase.rpc('ext_finish_handout_suggestion', { p_suggestion_id: input.suggestion.id, p_file_id: fileId })
  if (error) throw toError(error)
  return { fileId, attachedTo: typeof data === 'string' && data ? data : null, asPicture }
}
