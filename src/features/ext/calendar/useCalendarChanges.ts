import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { subscribeWithRetry } from '../../../lib/realtime'
import { listChanges } from './calendarApi'
import { sortChanges, type CalendarChange } from './calendarModel'

/**
 * Every in-game date change of a campaign the viewer may see, reloaded live
 * whenever the GM changes or undoes one. On failure the list stays empty, so
 * the chat simply shows no in-game dates.
 */
export function useCalendarChanges(channelId: string | undefined) {
  const [changes, setChanges] = useState<CalendarChange[]>([])
  const [reloadToken, setReloadToken] = useState(0)
  // Unique per hook instance (see usePostingIdentities).
  const instanceId = useId()

  const reload = useCallback(() => setReloadToken(t => t + 1), [])

  useEffect(() => {
    if (!channelId) {
      setChanges([])
      return
    }
    let mounted = true
    listChanges(channelId)
      .then(list => mounted && setChanges(sortChanges(list)))
      .catch(err => console.error('Failed to load the in-game calendar:', err))
    return () => {
      mounted = false
    }
  }, [channelId, reloadToken])

  useEffect(() => {
    if (!channelId) return
    const name = `channel:${channelId}:calendar:${instanceId}`
    const realtimeChannel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ext_calendar_changes', filter: `channel_id=eq.${channelId}` },
        reload,
      )
    return subscribeWithRetry(realtimeChannel, name)
  }, [channelId, instanceId, reload])

  return { changes, reload }
}
