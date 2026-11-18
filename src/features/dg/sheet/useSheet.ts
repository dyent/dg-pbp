import { useCallback, useEffect, useMemo, useState } from 'react'
import { toError } from '../../../lib/errors'
import { createSheet, deleteSheet, getSheet, saveSheet, setPool, type PoolKey, type SheetRow } from './sheetApi'
import type { SheetData } from './sheetModel'

/** The stored sheet data with one pool's current value replaced. */
export function withPool(data: unknown, pool: PoolKey, value: number | null): unknown {
  const obj = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  const old = obj[pool] && typeof obj[pool] === 'object' ? (obj[pool] as Record<string, unknown>) : {}
  return { ...obj, [pool]: { ...old, current: value } }
}

/** One character's sheet (or null when it has none yet), plus its writes. */
export function useSheet(characterId: string, channelId: string) {
  const [row, setRow] = useState<SheetRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const next = await getSheet(characterId)
        if (!mounted) return
        setRow(next)
        setError(null)
      } catch (err) {
        if (!mounted) return
        console.error('Failed to load character sheet:', err)
        setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [characterId, reloadToken])

  const reload = useCallback(() => setReloadToken(t => t + 1), [])

  const actions = useMemo(
    () => ({
      create: (sheet: SheetData) => createSheet(characterId, channelId, sheet),
      save: (sheet: SheetData) => saveSheet(characterId, sheet),
      remove: () => deleteSheet(characterId),
      /** Quick change of current HP/WP/SAN: shown straight away, then saved. */
      setPool: async (pool: PoolKey, value: number | null) => {
        setRow(r => (r ? { ...r, data: withPool(r.data, pool, value) } : r))
        await setPool(characterId, pool, value)
      },
    }),
    [characterId, channelId],
  )

  return { row, loading, error, reload, ...actions }
}
