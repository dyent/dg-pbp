import { useCallback, useEffect, useState } from 'react'
import { listTags } from '../characters/characterApi'
import type { Tag } from '../characters/characterModel'
import { listRecordEvents, listRecordFields, listRecords } from './recordApi'
import type { CampaignRecord, RecordEvent, RecordField } from './recordModel'

/** The campaign's records the caller may see, and (GM only) the campaign tag list. */
export function useRecords(channelId: string, isGM: boolean) {
  const [records, setRecords] = useState<CampaignRecord[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [list, tagList] = await Promise.all([listRecords(channelId, isGM), isGM ? listTags(channelId) : Promise.resolve([])])
        if (cancelled) return
        setRecords(list)
        setTags(tagList)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the case file.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [channelId, isGM, version])

  return { records, tags, loading, error, reload }
}

/** One record's fields and (GM only) history. */
export function useRecordProfile(recordId: string, isGM: boolean) {
  const [fields, setFields] = useState<RecordField[]>([])
  const [events, setEvents] = useState<RecordEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [fieldList, eventList] = await Promise.all([
          listRecordFields(recordId),
          isGM ? listRecordEvents(recordId) : Promise.resolve([]),
        ])
        if (cancelled) return
        setFields(fieldList)
        setEvents(eventList)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this record.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recordId, isGM, version])

  return { fields, events, loading, error, reload }
}
