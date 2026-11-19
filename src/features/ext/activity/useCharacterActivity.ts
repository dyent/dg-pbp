import { useCallback, useEffect, useState } from 'react'
import { toError } from '../../../lib/errors'
import * as api from './activityApi'
import type { ActivityNote, ActivityPost } from './activityModel'

/**
 * Posts and notes about one character, loaded with the viewer's own access.
 * `terms` and `npcName` say what to look for (see searchTerms).
 */
export function useCharacterActivity(channelId: string, characterId: string, npcName: string | null, terms: string[]) {
  const [posts, setPosts] = useState<ActivityPost[]>([])
  const [notes, setNotes] = useState<ActivityNote[]>([])
  const [rooms, setRooms] = useState<Map<string, string>>(new Map())
  const [morePosts, setMorePosts] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [token, setToken] = useState(0)
  const termsKey = terms.join('\u0000')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    void (async () => {
      try {
        const [nextPosts, nextNotes, nextRooms] = await Promise.all([
          api.listPosts(channelId, characterId, npcName, termsKey ? termsKey.split('\u0000') : []),
          api.listNotes(characterId),
          api.listRoomNames(channelId),
        ])
        if (!mounted) return
        setPosts(nextPosts)
        setMorePosts(nextPosts.length === api.POSTS_PAGE)
        setNotes(nextNotes)
        setRooms(nextRooms)
        setError(null)
      } catch (err) {
        if (!mounted) return
        console.error('Failed to load character activity:', err)
        setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [channelId, characterId, npcName, termsKey, token])

  const reload = useCallback(() => setToken(t => t + 1), [])

  const loadOlder = useCallback(async () => {
    const oldest = posts.at(-1)
    if (!oldest) return
    setLoadingOlder(true)
    try {
      const older = await api.listPosts(channelId, characterId, npcName, termsKey ? termsKey.split('\u0000') : [], oldest.createdAt)
      setPosts(prev => [...prev, ...older.filter(p => !prev.some(q => q.id === p.id))])
      setMorePosts(older.length === api.POSTS_PAGE)
    } catch (err) {
      console.error('Failed to load older posts:', err)
      setError(toError(err))
    } finally {
      setLoadingOlder(false)
    }
  }, [posts, channelId, characterId, npcName, termsKey])

  return { posts, notes, rooms, morePosts, loading, loadingOlder, error, reload, loadOlder }
}
