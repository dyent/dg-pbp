// The app's side of the AI plumbing (Phase 3 step 2): status and cap from the
// database, the connection test through our server function. The API key is
// never in the app.
import { supabase } from '../../../lib/supabase'
import { toError } from '../../../lib/errors'

export interface AiStatus {
  /** The caller may use AI in this campaign (server admin and its GM). */
  allowed: boolean
  isServerAdmin: boolean
  monthSpentUsd: number
  monthlyCapUsd: number
}

export interface AiTestResult {
  reply: string
  model: string
  costUsd: number
}

/** An error from our AI server function, with its code (e.g. 'no_key', 'cap_reached'). */
export class AiCallError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'AiCallError'
    this.code = code
  }
}

export async function getAiStatus(channelId: string): Promise<AiStatus> {
  const { data, error } = await supabase.rpc('ext_ai_status', { p_channel_id: channelId })
  if (error) throw toError(error)
  const row = Array.isArray(data) ? data[0] : null
  return {
    allowed: row?.allowed === true,
    isServerAdmin: row?.is_server_admin === true,
    monthSpentUsd: Number(row?.month_spent_usd ?? 0),
    monthlyCapUsd: Number(row?.monthly_cap_usd ?? 0),
  }
}

export async function setAiCap(capUsd: number): Promise<void> {
  const { error } = await supabase.rpc('ext_set_ai_cap', { p_cap_usd: capUsd })
  if (error) throw toError(error)
}

/** Reads `{ code, message }` from a failed function call, whatever shape the error has. */
export async function functionError(error: unknown): Promise<AiCallError> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = (await context.json()) as { code?: unknown; message?: unknown }
      if (typeof body.message === 'string') return new AiCallError(body.message, typeof body.code === 'string' ? body.code : 'error')
    } catch {
      // Not JSON (e.g. the function isn't running): fall through.
    }
    if (context.status === 404) return new AiCallError('The AI server function is not running.', 'not_deployed')
  }
  return new AiCallError('Could not reach the AI server function.', 'unreachable')
}

/** Asks Claude for a one-line reply, through the server; logs and counts the cost. */
export async function testAiConnection(channelId: string): Promise<AiTestResult> {
  const { data, error } = await supabase.functions.invoke('ext-ai-test', { body: { channelId } })
  if (error) throw await functionError(error)
  const body = (data ?? {}) as { reply?: unknown; model?: unknown; costUsd?: unknown }
  return {
    reply: typeof body.reply === 'string' ? body.reply : '',
    model: typeof body.model === 'string' ? body.model : '',
    costUsd: typeof body.costUsd === 'number' ? body.costUsd : 0,
  }
}

/** "$0.0004", "$1.20": more decimals for tiny amounts. */
export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(4)}`
  return `$${amount.toFixed(2)}`
}
