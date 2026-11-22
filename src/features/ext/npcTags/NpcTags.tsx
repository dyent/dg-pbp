import { isValidElement, useContext, useEffect, type ReactNode } from 'react'
import { Avatar } from '../../../components/Avatar'
import { isNpcIconUrl } from '../../chat/npcIcons'
import { OpenCharacterContext } from './characterOpener'
import { OpenRecordContext } from '../records/recordOpener'
import { KIND_ICONS } from '../records/RecordIcon'
import type { RecordKind } from '../records/recordModel'
import { useNpcTags } from './npcTagContext'
import { isNpcTagHref, parseNpcTag, type NpcTagOption } from './npcTagModel'

export { isNpcTagHref }

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

export function NpcFace({ npc, className = 'h-5 w-5' }: { npc: Pick<NpcTagOption, 'name' | 'portraitUrl'>; className?: string }) {
  if (npc.portraitUrl) {
    return (
      <Avatar
        className={`${className} inline-block flex-shrink-0 rounded-full object-cover align-text-bottom ${isNpcIconUrl(npc.portraitUrl) ? 'dark:invert' : ''}`}
        src={npc.portraitUrl}
        alt=""
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span aria-hidden="true" className={`${className} inline-flex flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-[0.65em] font-semibold not-italic text-teal-800 dark:bg-teal-900 dark:text-teal-200`}>
      {(npc.name[0] || '?').toUpperCase()}
    </span>
  )
}

interface TagDisplay {
  name: string
  portraitUrl: string | null
  /** Set when the tag is a campaign record: its icon replaces the portrait. */
  recordKind?: RecordKind
  opens: string | null
  title?: string
  /** A record the viewer can't see: shown as the plain text that was written. */
  plain?: boolean
}

/** What a tag shows: name, portrait or icon, and what it opens (if the viewer may). */
function useTagDisplay(href: string, written: string): TagDisplay {
  const tags = useNpcTags()
  const tag = parseNpcTag(href)
  const need = tags?.need
  const npcId = tag?.kind === 'npc' ? tag.id : null
  useEffect(() => {
    if (npcId && need) need(npcId)
  }, [npcId, need])
  if (tag?.kind === 'record' || tag?.kind === 'recordAlias') {
    // Records the viewer can't see (and every record alias, for players) stay
    // plain text: the name was written in the post anyway.
    const record = tag.kind === 'record' ? tags?.labelOf(tag.id) : tags?.aliasOf(tag.id)
    if (!record?.recordKind) return { name: written, portraitUrl: null, opens: null, plain: true }
    return tag.kind === 'record'
      ? { name: record.name, portraitUrl: null, recordKind: record.recordKind, opens: record.id }
      : { name: written, portraitUrl: null, recordKind: record.recordKind, opens: record.id, title: `Alias of ${record.name}` }
  }
  if (tag?.kind === 'alias') {
    // Shown exactly as written; only the GM knows (and can open) who it is.
    const npc = tags?.aliasOf(tag.id)
    return { name: written, portraitUrl: null, opens: npc?.id ?? null, title: npc ? `Alias of ${npc.name}` : undefined }
  }
  const label = npcId ? tags?.labelOf(npcId) : undefined
  return {
    name: label?.name ?? written,
    portraitUrl: label?.portraitUrl ?? null,
    opens: npcId && tags?.canOpen(npcId) ? npcId : null,
  }
}

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 align-baseline font-sans text-[0.9em] font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-200'

function TagIcon({ display }: { display: TagDisplay }) {
  if (!display.recordKind) return <NpcFace npc={display} className="h-4 w-4" />
  const Icon = KIND_ICONS[display.recordKind]
  return <Icon aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
}

/**
 * An NPC or record tag in a post: a small name chip that opens the NPC's
 * profile (or the record in the Case file) when the viewer can see it.
 */
export function NpcTagChip({ href, children }: { href: string; children?: ReactNode }) {
  const tags = useNpcTags()
  const openCharacterInPanel = useContext(OpenCharacterContext)
  const openRecordInPanel = useContext(OpenRecordContext)
  const npc = useTagDisplay(href, textOf(children).trim() || 'NPC')
  if (npc.plain) return <>{npc.name}</>
  const openInPanel = npc.recordKind ? openRecordInPanel : openCharacterInPanel
  const content = (
    <>
      <TagIcon display={npc} />
      {npc.name}
    </>
  )
  if (!npc.opens || !tags) return <span className={CHIP_CLASS}>{content}</span>
  const id = npc.opens
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault()
        if (openInPanel) openInPanel(id)
        else tags.open(id)
      }}
      title={npc.title ?? `Open ${npc.name}`}
      className={`${CHIP_CLASS} cursor-pointer hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500`}
    >
      {content}
    </button>
  )
}
