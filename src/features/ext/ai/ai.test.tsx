import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import { supabase } from '../../../lib/supabase'
import { AiCallError, formatUsd, getAiStatus, setAiCap, testAiConnection } from './aiApi'
import { AiStatusCard } from './AiStatusCard'
import { useAiStatus } from './useAiStatus'

vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } },
}))

const statusRow = { allowed: true, is_server_admin: true, month_spent_usd: 0.1004, monthly_cap_usd: 5 }
const httpError = (status: number, body: unknown) => ({ context: new Response(JSON.stringify(body), { status }) })

describe('aiApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the status, and treats an empty answer as not allowed', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [statusRow], error: null } as never)
    expect(await getAiStatus('ch')).toEqual({ allowed: true, isServerAdmin: true, monthSpentUsd: 0.1004, monthlyCapUsd: 5 })
    expect(supabase.rpc).toHaveBeenCalledWith('ext_ai_status', { p_channel_id: 'ch' })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never)
    expect((await getAiStatus('ch')).allowed).toBe(false)
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'down' } } as never)
    await expect(getAiStatus('ch')).rejects.toThrow('down')
  })

  it('saves the cap', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never)
    await setAiCap(7.5)
    expect(supabase.rpc).toHaveBeenCalledWith('ext_set_ai_cap', { p_cap_usd: 7.5 })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Only the server admin can change the AI spending cap' } } as never)
    await expect(setAiCap(1)).rejects.toThrow('Only the server admin')
  })

  it('returns the test reply, and turns server answers into coded errors', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: { reply: 'Connection OK', model: 'claude-sonnet-5-5', costUsd: 0.0002 }, error: null } as never)
    expect(await testAiConnection('ch')).toEqual({ reply: 'Connection OK', model: 'claude-sonnet-5-5', costUsd: 0.0002 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ext-ai-test', { body: { channelId: 'ch' } })

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: {}, error: null } as never)
    expect(await testAiConnection('ch')).toEqual({ reply: '', model: '', costUsd: 0 })

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: httpError(503, { code: 'no_key', message: 'No key.' }) } as never)
    await expect(testAiConnection('ch')).rejects.toMatchObject({ code: 'no_key', message: 'No key.' })

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: { context: new Response('Function not found', { status: 404 }) } } as never)
    await expect(testAiConnection('ch')).rejects.toMatchObject({ code: 'not_deployed' })

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') } as never)
    const err = await testAiConnection('ch').catch(e => e)
    expect(err).toBeInstanceOf(AiCallError)
    expect(err.code).toBe('unreachable')
  })

  it('formats dollars', () => {
    expect(formatUsd(0.0004)).toBe('$0.0004')
    expect(formatUsd(1.2)).toBe('$1.20')
    expect(formatUsd(0)).toBe('$0.00')
  })
})

function Card() {
  return <AiStatusCard channelId="ch" ai={useAiStatus('ch')} />
}

describe('AiStatusCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [statusRow], error: null } as never)
  })

  const renderCard = () =>
    render(
      <ToastProvider>
        <Card />
      </ToastProvider>,
    )

  it('shows spending and runs the connection test', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { reply: 'Connection OK', model: 'claude-sonnet-5-5', costUsd: 0.0002 }, error: null } as never)
    renderCard()
    expect(await screen.findByText(/\$0\.10 of \$5\.00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Test the connection' }))
    expect(await screen.findByText(/Connected\. Claude replied “Connection OK” \(claude-sonnet-5-5, \$0\.0002\)/)).toBeInTheDocument()
    // The status reloads after a test, so the new cost shows.
    expect(vi.mocked(supabase.rpc).mock.calls.filter(c => c[0] === 'ext_ai_status').length).toBeGreaterThan(1)
  })

  it('explains a missing key with what to do next', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: httpError(503, { code: 'no_key', message: 'No Anthropic API key has been set on the server yet.' }) } as never)
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Test the connection' }))
    expect(await screen.findByText(/No Anthropic API key has been set on the server yet\. Add your Anthropic API key as a server secret/)).toBeInTheDocument()
  })

  it('marks a reached cap, and lets the server admin change it', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) =>
      Promise.resolve(fn === 'ext_ai_status' ? { data: [{ ...statusRow, month_spent_usd: 5 }], error: null } : { data: null, error: null })) as never)
    renderCard()
    expect(await screen.findByText('(cap reached)')).toBeInTheDocument()
    const input = screen.getByLabelText('Monthly cap (US$)')
    expect(screen.getByRole('button', { name: 'Save cap' })).toBeDisabled()
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(screen.getByText('Enter an amount from 0 to 1000.')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save cap' }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('ext_set_ai_cap', { p_cap_usd: 10 }))
    expect(await screen.findByText('AI spending cap saved.')).toBeInTheDocument()
  })

  it('reports a failed cap save', async () => {
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) =>
      Promise.resolve(fn === 'ext_ai_status' ? { data: [statusRow], error: null } : { data: null, error: { message: 'Only the server admin can change the AI spending cap' } })) as never)
    renderCard()
    fireEvent.change(await screen.findByLabelText('Monthly cap (US$)'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save cap' }))
    expect(await screen.findByText('Only the server admin can change the AI spending cap')).toBeInTheDocument()
  })

  it('tells other GMs AI is not for them, and offers a retry on errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'down' } } as never)
    renderCard()
    expect(await screen.findByText("Couldn't load the AI status.")).toBeInTheDocument()
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [{ allowed: false, is_server_admin: false, month_spent_usd: null, monthly_cap_usd: null }], error: null } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('AI import is available only to the server admin, in campaigns they run.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Test the connection' })).not.toBeInTheDocument()
  })
})
