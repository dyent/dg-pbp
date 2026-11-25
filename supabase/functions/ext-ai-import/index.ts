// ext-ai-import (Phase 3 step 3, DECISIONS.md #48): reads up to 10 pages of a
// source with Claude and stores what it finds as suggestions for the GM.
//
// The browser cuts the pages out of the PDF, uploads them to the private
// 'ext-sources' bucket as '<channel>/slice-<uuid>.pdf' and calls this with the
// user's JWT. Access, the cap and the source are checked with the caller's own
// rights; the run then continues in the background (EdgeRuntime.waitUntil) and
// the app polls ext_import_runs until it is done or failed. Nothing is added to
// the campaign here: suggestions wait for the GM's review.
import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL, checkAccess, corsHeaders, costOf, readChannelId, type TokenUsage } from '../_ext-ai/logic.ts'
import {
  MAX_SLICE_BYTES,
  SUGGESTIONS_SCHEMA,
  SYSTEM_PROMPT,
  buildUserText,
  combineDetails,
  findEarlier,
  normaliseSuggestions,
  type EarlierSuggestion,
  pageRangeProblem,
  slicePathIsValid,
  toBase64,
} from '../_ext-ai/importLogic.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const BUCKET = 'ext-sources'
const STALE_MINUTES = 15

interface RunInput {
  runId: string
  channelId: string
  sourceId: string
  userId: string
  sourceTitle: string
  firstPage: number
  lastPage: number
  slicePath: string
  apiKey: string
}

Deno.serve(async req => {
  const cors = corsHeaders(req.headers.get('origin'), Deno.env.get('ALLOWED_ORIGINS'))
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ code: 'bad_request', message: 'Use POST.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('ext-ai-import: missing Supabase configuration')
    return json({ code: 'server_error', message: 'The server is not set up correctly.' }, 500)
  }

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ code: 'not_signed_in', message: 'Sign in first.' }, 401)
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ code: 'not_signed_in', message: 'Sign in first.' }, 401)

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const channelId = readChannelId(body)
  const sourceId = typeof body?.sourceId === 'string' ? body.sourceId : null
  const rangeProblem = pageRangeProblem(body?.firstPage, body?.lastPage)
  if (!channelId || !sourceId) return json({ code: 'bad_request', message: 'Say which source to import from.' }, 400)
  if (rangeProblem) return json({ code: 'bad_request', message: rangeProblem }, 400)
  if (!slicePathIsValid(body?.slicePath, channelId)) return json({ code: 'bad_request', message: 'The pages were not uploaded.' }, 400)
  const firstPage = body!.firstPage as number
  const lastPage = body!.lastPage as number
  const slicePath = body!.slicePath as string

  const { data: statusRows, error: statusError } = await userClient.rpc('ext_ai_status', { p_channel_id: channelId })
  const status = Array.isArray(statusRows) ? statusRows[0] : null
  if (statusError || !status) {
    console.error('ext-ai-import: status lookup failed', statusError)
    return json({ code: 'server_error', message: 'Could not check AI access.' }, 500)
  }
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  const problem = checkAccess({
    isServerAdmin: status.is_server_admin === true,
    isChannelGm: status.allowed === true,
    hasKey: apiKey.length > 0,
    monthSpentUsd: Number(status.month_spent_usd ?? 0),
    monthlyCapUsd: Number(status.monthly_cap_usd ?? 0),
  })
  if (problem) return json({ code: problem.code, message: problem.message }, problem.status)

  // The source must be this campaign's, read with the caller's own rights.
  const { data: source } = await userClient
    .from('ext_sources')
    .select('id, title')
    .eq('id', sourceId)
    .eq('channel_id', channelId)
    .maybeSingle()
  if (!source) return json({ code: 'not_found', message: 'That source was not found.' }, 404)

  const service = createClient(supabaseUrl, serviceKey)
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()
  await service
    .from('ext_import_runs')
    .update({ status: 'failed', error: 'The import stopped without finishing.', finished_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('status', 'running')
    .lt('created_at', staleBefore)
  const { count: running } = await service
    .from('ext_import_runs')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .eq('status', 'running')
  if ((running ?? 0) > 0) return json({ code: 'busy', message: 'Another import is still running. Wait for it to finish.' }, 409)

  const { data: run, error: runError } = await service
    .from('ext_import_runs')
    .insert({ channel_id: channelId, source_id: sourceId, first_page: firstPage, last_page: lastPage, created_by: userData.user.id })
    .select('id')
    .single()
  if (runError || !run) {
    console.error('ext-ai-import: could not start a run', runError)
    return json({ code: 'server_error', message: 'Could not start the import.' }, 500)
  }

  EdgeRuntime.waitUntil(
    processRun(service, {
      runId: run.id,
      channelId,
      sourceId,
      userId: userData.user.id,
      sourceTitle: source.title,
      firstPage,
      lastPage,
      slicePath,
      apiKey,
    }),
  )
  return json({ runId: run.id }, 202)
})

async function finish(service: SupabaseClient, runId: string, patch: Record<string, unknown>) {
  const { error } = await service
    .from('ext_import_runs')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) console.error('ext-ai-import: could not finish the run', error)
}

async function logUsage(service: SupabaseClient, input: RunInput, model: string, usage: TokenUsage, outcome: 'ok' | 'error' | 'refused') {
  const cost = costOf(model, usage)
  const { error } = await service.from('ext_ai_usage').insert({
    channel_id: input.channelId,
    user_id: input.userId,
    feature: 'import',
    model,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cost_usd: cost,
    outcome,
  })
  if (error) console.error('ext-ai-import: could not log usage', error)
  return cost
}

async function processRun(service: SupabaseClient, input: RunInput): Promise<void> {
  try {
    const { data: file, error: downloadError } = await service.storage.from(BUCKET).download(input.slicePath)
    if (downloadError || !file) return finish(service, input.runId, { status: 'failed', error: 'The uploaded pages could not be read.' })
    if (file.size > MAX_SLICE_BYTES) {
      return finish(service, input.runId, { status: 'failed', error: 'Those pages are too large (over 20 MB). Try fewer pages.' })
    }
    const pdf = toBase64(new Uint8Array(await file.arrayBuffer()))

    const [characters, records] = await Promise.all([
      service.from('ext_characters').select('name, kind').eq('channel_id', input.channelId).eq('kind', 'npc').limit(300),
      service.from('ext_records').select('name, kind').eq('channel_id', input.channelId).limit(300),
    ])
    const existing = [
      ...(characters.data ?? []).map(c => ({ name: c.name as string, kind: 'npc' })),
      ...(records.data ?? []).map(r => ({ name: r.name as string, kind: r.kind as string })),
    ]

    // Suggestions still waiting from other runs of this source, so repeats can be combined.
    const { data: earlierRows } = await service
      .from('ext_import_suggestions')
      .select('id, kind, name, details, ext_import_runs!inner(source_id)')
      .eq('ext_import_runs.source_id', input.sourceId)
      .eq('status', 'pending')
      .neq('run_id', input.runId)
      .limit(500)
    const earlier = ((earlierRows ?? []) as unknown as EarlierSuggestion[]).map(e => ({
      ...e,
      details: { summary: '', fields: [], possibleDuplicateOf: null, ...(e.details ?? {}) },
    }))

    const client = new Anthropic({ apiKey: input.apiKey })
    let message
    try {
      // Streaming keeps a long read from hitting HTTP timeouts. Server-side
      // fallbacks ("default") re-run the request on a suitable model if
      // Sonnet 5.5 declines.
      message = await client.beta.messages
        .stream({
          model: AI_MODEL,
          max_tokens: 64000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SUGGESTIONS_SCHEMA } },
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
                { type: 'text', text: buildUserText({ ...input, existing, earlier: earlier.map(e => ({ name: e.name, kind: e.kind })) }) },
              ],
            },
          ],
        })
        .finalMessage()
    } catch (err) {
      let reason = 'Anthropic returned an error.'
      if (err instanceof Anthropic.AuthenticationError) reason = 'Anthropic rejected the API key.'
      else if (err instanceof Anthropic.RateLimitError) reason = 'Anthropic is busy or your account limit was reached. Try again later.'
      else if (err instanceof Anthropic.BadRequestError) reason = 'Anthropic could not read those pages. Try a different range.'
      else if (err instanceof Anthropic.APIError) reason = `Anthropic returned an error (${err.status ?? 'no status'}).`
      console.error('ext-ai-import: Anthropic call failed', err)
      await logUsage(service, input, AI_MODEL, {}, 'error')
      return finish(service, input.runId, { status: 'failed', error: reason, model: AI_MODEL })
    }

    const model = message.model
    if (message.stop_reason === 'refusal') {
      const cost = await logUsage(service, input, model, message.usage, 'refused')
      return finish(service, input.runId, { status: 'failed', error: 'Claude declined to read these pages.', model, cost_usd: cost })
    }
    if (message.stop_reason === 'max_tokens') {
      const cost = await logUsage(service, input, model, message.usage, 'error')
      return finish(service, input.runId, { status: 'failed', error: 'There was too much on these pages. Try fewer pages.', model, cost_usd: cost })
    }

    const text = message.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
    let answer: unknown = null
    try {
      answer = JSON.parse(text)
    } catch {
      const cost = await logUsage(service, input, model, message.usage, 'error')
      return finish(service, input.runId, { status: 'failed', error: 'Claude\'s answer could not be read. Try again.', model, cost_usd: cost })
    }

    const suggestions = normaliseSuggestions(answer, input.firstPage, input.lastPage)
    // Repeats of earlier suggestions are folded into them instead of listed twice.
    const fresh: typeof suggestions = []
    let combined = 0
    for (const s of suggestions) {
      const match = findEarlier(s, earlier)
      if (!match) {
        fresh.push(s)
        continue
      }
      match.details = combineDetails(match.details, s.details, s.page)
      const { error } = await service.from('ext_import_suggestions').update({ details: match.details }).eq('id', match.id).eq('status', 'pending')
      if (error) {
        console.error('ext-ai-import: could not combine a repeat', error)
        fresh.push(s)
      } else combined++
    }
    if (fresh.length > 0) {
      const { error } = await service.from('ext_import_suggestions').insert(
        fresh.map((s, i) => ({
          run_id: input.runId,
          channel_id: input.channelId,
          kind: s.kind,
          name: s.name,
          page: s.page,
          details: s.details,
          sort_order: i,
        })),
      )
      if (error) {
        console.error('ext-ai-import: could not store suggestions', error)
        const cost = await logUsage(service, input, model, message.usage, 'error')
        return finish(service, input.runId, { status: 'failed', error: 'The suggestions could not be saved.', model, cost_usd: cost })
      }
    }
    const cost = await logUsage(service, input, model, message.usage, 'ok')
    return finish(service, input.runId, { status: 'done', model, cost_usd: cost, combined_count: combined })
  } catch (err) {
    console.error('ext-ai-import: unexpected error', err)
    return finish(service, input.runId, { status: 'failed', error: 'Something went wrong on the server.' })
  } finally {
    const { error } = await service.storage.from(BUCKET).remove([input.slicePath])
    if (error) console.error('ext-ai-import: could not remove the uploaded pages', error)
  }
}
