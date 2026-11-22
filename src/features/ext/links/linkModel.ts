// cspell:words Kowalski
// Links between records and characters (Phase 2b step 3): pure data model.
// "Kowalski — deputy at → Sheriff's office" is one link, shown on both ends.
import { isRecordKind, type RecordKind } from '../records/recordModel'
import type { CharacterKind } from '../characters/characterModel'

export type LinkEndType = 'character' | 'record'
export type LinkVisibility = 'gm' | 'players'

/** One end of a link: a character or a campaign record. */
export interface LinkEnd {
  type: LinkEndType
  id: string
}

/** Something that can be linked, with what the list needs to show it. */
export interface LinkTarget extends LinkEnd {
  name: string
  /** 'pc' / 'npc' for characters, the record kind for records. */
  kind: CharacterKind | RecordKind
  pictureUrl: string | null
}

/** A link as seen from one of its ends (the subject). */
export interface CampaignLink {
  id: string
  label: string
  visibility: LinkVisibility
  /** True when the subject is the "from" end: subject — label → other. */
  outgoing: boolean
  other: LinkTarget
}

export const SUGGESTED_LABELS = ['part of', 'found at', 'works for', 'member of', 'located in', 'knows'] as const

export const LINK_LABEL_MAX = 60

export const LINK_VISIBILITY_LABELS: Record<LinkVisibility, string> = {
  gm: 'GM only',
  players: 'Shown',
}

export function isLinkVisibility(value: unknown): value is LinkVisibility {
  return value === 'gm' || value === 'players'
}

export function isRecordTarget(target: LinkTarget): target is LinkTarget & { kind: RecordKind } {
  return target.type === 'record' && isRecordKind(target.kind)
}

/** A readable problem with a label, or null when it's fine. */
export function validateLinkLabel(label: string): string | null {
  const trimmed = label.trim()
  if (!trimmed) return 'Give the link a label, e.g. "works for".'
  if (trimmed.length > LINK_LABEL_MAX) return `Labels can be at most ${LINK_LABEL_MAX} characters.`
  return null
}

/** The link as a sentence: "Kowalski — deputy at → Sheriff's office". */
export function describeLink(link: CampaignLink, subjectName: string): { from: string; label: string; to: string } {
  return link.outgoing
    ? { from: subjectName, label: link.label, to: link.other.name }
    : { from: link.other.name, label: link.label, to: subjectName }
}

/** Link targets other than the subject, PCs and NPCs first, then records, each by name. */
export function sortTargets(targets: LinkTarget[], subject: LinkEnd): LinkTarget[] {
  const rank = (t: LinkTarget) => (t.type === 'character' ? (t.kind === 'pc' ? 0 : 1) : 2)
  return targets
    .filter(t => !(t.type === subject.type && t.id === subject.id))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** Links in a stable order: by label, then the other end's name. */
export function sortLinks(links: CampaignLink[]): CampaignLink[] {
  return [...links].sort((a, b) => a.label.localeCompare(b.label) || a.other.name.localeCompare(b.other.name))
}
