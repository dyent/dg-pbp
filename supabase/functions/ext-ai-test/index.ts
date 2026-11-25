// ext-ai-test (Phase 3 step 2, DECISIONS.md #47): a tiny, real call to Claude so
// the server admin can check the API key, the cap and the usage log work.
//
// Called from the browser with the user's JWT (verify_jwt stays at the platform
// default). Who may call it, the cap and this month's spending all come from
// the database through ext_ai_status, run as the caller. The Anthropic key is
// read from the ANTHROPIC_API_KEY secret and never leaves the server.
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { AI_MODEL, checkAccess, corsHeaders, costOf, readChannelId } from '../_ext-ai/logic.ts'

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
    console.error('ext-ai-test: missing Supabase configuration')
    return json({ code: 'server_error', message: 'The server is not set up correctly.' }, 500)
  }

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ code: 'not_signed_in', message: 'Sign in first.' }, 401)
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ code: 'not_signed_in', message: 'Sign in first.' }, 401)

  const channelId = readChannelId(await req.json().catch(() => null))
  if (!channelId) return json({ code: 'bad_request', message: 'Say which campaign this is for.' }, 400)

  const { data: statusRows, error: statusError } = await userClient.rpc('ext_ai_status', { p_channel_id: channelId })
  const status = Array.isArray(statusRows) ? statusRows[0] : null
  if (statusError || !status) {
    console.error('ext-ai-test: status lookup failed', statusError)
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

  const service = createClient(supabaseUrl, serviceKey)
  const log = async (model: string, usage: Parameters<typeof costOf>[1], outcome: 'ok' | 'error' | 'refused') => {
    const cost = costOf(model, usage)
    const { error } = await service.from('ext_ai_usage').insert({
      channel_id: channelId,
      user_id: userData.user.id,
      feature: 'connection_test',
      model,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cost_usd: cost,
      outcome,
    })
    if (error) console.error('ext-ai-test: could not log usage', error)
    return cost
  }

  const client = new Anthropic({ apiKey })
  try {
    // Server-side fallbacks ("default"): if Sonnet 5.5 declines, the API re-runs
    // the request on a suitable fallback model within the same call.
    const message = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: 'You are checking that a connection to the Claude API works. Answer in one short line.',
      messages: [{ role: 'user', content: 'Reply with exactly: Connection OK' }],
    })
    const reply = message.content
      .flatMap(block => (block.type === 'text' ? [block.text] : []))
      .join(' ')
      .trim()
    const refused = message.stop_reason === 'refusal'
    const costUsd = await log(message.model, message.usage, refused ? 'refused' : 'ok')
    if (refused) return json({ code: 'refused', message: 'Claude declined the test request.', costUsd }, 502)
    return json({ reply, model: message.model, costUsd })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ code: 'bad_key', message: 'Anthropic rejected the API key.' }, 502)
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return json({ code: 'bad_key', message: 'The API key may not use this model. Check your Anthropic account.' }, 502)
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json({ code: 'busy', message: 'Anthropic is busy or your account limit was reached. Try again later.' }, 503)
    }
    if (err instanceof Anthropic.APIError) {
      console.error('ext-ai-test: Anthropic error', err.status, err.message)
      await log(AI_MODEL, {}, 'error')
      return json({ code: 'ai_error', message: `Anthropic returned an error (${err.status ?? 'no status'}).` }, 502)
    }
    console.error('ext-ai-test: unexpected error', err)
    return json({ code: 'server_error', message: 'Could not reach Anthropic.' }, 502)
  }
})
