import type { ComponentProps } from 'react'
import { Markdown } from '../../../components/Markdown'
import { SignedImg } from '../../../components/SignedImg'
import { NpcTagChip } from '../npcTags/NpcTags'
import { isNpcTagHref } from '../npcTags/npcTagModel'

type LinkProps = ComponentProps<'a'> & { node?: unknown }
type ImgProps = ComponentProps<'img'> & { node?: unknown }

// Chat-only link kinds keep their words (they only work inside the chat).
const CHAT_ONLY = ['user:', 'dice:', 'check:']
const IMAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//

function urlTransform(url: string): string {
  if (isNpcTagHref(url) || CHAT_ONLY.some(p => url.startsWith(p))) return url
  if (IMAGE_PATH.test(url) || url.startsWith('/') || url.startsWith('#')) return url
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol) ? url : ''
  } catch {
    return ''
  }
}

const components = {
  a: ({ node: _node, href, children }: LinkProps) => {
    if (href && isNpcTagHref(href)) return <NpcTagChip href={href}>{children}</NpcTagChip>
    if (!href || CHAT_ONLY.some(p => href.startsWith(p))) return <span className="font-medium">{children}</span>
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
  img: ({ node: _node, src, alt }: ImgProps) => (
    <SignedImg src={src} alt={alt || 'Image'} className="my-1 max-h-40 rounded object-contain" loading="lazy" referrerPolicy="no-referrer" />
  ),
}

/** A chat post in the Activity tab, with its formatting (bold, lists, tags, spoilers, images). */
export function PostBody({ content, collapsed }: { content: string; collapsed: boolean }) {
  return (
    <div
      className={`prose prose-sm max-w-none break-words text-surface-900 dark:prose-invert dark:text-surface-100 prose-p:my-1 ${collapsed ? 'max-h-28 overflow-hidden' : ''}`}
      data-testid="activity-post-body"
    >
      <Markdown breaks spoilers components={components} urlTransform={urlTransform}>
        {content}
      </Markdown>
    </div>
  )
}

/** Whether a post is long enough to start collapsed. */
export function isLongPost(content: string): boolean {
  return content.length > 400 || content.split('\n').length > 6
}

/** A note in the Activity tab: same formatting and tag chips as posts, never collapsed. */
export function NoteBody({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm max-w-none break-words text-surface-900 dark:prose-invert dark:text-surface-100 prose-p:my-1"
      data-testid="activity-note-body"
    >
      <Markdown breaks spoilers components={components} urlTransform={urlTransform}>
        {content}
      </Markdown>
    </div>
  )
}
