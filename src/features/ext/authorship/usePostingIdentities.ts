import { useEffect, useId, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { subscribeWithRetry } from '../../../lib/realtime'
import { toError } from '../../../lib/errors'
import { toPostingIdentities, type PostingIdentity } from './resolvePostAuthor'

/**
 * Loads every posting period of a campaign (with character names and portraits)
 * and reloads it live whenever someone switches character. On failure the list
 * stays empty, so posts simply keep their upstream names.
 */
export function usePostingIdentities(channelId: string | undefined) {
  const [identities, setIdentities] = useState<PostingIdentity[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  // Unique per hook instance: the Supabase client returns the existing channel
  // for a repeated name, and adding listeners to an already-subscribed channel
  // throws. Two campaign views can briefly coexist (route changes, tests).
  const instanceId = useId()

  useEffect(() => {
    if (!channelId) {
      setIdentities([])
      return
    }
    let mounted = true
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('ext_posting_identities', {
        p_channel_id: channelId,
      })
      if (!mounted) return
      if (rpcError) {
        console.error('Failed to load character posting identities:', rpcError)
        setError(toError(rpcError))
        return
      }
      setError(null)
      setIdentities(toPostingIdentities(data ?? []))
    })()
    return () => {
      mounted = false
    }
  }, [channelId, reloadToken])

  useEffect(() => {
    if (!channelId) return
    const name = `channel:${channelId}:posting:${instanceId}`
    const realtimeChannel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ext_posting_periods', filter: `channel_id=eq.${channelId}` },
        () => setReloadToken(token => token + 1),
      )
    return subscribeWithRetry(realtimeChannel, name)
  }, [channelId, instanceId])

  return { identities, error }
}
