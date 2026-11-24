// History entries for links (written by the database on both ends of a link).
// Kept free of imports so character and record models can both use it.

const LINK_EVENT_TYPES = ['link_added', 'link_removed', 'link_changed', 'link_reversed'] as const

export type LinkEventType = (typeof LINK_EVENT_TYPES)[number]

export function isLinkEventType(value: string): value is LinkEventType {
  return (LINK_EVENT_TYPES as readonly string[]).includes(value)
}

function name(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback
}

/** "Dr Hale — works for → The Fellowship"; a deleted end reads "(deleted)". */
function sentence(d: Record<string, unknown>, label: unknown = d.label): string {
  return `${name(d.from, '(deleted)')} — ${name(label, '…')} → ${name(d.to, '(deleted)')}`
}

/** One-line description of a link history entry. */
export function describeLinkEvent(eventType: LinkEventType, details: Record<string, unknown> | null | undefined): string {
  const d = details ?? {}
  switch (eventType) {
    case 'link_added':
      return `Link added: ${sentence(d)}${d.visibility === 'players' ? ' (shown)' : ''}.`
    case 'link_removed':
      return `Link removed: ${sentence(d)}.`
    case 'link_reversed':
      return `Link reversed: now ${sentence(d)}.`
    case 'link_changed': {
      const parts: string[] = []
      if (typeof d.old_label === 'string' && d.old_label !== d.label) parts.push(`relabelled from "${d.old_label}"`)
      if (d.old_visibility !== d.visibility) parts.push(d.visibility === 'players' ? 'shown to players' : 'hidden from players')
      return `Link ${parts.length ? parts.join(', ') : 'changed'}: ${sentence(d)}.`
    }
  }
}
