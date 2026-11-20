import { isValidElement, useContext, useEffect, type ReactNode } from 'react'
import { Avatar } from '../../../components/Avatar'
import { isNpcIconUrl } from '../../chat/npcIcons'
import { OpenCharacterContext } from './characterOpener'
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

/** What a tag shows: name, portrait, and the character it opens (if the viewer may). */
function useTagDisplay(href: string, written: string): { name: string; portraitUrl: string | null; opens: string | null; title?: string } {
  const tags = useNpcTags()
  const tag = parseNpcTag(href)
  const need = tags?.need
  const npcId = tag?.kind === 'npc' ? tag.id : null
  useEffect(() => {
    if (npcId && need) need(npcId)
  }, [npcId, need])
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

/** An NPC tag in a post: a small name chip that opens the NPC's profile when the viewer can see it. */
export function NpcTagChip({ href, children }: { href: string; children?: ReactNode }) {
  const tags = useNpcTags()
  const openInPanel = useContext(OpenCharacterContext)
  const npc = useTagDisplay(href, textOf(children).trim() || 'NPC')
  const content = (
    <>
      <NpcFace npc={npc} className="h-4 w-4" />
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
