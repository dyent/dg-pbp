// cspell:words Lockpicking Glock specialisation specialisations
import { describe, it, expect } from 'vitest'
import {
  SKILLS,
  breakingPoint,
  derivedAttributes,
  effectiveMax,
  isMeaningfulChange,
  newAgentSheet,
  newNpcBlock,
  orderedSkills,
  parseSheet,
  pathLabel,
  sheetDerived,
  skillBase,
  skillId,
  skillLabel,
  times5,
  validateSheet,
  type AgentSheet,
} from './sheetModel'

describe('rules maths (same cases as the pgTAP tests)', () => {
  it('derives HP, WP, SAN, max SAN and the starting Breaking Point', () => {
    expect(derivedAttributes(10, 11, 12, 3)).toEqual({ hpMax: 11, wpMax: 12, sanStart: 60, sanMax: 96, breakingPointStart: 48 })
  })

  it('gives nothing for missing statistics, and max SAN 99 without Unnatural', () => {
    expect(derivedAttributes(null, 11, null, null)).toEqual({ hpMax: null, wpMax: null, sanStart: null, sanMax: 99, breakingPointStart: null })
  })

  it('recalculates the Breaking Point as SAN - POW, never below 0', () => {
    expect(breakingPoint(52, 13)).toBe(39)
    expect(breakingPoint(5, 13)).toBe(0)
    expect(breakingPoint(null, 13)).toBeNull()
    expect(breakingPoint(50, null)).toBeNull()
  })

  it('multiplies statistics by five and prefers overrides for maxima', () => {
    expect(times5(13)).toBe(65)
    expect(times5(null)).toBeNull()
    expect(effectiveMax({ current: null, maxOverride: 15 }, 12)).toBe(15)
    expect(effectiveMax({ current: null, maxOverride: null }, 12)).toBe(12)
  })

  it('reads Unnatural from an agent sheet only', () => {
    const sheet = newAgentSheet()
    sheet.stats.pow.score = 10
    sheet.skills.unnatural.value = 5
    expect(sheetDerived(sheet).sanMax).toBe(94)
    const block = newNpcBlock()
    block.stats.str.score = 9
    block.stats.con.score = 10
    expect(sheetDerived(block)).toMatchObject({ hpMax: 10, sanMax: 99 })
  })
})

describe('skills', () => {
  it('starts a new sheet with every untyped skill at its base value', () => {
    const sheet = newAgentSheet()
    expect(sheet.skills.firearms).toEqual({ key: 'firearms', type: '', value: 20, failed: false })
    expect(sheet.skills.unarmed_combat.value).toBe(40)
    expect(sheet.skills.foreign_language).toBeUndefined()
    expect(Object.keys(sheet.skills)).toHaveLength(SKILLS.filter(s => !s.typed).length)
  })

  it('builds readable ids and labels for typed skills', () => {
    expect(skillId('foreign_language', ' Russian ')).toBe('foreign_language:russian')
    expect(skillId('pilot', 'Fixed-wing aircraft')).toBe('pilot:fixed-wing-aircraft')
    expect(skillId('firearms')).toBe('firearms')
    expect(skillLabel({ key: 'foreign_language', type: 'Russian' })).toBe('Foreign Language (Russian)')
    expect(skillLabel({ key: 'mystery', type: '' })).toBe('mystery')
    expect(skillBase('athletics')).toBe(30)
    expect(skillBase('mystery')).toBe(0)
  })

  it('orders skills like the sheet, with specialisations alphabetical and unknown skills last', () => {
    const order = orderedSkills({
      zz: { key: 'zz', type: '', value: 1, failed: false },
      'science:physics': { key: 'science', type: 'Physics', value: 1, failed: false },
      'science:biology': { key: 'science', type: 'Biology', value: 1, failed: false },
      accounting: { key: 'accounting', type: '', value: 10, failed: false },
    }).map(([id]) => id)
    expect(order).toEqual(['accounting', 'science:biology', 'science:physics', 'zz'])
  })
})

describe('parseSheet', () => {
  it('fills gaps with defaults and ignores junk', () => {
    const sheet = parseSheet(
      {
        format: 'agent',
        stats: { pow: { score: 13.7, feature: 'Calm' }, str: 'x' },
        hp: { current: 9, maxOverride: 'no' },
        bonds: [{ name: 'Maya', score: 12 }, 'junk'],
        adapted: { violence: 7, helplessness: -1 },
        skills: { firearms: { value: 50, failed: true }, junk: 'x' },
        training: [{ name: 'Lockpicking', skill: 'Craft' }],
        weapons: [{ name: 'Glock 22', damage: '1D10' }],
        firstAidAttempted: true,
        personal: { profession: 'FBI' },
      },
      'npc',
    ) as AgentSheet
    expect(sheet.format).toBe('agent')
    expect(sheet.stats.pow).toEqual({ score: 13, feature: 'Calm' })
    expect(sheet.stats.str.score).toBeNull()
    expect(sheet.hp).toEqual({ current: 9, maxOverride: null })
    expect(sheet.bonds).toEqual([{ name: 'Maya', score: 12 }])
    expect(sheet.adapted).toEqual({ violence: 3, helplessness: 0 })
    expect(sheet.skills.firearms).toEqual({ key: 'firearms', type: '', value: 50, failed: true })
    expect(sheet.skills.junk).toBeUndefined()
    expect(sheet.training).toEqual([{ name: 'Lockpicking', skill: 'Craft' }])
    expect(sheet.weapons[0]).toMatchObject({ name: 'Glock 22', damage: '1D10', ammo: '' })
    expect(sheet.firstAidAttempted).toBe(true)
    expect(sheet.personal.profession).toBe('FBI')
    expect(sheet.breakingPoint).toBeNull()
  })

  it('uses the fallback format for empty or unknown data', () => {
    expect(parseSheet(null, 'npc').format).toBe('npc')
    expect(parseSheet({ format: 'other' }, 'agent').format).toBe('agent')
    expect(parseSheet([], 'agent').format).toBe('agent')
  })

  it('parses an NPC stat block', () => {
    const block = parseSheet({ format: 'npc', attacks: 'Pistol 40%', san: { current: 30 } }, 'agent')
    expect(block).toMatchObject({ format: 'npc', attacks: 'Pistol 40%', san: { current: 30 }, armor: '' })
  })

  it('round-trips a new sheet unchanged', () => {
    const sheet = newAgentSheet()
    expect(parseSheet(JSON.parse(JSON.stringify(sheet)), 'agent')).toEqual(sheet)
    const block = newNpcBlock()
    expect(parseSheet(JSON.parse(JSON.stringify(block)), 'npc')).toEqual(block)
  })
})

describe('validateSheet', () => {
  const agent = () => newAgentSheet()

  it('accepts a new sheet', () => {
    expect(validateSheet(agent())).toBeNull()
    expect(validateSheet(newNpcBlock())).toBeNull()
  })

  it.each([
    [(s: AgentSheet) => { s.stats.pow.score = 100 }, /Power must be between 0 and 99/],
    [(s: AgentSheet) => { s.hp.current = 1000 }, /HP must be between/],
    [(s: AgentSheet) => { s.wp.maxOverride = 1000 }, /WP must be between/],
    [(s: AgentSheet) => { s.san.current = 100 }, /SAN must be between 0 and 99/],
    [(s: AgentSheet) => { s.skills.firearms.value = 120 }, /Firearms must be between 0 and 99%/],
    [(s: AgentSheet) => { s.skills['art:'] = { key: 'art', type: ' ', value: 0, failed: false } }, /Art needs a specialisation/],
    [(s: AgentSheet) => { s.bonds = [{ name: ' ', score: 5 }] }, /Every Bond needs a name/],
    [(s: AgentSheet) => { s.bonds = [{ name: 'Maya', score: 120 }] }, /Bond "Maya" must be between/],
    [(s: AgentSheet) => { s.bonds = Array.from({ length: 21 }, () => ({ name: 'B', score: 1 })) }, /At most 20 Bonds/],
    [(s: AgentSheet) => { s.weapons = Array.from({ length: 21 }, () => ({ name: 'W', skill: '', range: '', damage: '', armorPiercing: '', lethality: '', killRadius: '', ammo: '' })) }, /At most 20 weapons/],
    [(s: AgentSheet) => { s.training = Array.from({ length: 21 }, () => ({ name: 'T', skill: '' })) }, /At most 20 special training/],
    [(s: AgentSheet) => { s.notes = 'x'.repeat(4001) }, /Notes is too long/],
    [(s: AgentSheet) => { s.personal.profession = 'x'.repeat(4001) }, /Profession is too long/],
    [(s: AgentSheet) => { s.weapons = [{ name: 'x'.repeat(4001), skill: '', range: '', damage: '', armorPiercing: '', lethality: '', killRadius: '', ammo: '' }] }, /is too long/],
  ])('rejects %#', (change, message) => {
    const sheet = agent()
    change(sheet)
    expect(validateSheet(sheet)).toMatch(message)
  })
})

describe('change-log labels', () => {
  it.each([
    ['stats.pow.score', 'POW'],
    ['stats.pow.feature', 'POW feature'],
    ['hp.current', 'HP'],
    ['wp.maxOverride', 'WP maximum (override)'],
    ['san.current', 'SAN'],
    ['personal.age', 'Age and date of birth'],
    ['personal.unknown', 'unknown'],
    ['skills.firearms.value', 'Firearms'],
    ['skills.firearms.failed', 'Firearms (failed this session)'],
    ['skills.foreign_language:russian.value', 'Foreign Language (russian)'],
    ['skills.pilot:fixed-wing.other', 'Pilot (fixed wing) other'],
    ['skills.firearms', 'Firearms'],
    ['adapted.violence', 'Adapted to violence'],
    ['adapted.helplessness', 'Adapted to helplessness'],
    ['bonds.0.score', 'Bond 1 score'],
    ['bonds.2', 'Bond 3'],
    ['weapons.1.killRadius', 'Weapon 2 kill radius'],
    ['weapons.0.custom', 'Weapon 1 custom'],
    ['training.0.name', 'Special training 1 name'],
    ['breakingPoint', 'Breaking Point'],
    ['homeFamily', 'Home and family'],
    ['mystery.path', 'mystery.path'],
  ])('labels %s', (path, label) => {
    expect(pathLabel(path)).toBe(label)
  })

  it('hides internal and empty-new changes', () => {
    expect(isMeaningfulChange({ path: 'skills.art:x.key', from: null, to: 'art' })).toBe(false)
    expect(isMeaningfulChange({ path: 'skills.art:x.type', from: null, to: 'X' })).toBe(false)
    expect(isMeaningfulChange({ path: 'format', from: null, to: 'agent' })).toBe(false)
    expect(isMeaningfulChange({ path: 'skills.art:x.failed', from: null, to: 'false' })).toBe(false)
    expect(isMeaningfulChange({ path: 'weapons.0.ammo', from: null, to: '' })).toBe(false)
    expect(isMeaningfulChange({ path: 'stats.pow.score', from: '12', to: '11' })).toBe(true)
    expect(isMeaningfulChange({ path: 'skills.firearms.failed', from: 'false', to: 'true' })).toBe(true)
  })
})
