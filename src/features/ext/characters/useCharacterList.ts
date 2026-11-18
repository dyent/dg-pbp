import { useCallback, useEffect, useState } from 'react'
import { toError } from '../../../lib/errors'
import { listCharacters, listTags } from './characterApi'
import type { CharacterSummary, Tag } from './characterModel'

/**
 * The campaign's characters (and, for the GM, its NPC tags). Loaded when the
 * panel opens and reloaded after every change made from the panel.
 */
export function useCharacterList(channelId: string, isGM: boolean, myUserId: string | undefined) {
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const [list, tagList] = await Promise.all([
          listCharacters(channelId, isGM, myUserId),
          isGM ? listTags(channelId) : Promise.resolve([]),
        ])
        if (!mounted) return
        setCharacters(list)
        setTags(tagList)
        setError(null)
      } catch (err) {
        if (!mounted) return
        console.error('Failed to load characters:', err)
        setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [channelId, isGM, myUserId, reloadToken])

  const reload = useCallback(() => setReloadToken(t => t + 1), [])

  return { characters, tags, loading, error, reload }
}
