// cspell:words npcalias
// Inline NPC tags (Phase 2a step 5c, DECISIONS.md #36 and #37).
//
// A tag is stored in the post as a Markdown link:
//   `[Dr Hale](npc:<character id>)`         tagged by name: shows the NPC's current name and portrait
//   `[The Stranger](npcalias:<alias tag id>)` tagged by a GM-only alias: shows the alias as written;
//                                             only the GM can tell which character it is
// The composer turns `@Dr Hale` / `@The Stranger` into those links when the post is sent, the
// same way upstream turns `@Player` into a `user:` link.

export const NPC_LINK_PREFIX = 'npc:'
export const NPC_ALIAS_PREFIX = 'npcalias:'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface NpcTagOption {
  id: string
  name: string
  portraitUrl: string | null
  /** GM-only other names (empty for players). */
  aliases?: string[]
}

export type ParsedTag = { kind: 'npc' | 'alias'; id: string }

/** What an `npc:` or `npcalias:` link points to, or null when it is not a valid tag. */
export function parseNpcTag(href: string | null | undefined): ParsedTag | null {
  if (!href) return null
  const kind = href.startsWith(NPC_ALIAS_PREFIX) ? 'alias' : href.startsWith(NPC_LINK_PREFIX) ? 'npc' : null
  if (!kind) return null
  const id = href.slice(kind === 'alias' ? NPC_ALIAS_PREFIX.length : NPC_LINK_PREFIX.length)
  return UUID_RE.test(id) ? { kind, id: id.toLowerCase() } : null
}

export function isNpcTagHref(href: string | null | undefined): boolean {
  return !!href && (href.startsWith(NPC_LINK_PREFIX) || href.startsWith(NPC_ALIAS_PREFIX))
}

/** A name or alias that can follow `@`. */
export interface TagTerm {
  text: string
  npc: NpcTagOption
  alias: boolean
}

/** Name as it can sit inside the link text (square brackets would break the link). */
function linkText(name: string): string {
  return name.replace(/[[\]]/g, '').trim()
}

/** Every taggable name and alias, longest first; a name beats an alias with the same spelling. */
export function tagTerms(npcs: readonly NpcTagOption[]): TagTerm[] {
  const seen = new Set<string>()
  const terms: TagTerm[] = []
  const add = (raw: string, npc: NpcTagOption, alias: boolean) => {
    const text = linkText(raw)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) return
    seen.add(key)
    terms.push({ text, npc, alias })
  }
  for (const npc of npcs) add(npc.name, npc, false)
  for (const npc of npcs) for (const alias of npc.aliases ?? []) add(alias, npc, true)
  return terms.sort((a, b) => b.text.length - a.text.length)
}

function termPattern(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\s)@${escaped}(?=\\s|[.,;:!?)\\]'"]|$)`, 'gi')
}

/** Key for an alias tag id: character + alias, ignoring case. */
export function aliasKey(characterId: string, alias: string): string {
  return `${characterId}|${alias.toLowerCase()}`
}

/** Aliases used as `@Alias` in the text (the composer needs an alias tag id for each). */
export function findAliasUses(text: string, npcs: readonly NpcTagOption[]): { characterId: string; alias: string }[] {
  const found = new Map<string, { characterId: string; alias: string }>()
  let rest = text
  for (const term of tagTerms(npcs)) {
    const re = termPattern(term.text)
    if (!re.test(rest)) continue
    if (term.alias) found.set(aliasKey(term.npc.id, term.text), { characterId: term.npc.id, alias: term.text })
    // Blank out what this term took, so a shorter term can't match inside it.
    rest = rest.replace(termPattern(term.text), m => ' '.repeat(m.length))
  }
  return [...found.values()]
}

/**
 * Replaces `@Name` with `[Name](npc:id)` and `@Alias` with `[Alias](npcalias:tagId)`.
 * Longest first, so "@Dr Hale Junior" is not read as "@Dr Hale". `@` must follow
 * the start of a line or a space; names already linked by upstream
 * (`[@Sam](user:…)`) are left alone. An alias without a tag id stays plain text.
 */
export function linkifyNpcTags(text: string, npcs: readonly NpcTagOption[], aliasTagIds: ReadonlyMap<string, string> = new Map()): string {
  let content = text
  for (const term of tagTerms(npcs)) {
    if (term.alias) {
      const tagId = aliasTagIds.get(aliasKey(term.npc.id, term.text))
      if (!tagId) continue
      content = content.replace(termPattern(term.text), `$1[${term.text}](${NPC_ALIAS_PREFIX}${tagId})`)
    } else {
      content = content.replace(termPattern(term.text), `$1[${term.text}](${NPC_LINK_PREFIX}${term.npc.id})`)
    }
  }
  return content
}

/** Names and aliases starting with what the writer typed after `@`, A–Z. */
export function matchTagTerms(npcs: readonly NpcTagOption[], query: string, exclude: readonly string[] = []): TagTerm[] {
  const q = query.toLowerCase()
  const taken = new Set(exclude.map(n => n.toLowerCase()))
  return tagTerms(npcs)
    .filter(t => t.text.toLowerCase().startsWith(q) && !taken.has(t.text.toLowerCase()))
    .sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }))
}

/** Text the NPC button inserts: `@Name `, with a space first when the cursor follows a word. */
export function tagInsertion(textBeforeCursor: string, name: string): string {
  const space = textBeforeCursor && !/\s$/.test(textBeforeCursor) ? ' ' : ''
  return `${space}@${name} `
}
