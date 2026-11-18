import { useCallback, useEffect, useState } from 'react'
import { listFiles, listShares } from './filesApi'
import type { CampaignFile } from './filesModel'

/** The campaign's files the caller may see, plus (GM only) who each is shared with. */
export function useCampaignFiles(channelId: string, isGM: boolean) {
  const [files, setFiles] = useState<CampaignFile[]>([])
  const [shares, setShares] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const reload = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listFiles(channelId)
        const shared = isGM ? await listShares(list.filter(f => f.visibility === 'selected').map(f => f.id)) : new Map()
        if (cancelled) return
        setFiles(list)
        setShares(shared)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the files.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [channelId, isGM, version])

  return { files, shares, loading, error, reload }
}
