import { useCallback, useEffect, useRef, useState } from 'react'
import { toError } from '../../../lib/errors'
import * as api from './activityApi'
import type { ActivityNote, ActivityPost } from './activityModel'

/** How one subject's (a character's or a record's) posts and notes are loaded. */
export interface ActivityLoaders {
  /** Newest posts first; `before` asks for older ones. */
  posts: (before: string | null) => Promise<ActivityPost[]>
  notes: () => Promise<ActivityNote[]>
}

/**
 * Posts, notes and room names for an Activity tab, loaded with the viewer's
 * own access. `key` changes whenever what to look for changes (subject, name,
 * search terms); the loaders themselves may be new on every render.
 */
export function useActivity(channelId: string, key: string, loaders: ActivityLoaders) {
  const [posts, setPosts] = useState<ActivityPost[]>([])
  const [notes, setNotes] = useState<ActivityNote[]>([])
  const [rooms, setRooms] = useState<Map<string, string>>(new Map())
  const [morePosts, setMorePosts] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [token, setToken] = useState(0)
  const latest = useRef(loaders)
  latest.current = loaders

  useEffect(() => {
    let mounted = true
    setLoading(true)
    void (async () => {
      try {
        const [nextPosts, nextNotes, nextRooms] = await Promise.all([
          latest.current.posts(null),
          latest.current.notes(),
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
        console.error('Failed to load activity:', err)
        setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [channelId, key, token])

  const reload = useCallback(() => setToken(t => t + 1), [])

  const loadOlder = useCallback(async () => {
    const oldest = posts.at(-1)
    if (!oldest) return
    setLoadingOlder(true)
    try {
      const older = await latest.current.posts(oldest.createdAt)
      setPosts(prev => [...prev, ...older.filter(p => !prev.some(q => q.id === p.id))])
      setMorePosts(older.length === api.POSTS_PAGE)
    } catch (err) {
      console.error('Failed to load older posts:', err)
      setError(toError(err))
    } finally {
      setLoadingOlder(false)
    }
  }, [posts])

  return { posts, notes, rooms, morePosts, loading, loadingOlder, error, reload, loadOlder }
}

export type ActivityData = ReturnType<typeof useActivity>
