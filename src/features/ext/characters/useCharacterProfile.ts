import { useCallback, useEffect, useState } from 'react'
import { toError } from '../../../lib/errors'
import { listEvents, listFields } from './characterApi'
import type { CharacterEvent, CharacterField } from './characterModel'

/** One character's profile fields and history, as this viewer may see them. */
export function useCharacterProfile(characterId: string | null) {
  const [fields, setFields] = useState<CharacterField[]>([])
  const [events, setEvents] = useState<CharacterEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!characterId) {
      setFields([])
      setEvents([])
      return
    }
    let mounted = true
    setLoading(true)
    void (async () => {
      try {
        const [fieldList, eventList] = await Promise.all([listFields(characterId), listEvents(characterId)])
        if (!mounted) return
        setFields(fieldList)
        setEvents(eventList)
        setError(null)
      } catch (err) {
        if (!mounted) return
        console.error('Failed to load character profile:', err)
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

  return { fields, events, loading, error, reload }
}
