// Shared, pure logic for our AI server functions (Phase 3, DECISIONS.md #47).
// No imports and no IO, so it runs under vitest as well as in Deno.

/** The model for imports and the connection test (owner-approved in 13-phase3-design.md). */
export const AI_MODEL = 'claude-sonnet-5-5'

/** US dollars per million tokens (Anthropic list prices, 2026-11). */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}

/** Unknown models are priced at the most expensive known rate, so the cap never under-counts. */
const FALLBACK_PRICE = { input: 10, output: 50 }

export interface TokenUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/** Estimated cost of one call in US dollars (cache writes at 1.25x, reads at 0.1x the input rate). */
export function costOf(model: string, usage: TokenUsage): number {
  const price = PRICES[model] ?? FALLBACK_PRICE
  const input =
    (usage.input_tokens ?? 0) +
    1.25 * (usage.cache_creation_input_tokens ?? 0) +
    0.1 * (usage.cache_read_input_tokens ?? 0)
  const cost = (input * price.input + (usage.output_tokens ?? 0) * price.output) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

export type AccessProblem =
  | { status: 403; code: 'not_allowed'; message: string }
  | { status: 503; code: 'no_key'; message: string }
  | { status: 402; code: 'cap_reached'; message: string }

/** Whether a call may go ahead; the first problem wins. */
export function checkAccess(input: {
  isServerAdmin: boolean
  isChannelGm: boolean
  hasKey: boolean
  monthSpentUsd: number
  monthlyCapUsd: number
}): AccessProblem | null {
  if (!input.isServerAdmin || !input.isChannelGm) {
    return { status: 403, code: 'not_allowed', message: 'AI features are only for the server admin, in campaigns they run.' }
  }
  if (!input.hasKey) {
    return { status: 503, code: 'no_key', message: 'No Anthropic API key has been set on the server yet.' }
  }
  if (input.monthSpentUsd >= input.monthlyCapUsd) {
    return { status: 402, code: 'cap_reached', message: 'This month\'s AI spending cap has been reached.' }
  }
  return null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The campaign id from a request body, or null. */
export function readChannelId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const id = (body as { channelId?: unknown }).channelId
  return typeof id === 'string' && UUID_RE.test(id) ? id.toLowerCase() : null
}

/** Origins allowed to call our functions: the ALLOWED_ORIGINS secret, or the local dev app. */
export function corsHeaders(origin: string | null, allowedSetting: string | undefined): Record<string, string> {
  const allowed = (allowedSetting ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
  const list = allowed.length > 0 ? allowed : ['http://localhost:5173']
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && list.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
