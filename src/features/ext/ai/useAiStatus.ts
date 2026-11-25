import { useCallback, useEffect, useState } from 'react'
import { getAiStatus, type AiStatus } from './aiApi'

/** The caller's AI status in a campaign (allowed, spending, cap), with reload. */
export function useAiStatus(channelId: string) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [error, setError] = useState(false)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let mounted = true
    getAiStatus(channelId)
      .then(s => {
        if (!mounted) return
        setStatus(s)
        setError(false)
      })
      .catch(err => {
        console.error('Failed to load AI status:', err)
        if (mounted) setError(true)
      })
    return () => {
      mounted = false
    }
  }, [channelId, token])

  const reload = useCallback(() => setToken(t => t + 1), [])
  return { status, error, reload }
}

export type AiStatusState = ReturnType<typeof useAiStatus>
