// cspell:words Kowalski kowalski recognises
import { describe, expect, it } from 'vitest'
import {
  describeLink,
  isLinkVisibility,
  isRecordTarget,
  sortLinks,
  sortTargets,
  validateLinkLabel,
  type CampaignLink,
  type LinkTarget,
} from './linkModel'

const morgue: LinkTarget = { type: 'record', id: 'r1', name: 'Morgue', kind: 'location', pictureUrl: null }
const kowalski: LinkTarget = { type: 'character', id: 'c1', name: 'Kowalski', kind: 'npc', pictureUrl: null }

function link(partial: Partial<CampaignLink>): CampaignLink {
  return { id: 'l', label: 'works at', visibility: 'gm', outgoing: true, other: morgue, ...partial }
}

describe('linkModel', () => {
  it('reads a link from either end', () => {
    expect(describeLink(link({}), 'Kowalski')).toEqual({ from: 'Kowalski', label: 'works at', to: 'Morgue' })
    expect(describeLink(link({ outgoing: false, other: kowalski }), 'Morgue')).toEqual({ from: 'Kowalski', label: 'works at', to: 'Morgue' })
  })

  it('validates labels', () => {
    expect(validateLinkLabel('  ')).toMatch(/label/)
    expect(validateLinkLabel('x'.repeat(61))).toMatch(/60/)
    expect(validateLinkLabel(' knows ')).toBeNull()
  })

  it('recognises visibilities and record targets', () => {
    expect(isLinkVisibility('players')).toBe(true)
    expect(isLinkVisibility('selected')).toBe(false)
    expect(isRecordTarget(morgue)).toBe(true)
    expect(isRecordTarget(kowalski)).toBe(false)
  })

  it('lists PCs, then NPCs, then records, without the subject', () => {
    const reyes: LinkTarget = { type: 'character', id: 'c2', name: 'Reyes', kind: 'pc', pictureUrl: null }
    const attic: LinkTarget = { ...morgue, id: 'r2', name: 'Attic' }
    expect(sortTargets([morgue, kowalski, attic, reyes], { type: 'record', id: 'r1' }).map(t => t.name)).toEqual(['Reyes', 'Kowalski', 'Attic'])
  })

  it('sorts links by label, then name', () => {
    const list = [link({ id: 'b', label: 'works at' }), link({ id: 'a', label: 'knows', other: kowalski }), link({ id: 'c', label: 'knows' })]
    expect(sortLinks(list).map(l => l.id)).toEqual(['a', 'c', 'b'])
  })
})
