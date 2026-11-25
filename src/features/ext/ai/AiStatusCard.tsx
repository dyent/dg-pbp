import { useCallback, useEffect, useId, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '../characters/ui'
import { AiCallError, formatUsd, getAiStatus, setAiCap, testAiConnection, type AiStatus, type AiTestResult } from './aiApi'

/** What to tell the GM for each server answer. */
const HINTS: Record<string, string> = {
  no_key: 'Add your Anthropic API key as a server secret (see 14-ai-setup.md), then restart the server.',
  bad_key: 'Check the key in your Anthropic account and the server secret.',
  cap_reached: 'Raise the monthly cap below, or wait until next month.',
  not_deployed: 'Start the local stack again (npm run supabase:up), or deploy the function.',
}

/**
 * AI status for the GM (Phase 3 step 2): this month's spending against the cap,
 * the cap itself (server admin) and a "test the connection" button.
 */
export function AiStatusCard({ channelId }: { channelId: string }) {
  const { addToast } = useToast()
  const ids = useId()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [token, setToken] = useState(0)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<AiTestResult | null>(null)
  const [problem, setProblem] = useState<AiCallError | null>(null)
  const [cap, setCap] = useState('')
  const [savingCap, setSavingCap] = useState(false)

  useEffect(() => {
    let mounted = true
    getAiStatus(channelId)
      .then(s => {
        if (!mounted) return
        setStatus(s)
        setCap(s.monthlyCapUsd.toFixed(2))
        setLoadError(false)
      })
      .catch(err => {
        console.error('Failed to load AI status:', err)
        if (mounted) setLoadError(true)
      })
    return () => {
      mounted = false
    }
  }, [channelId, token])

  const reload = useCallback(() => setToken(t => t + 1), [])

  const runTest = async () => {
    setTesting(true)
    setResult(null)
    setProblem(null)
    try {
      setResult(await testAiConnection(channelId))
    } catch (err) {
      setProblem(err instanceof AiCallError ? err : new AiCallError('Could not reach the AI server function.', 'unreachable'))
    } finally {
      setTesting(false)
      reload()
    }
  }

  const capValue = Number(cap)
  const badCap = cap.trim() === '' || !Number.isFinite(capValue) || capValue < 0 || capValue > 1000

  const saveCap = async () => {
    if (badCap) return
    setSavingCap(true)
    try {
      await setAiCap(capValue)
      addToast('AI spending cap saved.', 'success')
      reload()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not save the cap.', 'error')
    } finally {
      setSavingCap(false)
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
        <span>Couldn't load the AI status.</span>
        <button type="button" onClick={reload} className={BTN_SECONDARY}>
          Retry
        </button>
      </div>
    )
  }
  if (!status) return <div className="h-16 animate-pulse rounded bg-surface-200 dark:bg-surface-700" aria-label="Loading AI status" />

  if (!status.allowed) {
    return (
      <section aria-label="AI" className="rounded-md border border-surface-200 p-3 text-sm text-surface-600 dark:border-surface-700 dark:text-surface-300">
        AI import is available only to the server admin, in campaigns they run.
      </section>
    )
  }

  const over = status.monthSpentUsd >= status.monthlyCapUsd
  return (
    <section aria-label="AI" className="space-y-2 rounded-md border border-surface-200 p-3 dark:border-surface-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-surface-700 dark:text-surface-200">
          <span className="font-medium">AI this month:</span> {formatUsd(status.monthSpentUsd)} of {formatUsd(status.monthlyCapUsd)}
          {over && <span className="ml-1 font-medium text-red-600 dark:text-red-400">(cap reached)</span>}
        </p>
        <button type="button" className={BTN_SECONDARY} onClick={() => void runTest()} disabled={testing}>
          {testing ? 'Testing…' : 'Test the connection'}
        </button>
      </div>
      <div aria-live="polite">
        {result && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Connected. Claude replied “{result.reply || '(nothing)'}” ({result.model}, {formatUsd(result.costUsd)}).
          </p>
        )}
        {problem && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {problem.message} {HINTS[problem.code] ?? ''}
          </p>
        )}
      </div>
      {status.isServerAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`${ids}-cap`} className={`${LABEL} text-xs`}>
              Monthly cap (US$)
            </label>
            <input
              id={`${ids}-cap`}
              inputMode="decimal"
              className={`${INPUT} w-28 py-1`}
              value={cap}
              aria-invalid={badCap}
              onChange={e => setCap(e.target.value)}
            />
          </div>
          <button type="button" className={BTN_PRIMARY} onClick={() => void saveCap()} disabled={savingCap || badCap || capValue === status.monthlyCapUsd}>
            Save cap
          </button>
          {badCap && <p className="w-full text-xs text-red-600 dark:text-red-400">Enter an amount from 0 to 1000.</p>}
        </div>
      )}
    </section>
  )
}
