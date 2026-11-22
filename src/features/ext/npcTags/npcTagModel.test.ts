// cspell:words Kowalski Kowalskis npcalias recalias
import { describe, expect, it, vi } from 'vitest'
import {
  aliasKey,
  findAliasUses,
  isNpcTagHref,
  linkifyNpcTags,
  matchTagTerms,
  parseNpcTag,
  tagInsertion,
  type NpcTagOption,
} from './npcTagModel'
import { onCharacterRequest, requestCharacter } from './characterOpener'

const HALE = '00000000-0000-0000-0000-00000000a001'
const HALE_JR = '00000000-0000-0000-0000-00000000a002'
const KOW = '00000000-0000-0000-0000-00000000a003'
const TAG = '00000000-0000-0000-0000-00000000b001'
const npcs: NpcTagOption[] = [
  { id: HALE, name: 'Dr Hale', portraitUrl: null, aliases: ['The Stranger', 'Doc'] },
  { id: HALE_JR, name: 'Dr Hale Junior', portraitUrl: null },
  { id: KOW, name: 'Kowalski', portraitUrl: 'https://example.test/k.png', aliases: ['kowalski', 'Dr Hale'] },
]

describe('parseNpcTag', () => {
  it('reads name tags and alias tags', () => {
    expect(parseNpcTag(`npc:${HALE.toUpperCase()}`)).toEqual({ kind: 'npc', id: HALE })
    expect(parseNpcTag(`npcalias:${TAG}`)).toEqual({ kind: 'alias', id: TAG })
    expect(isNpcTagHref(`npcalias:${TAG}`)).toBe(true)
    expect(isNpcTagHref('user:abc')).toBe(false)
    expect(isNpcTagHref(undefined)).toBe(false)
  })

  it('rejects anything that is not a valid tag', () => {
    expect(parseNpcTag(undefined)).toBeNull()
    expect(parseNpcTag('user:abc')).toBeNull()
    expect(parseNpcTag('npc:not-an-id')).toBeNull()
  })
})

describe('linkifyNpcTags', () => {
  it('turns @Name into a tag, at the start of a line and mid-sentence', () => {
    expect(linkifyNpcTags('Hi.\n@Dr Hale The body moved. Ask @Kowalski.', npcs)).toBe(
      `Hi.\n[Dr Hale](npc:${HALE}) The body moved. Ask [Kowalski](npc:${KOW}).`,
    )
  })

  it('matches the longest name first and ignores case', () => {
    expect(linkifyNpcTags('@dr hale junior waves', npcs)).toBe(`[Dr Hale Junior](npc:${HALE_JR}) waves`)
  })

  it('needs a space or line start before @ and a word end after the name', () => {
    expect(linkifyNpcTags('mail@Kowalski @Kowalskis', npcs)).toBe('mail@Kowalski @Kowalskis')
  })

  it('leaves upstream player mentions alone', () => {
    const text = '[@Kowalski](user:u1) said hi'
    expect(linkifyNpcTags(text, npcs)).toBe(text)
  })

  it('drops square brackets from names so the link stays valid', () => {
    const odd = [{ id: HALE, name: '[Agent] X', portraitUrl: null }]
    expect(linkifyNpcTags('@[Agent] X', odd)).toBe('@[Agent] X')
    expect(linkifyNpcTags('@Agent X', odd)).toBe(`[Agent X](npc:${HALE})`)
  })

  it('links an alias with its alias tag id, keeping the alias as written', () => {
    const ids = new Map([[aliasKey(HALE, 'The Stranger'), TAG]])
    expect(linkifyNpcTags('@the stranger nods', npcs, ids)).toBe(`[The Stranger](npcalias:${TAG}) nods`)
  })

  it('leaves an alias as plain text when it has no tag id', () => {
    expect(linkifyNpcTags('@Doc nods', npcs)).toBe('@Doc nods')
  })

  it('prefers a name over an alias with the same spelling', () => {
    expect(linkifyNpcTags('@Dr Hale', npcs, new Map([[aliasKey(KOW, 'Dr Hale'), TAG]]))).toBe(`[Dr Hale](npc:${HALE})`)
  })
})

describe('record tags', () => {
  const MORGUE = '00000000-0000-0000-0000-00000000c001'
  const records: NpcTagOption[] = [{ id: MORGUE, name: 'Morgue', portraitUrl: null, recordKind: 'location', aliases: ['The Slab'] }]

  it('reads rec: and recalias: links', () => {
    expect(parseNpcTag(`rec:${MORGUE}`)).toEqual({ kind: 'record', id: MORGUE })
    expect(parseNpcTag(`recalias:${TAG}`)).toEqual({ kind: 'recordAlias', id: TAG })
    expect(isNpcTagHref(`rec:${MORGUE}`)).toBe(true)
    expect(isNpcTagHref(`recalias:${TAG}`)).toBe(true)
    expect(parseNpcTag('rec:nope')).toBeNull()
  })

  it('links records with their own prefixes, next to NPCs', () => {
    const ids = new Map([[aliasKey(MORGUE, 'The Slab'), TAG]])
    expect(linkifyNpcTags('@Dr Hale at the @Morgue, aka @the slab.', [...npcs, ...records], ids)).toBe(
      `[Dr Hale](npc:${HALE}) at the [Morgue](rec:${MORGUE}), aka [The Slab](recalias:${TAG}).`,
    )
    expect(findAliasUses('@The Slab', records)).toEqual([{ target: records[0], alias: 'The Slab' }])
  })
})

describe('findAliasUses', () => {
  it('lists each alias used once, ignoring names and longer matches', () => {
    expect(findAliasUses('@Doc and @doc, then @Dr Hale and @The Stranger', npcs)).toEqual([
      { target: npcs[0], alias: 'The Stranger' },
      { target: npcs[0], alias: 'Doc' },
    ])
    expect(findAliasUses('@Dr Hale Junior', npcs)).toEqual([])
  })
})

describe('matchTagTerms', () => {
  it('lists names and aliases starting with the typed text, A–Z, minus names already shown', () => {
    expect(matchTagTerms(npcs, 'd').map(t => [t.text, t.alias])).toEqual([
      ['Doc', true],
      ['Dr Hale', false],
      ['Dr Hale Junior', false],
    ])
    expect(matchTagTerms(npcs, 'k', ['KOWALSKI']).map(t => t.text)).toEqual([])
  })
})

describe('tagInsertion', () => {
  it('adds a space before the tag when the cursor follows a word', () => {
    expect(tagInsertion('Hello', 'Dr Hale')).toBe(' @Dr Hale ')
    expect(tagInsertion('Hello ', 'Dr Hale')).toBe('@Dr Hale ')
    expect(tagInsertion('', 'Dr Hale')).toBe('@Dr Hale ')
  })
})

describe('characterOpener', () => {
  it('passes requests to subscribers until they unsubscribe', () => {
    const listener = vi.fn()
    const stop = onCharacterRequest(listener)
    requestCharacter(HALE)
    stop()
    requestCharacter(KOW)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(HALE)
  })
})
