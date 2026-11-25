import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { aliasTagId, fetchNpcLabels, listAliasTags, listTaggableNpcs, listTaggableRecords, type AliasTag } from './npcTagApi'
import { aliasKey, findAliasUses, linkifyNpcTags, type NpcTagOption } from './npcTagModel'
import { requestCharacter } from './characterOpener'
import { requestRecord } from '../records/recordOpener'

export interface NpcTagsValue {
  isGM: boolean
  /** NPCs and campaign records the viewer can tag (and open); aliases for the GM only. */
  options: NpcTagOption[]
  /** Current name and portrait for a tag, once loaded. */
  labelOf: (id: string) => NpcTagOption | undefined
  /** The NPC or record behind an alias tag (GM only; undefined for players). */
  aliasOf: (tagId: string) => NpcTagOption | undefined
  /** Asks for a label the viewer doesn't have yet (hidden NPCs). */
  need: (id: string) => void
  /** Whether the viewer can open this NPC or record. */
  canOpen: (id: string) => boolean
  open: (id: string) => void
  /** `@Name` / `@Alias` → tag links (asks the database for alias tag ids). */
  linkify: (content: string) => Promise<string>
  /** The same, straight away, or null when an alias still needs a tag id from the database. */
  linkifyNow: (content: string) => string | null
  /** Reloads names and portraits (after the Characters panel or Case file closes). */
  reload: () => void
}

const NpcTagsContext = createContext<NpcTagsValue | null>(null)

/** The NPC tag data, or null outside a campaign (tags then show as plain names). */
export function useNpcTags(): NpcTagsValue | null {
  return useContext(NpcTagsContext)
}

interface NpcTagProviderProps {
  channelId: string
  isGM: boolean
  myUserId: string | undefined
  children: ReactNode
}

/**
 * Fork hook point (FORK-EXT in ChannelView): loads the NPCs the viewer can tag
 * once per campaign (plus the GM's alias tags), and the labels of any other
 * tagged NPC on demand.
 */
export function NpcTagProvider({ channelId, isGM, myUserId, children }: NpcTagProviderProps) {
  const [options, setOptions] = useState<NpcTagOption[]>([])
  const [aliasTags, setAliasTags] = useState<AliasTag[]>([])
  const [extra, setExtra] = useState<Map<string, NpcTagOption>>(() => new Map())
  const [reloadToken, setReloadToken] = useState(0)
  const asked = useRef(new Set<string>())
  const waiting = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true
    Promise.all([
      listTaggableNpcs(channelId, isGM, myUserId),
      // Records load on their own, so a failure there never hides the NPCs.
      listTaggableRecords(channelId, isGM).catch(err => {
        console.error('Failed to load record tags:', err)
        return []
      }),
      isGM ? listAliasTags(channelId) : Promise.resolve([]),
    ])
      .then(([list, records, aliases]) => {
        if (!mounted) return
        const loaded = [...list, ...records]
        // Keep the same empty array when nothing loaded: no needless re-render
        // (and no late "not wrapped in act" warning in upstream's tests).
        setOptions(prev => (prev.length === 0 && loaded.length === 0 ? prev : loaded))
        setAliasTags(prev => (prev.length === 0 && aliases.length === 0 ? prev : aliases))
      })
      .catch(err => console.error('Failed to load NPC tags:', err))
    return () => {
      mounted = false
    }
  }, [channelId, isGM, myUserId, reloadToken])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const byId = useMemo(() => new Map(options.map(o => [o.id, o])), [options])
  const aliasById = useMemo(() => new Map(aliasTags.map(a => [a.id, a])), [aliasTags])

  const flush = useCallback(() => {
    timer.current = null
    const ids = [...waiting.current]
    waiting.current.clear()
    fetchNpcLabels(channelId, ids)
      .then(rows => {
        if (rows.length === 0) return
        setExtra(prev => {
          const next = new Map(prev)
          for (const row of rows) next.set(row.id, row)
          return next
        })
      })
      .catch(err => console.error('Failed to load NPC tag names:', err))
  }, [channelId])

  const need = useCallback(
    (id: string) => {
      if (byId.has(id) || asked.current.has(id)) return
      asked.current.add(id)
      waiting.current.add(id)
      if (!timer.current) timer.current = setTimeout(flush, 0)
    },
    [byId, flush],
  )

  const linkifyNow = useCallback(
    (content: string): string | null => {
      const ids = new Map(aliasTags.map(a => [aliasKey(a.targetId, a.alias), a.id]))
      const missing = findAliasUses(content, options).some(u => !ids.has(aliasKey(u.target.id, u.alias)))
      return missing ? null : linkifyNpcTags(content, options, ids)
    },
    [aliasTags, options],
  )

  const linkify = useCallback(
    async (content: string) => {
      const ids = new Map(aliasTags.map(a => [aliasKey(a.targetId, a.alias), a.id]))
      const missing = findAliasUses(content, options).filter(u => !ids.has(aliasKey(u.target.id, u.alias)))
      if (missing.length > 0) {
        const created = await Promise.all(
          missing.map(async u => ({ ...u, id: await aliasTagId(u.target, u.alias).catch(() => null) })),
        )
        const added: AliasTag[] = []
        for (const c of created) {
          if (!c.id) continue
          ids.set(aliasKey(c.target.id, c.alias), c.id)
          added.push({ id: c.id, targetId: c.target.id, alias: c.alias })
        }
        if (added.length > 0) setAliasTags(prev => [...prev, ...added])
      }
      return linkifyNpcTags(content, options, ids)
    },
    [aliasTags, options],
  )

  const reload = useCallback(() => {
    asked.current.clear()
    setExtra(new Map())
    setReloadToken(n => n + 1)
  }, [])

  const value = useMemo<NpcTagsValue>(
    () => ({
      isGM,
      options,
      labelOf: id => byId.get(id) ?? extra.get(id),
      aliasOf: tagId => {
        const tag = aliasById.get(tagId)
        return tag ? byId.get(tag.targetId) : undefined
      },
      need,
      canOpen: id => byId.has(id),
      open: id => (byId.get(id)?.recordKind ? requestRecord(id) : requestCharacter(id)),
      linkify,
      linkifyNow,
      reload,
    }),
    [isGM, options, byId, extra, aliasById, need, linkify, linkifyNow, reload],
  )

  return <NpcTagsContext.Provider value={value}>{children}</NpcTagsContext.Provider>
}
