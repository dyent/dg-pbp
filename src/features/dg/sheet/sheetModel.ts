// cspell:words specialisation specialisations Specialisation humint HUMINT unticked
// Delta Green character sheet: data shape, defaults, and the rules maths
// mirrored from the database (dg_derived_attributes / dg_breaking_point) so
// the editor can preview values while typing. The database stays the source
// of truth: the read view returns its own calculated values, and
// sheetModel.test.ts pins the same examples as the pgTAP tests.

export const STAT_KEYS = ['str', 'con', 'dex', 'int', 'pow', 'cha'] as const
export type StatKey = (typeof STAT_KEYS)[number]

export const STAT_LABELS: Record<StatKey, string> = {
  str: 'Strength',
  con: 'Constitution',
  dex: 'Dexterity',
  int: 'Intelligence',
  pow: 'Power',
  cha: 'Charisma',
}

export interface SkillDef {
  key: string
  label: string
  base: number
  /** Typed skills (e.g. Foreign Language) need a specialisation and can repeat. */
  typed?: boolean
}

// Skill names and base values from the Delta Green Agent's Handbook.
export const SKILLS: SkillDef[] = [
  { key: 'accounting', label: 'Accounting', base: 10 },
  { key: 'alertness', label: 'Alertness', base: 20 },
  { key: 'anthropology', label: 'Anthropology', base: 0 },
  { key: 'archeology', label: 'Archeology', base: 0 },
  { key: 'art', label: 'Art', base: 0, typed: true },
  { key: 'artillery', label: 'Artillery', base: 0 },
  { key: 'athletics', label: 'Athletics', base: 30 },
  { key: 'bureaucracy', label: 'Bureaucracy', base: 10 },
  { key: 'computer_science', label: 'Computer Science', base: 0 },
  { key: 'craft', label: 'Craft', base: 0, typed: true },
  { key: 'criminology', label: 'Criminology', base: 10 },
  { key: 'demolitions', label: 'Demolitions', base: 0 },
  { key: 'disguise', label: 'Disguise', base: 10 },
  { key: 'dodge', label: 'Dodge', base: 30 },
  { key: 'drive', label: 'Drive', base: 20 },
  { key: 'firearms', label: 'Firearms', base: 20 },
  { key: 'first_aid', label: 'First Aid', base: 10 },
  { key: 'foreign_language', label: 'Foreign Language', base: 0, typed: true },
  { key: 'forensics', label: 'Forensics', base: 0 },
  { key: 'heavy_machinery', label: 'Heavy Machinery', base: 10 },
  { key: 'heavy_weapons', label: 'Heavy Weapons', base: 0 },
  { key: 'history', label: 'History', base: 10 },
  { key: 'humint', label: 'HUMINT', base: 10 },
  { key: 'law', label: 'Law', base: 0 },
  { key: 'medicine', label: 'Medicine', base: 0 },
  { key: 'melee_weapons', label: 'Melee Weapons', base: 30 },
  { key: 'military_science', label: 'Military Science', base: 0, typed: true },
  { key: 'navigate', label: 'Navigate', base: 10 },
  { key: 'occult', label: 'Occult', base: 10 },
  { key: 'persuade', label: 'Persuade', base: 20 },
  { key: 'pharmacy', label: 'Pharmacy', base: 0 },
  { key: 'pilot', label: 'Pilot', base: 0, typed: true },
  { key: 'psychotherapy', label: 'Psychotherapy', base: 10 },
  { key: 'ride', label: 'Ride', base: 10 },
  { key: 'science', label: 'Science', base: 0, typed: true },
  { key: 'search', label: 'Search', base: 20 },
  { key: 'sigint', label: 'SIGINT', base: 0 },
  { key: 'stealth', label: 'Stealth', base: 10 },
  { key: 'surgery', label: 'Surgery', base: 0 },
  { key: 'survival', label: 'Survival', base: 10 },
  { key: 'swim', label: 'Swim', base: 20 },
  { key: 'unarmed_combat', label: 'Unarmed Combat', base: 40 },
  { key: 'unnatural', label: 'Unnatural', base: 0 },
]

const SKILL_BY_KEY = new Map(SKILLS.map(s => [s.key, s]))
export const TYPED_SKILLS = SKILLS.filter(s => s.typed)

export interface Stat {
  score: number | null
  feature: string
}

export interface Skill {
  /** Catalogue key, e.g. "firearms" or "foreign_language". */
  key: string
  /** Specialisation for typed skills, e.g. "Russian". */
  type: string
  value: number | null
  /** Ticked when the skill failed this session (for improvement rolls). */
  failed: boolean
}

export interface Bond {
  name: string
  score: number | null
}

export interface Weapon {
  name: string
  skill: string
  range: string
  damage: string
  armorPiercing: string
  lethality: string
  killRadius: string
  ammo: string
}

export interface Training {
  name: string
  skill: string
}

export interface Pool {
  current: number | null
  maxOverride: number | null
}

export interface AgentSheet {
  format: 'agent'
  personal: { profession: string; employer: string; nationality: string; sex: string; age: string; education: string }
  stats: Record<StatKey, Stat>
  hp: Pool
  wp: Pool
  san: { current: number | null }
  breakingPoint: number | null
  physical: string
  bonds: Bond[]
  motivations: string
  adapted: { violence: number; helplessness: number }
  /** Keyed by skill id: the catalogue key, or "key:specialisation" for typed skills. */
  skills: Record<string, Skill>
  training: Training[]
  wounds: string
  firstAidAttempted: boolean
  armorGear: string
  weapons: Weapon[]
  notes: string
  homeFamily: string
}

export interface NpcBlock {
  format: 'npc'
  stats: Record<StatKey, Stat>
  hp: Pool
  wp: Pool
  san: { current: number | null }
  armor: string
  skills: string
  attacks: string
  notes: string
}

export type SheetData = AgentSheet | NpcBlock

export const LIMITS = { text: 4000, number: 999, statMax: 99, skillMax: 99, bonds: 20, weapons: 20, training: 20 } as const

// ---------------------------------------------------------------------------
// Rules maths (mirror of the database functions)
// ---------------------------------------------------------------------------

export interface Derived {
  hpMax: number | null
  wpMax: number | null
  sanStart: number | null
  sanMax: number
  breakingPointStart: number | null
}

export function derivedAttributes(str: number | null, con: number | null, pow: number | null, unnatural: number | null): Derived {
  return {
    hpMax: str !== null && con !== null ? Math.ceil((str + con) / 2) : null,
    wpMax: pow,
    sanStart: pow !== null ? pow * 5 : null,
    sanMax: 99 - (unnatural ?? 0),
    breakingPointStart: pow !== null ? pow * 4 : null,
  }
}

/** New Breaking Point once the current one is reached. */
export function breakingPoint(san: number | null, pow: number | null): number | null {
  if (san === null || pow === null) return null
  return Math.max(san - pow, 0)
}

export const times5 = (score: number | null) => (score === null ? null : score * 5)

export function sheetDerived(sheet: SheetData): Derived {
  const unnatural = sheet.format === 'agent' ? sheet.skills.unnatural?.value ?? null : null
  return derivedAttributes(sheet.stats.str.score, sheet.stats.con.score, sheet.stats.pow.score, unnatural)
}

/** Max HP/WP: the override when set, else the calculated value. */
export function effectiveMax(pool: Pool, calculated: number | null): number | null {
  return pool.maxOverride ?? calculated
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export function skillId(key: string, type = ''): string {
  // Letters and digits only, so ids stay readable in the change log's dotted paths.
  const slug = type.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  return slug ? `${key}:${slug}` : key
}

export function skillLabel(skill: Pick<Skill, 'key' | 'type'>): string {
  const label = SKILL_BY_KEY.get(skill.key)?.label ?? skill.key
  return skill.type.trim() ? `${label} (${skill.type.trim()})` : label
}

export function skillBase(key: string): number {
  return SKILL_BY_KEY.get(key)?.base ?? 0
}

/** Skills in sheet order: catalogue order, typed specialisations alphabetical. */
export function orderedSkills(skills: Record<string, Skill>): [string, Skill][] {
  const position = new Map(SKILLS.map((s, i) => [s.key, i]))
  return Object.entries(skills).sort(([, a], [, b]) => {
    const pa = position.get(a.key) ?? SKILLS.length
    const pb = position.get(b.key) ?? SKILLS.length
    return pa - pb || a.type.localeCompare(b.type)
  })
}

// ---------------------------------------------------------------------------
// Defaults and parsing (stored JSON → typed sheet, tolerant of gaps)
// ---------------------------------------------------------------------------

const emptyStats = (): Record<StatKey, Stat> =>
  Object.fromEntries(STAT_KEYS.map(k => [k, { score: null, feature: '' }])) as Record<StatKey, Stat>

export function newAgentSheet(): AgentSheet {
  const skills: Record<string, Skill> = {}
  for (const s of SKILLS) {
    if (!s.typed) skills[s.key] = { key: s.key, type: '', value: s.base, failed: false }
  }
  return {
    format: 'agent',
    personal: { profession: '', employer: '', nationality: '', sex: '', age: '', education: '' },
    stats: emptyStats(),
    hp: { current: null, maxOverride: null },
    wp: { current: null, maxOverride: null },
    san: { current: null },
    breakingPoint: null,
    physical: '',
    bonds: [],
    motivations: '',
    adapted: { violence: 0, helplessness: 0 },
    skills,
    training: [],
    wounds: '',
    firstAidAttempted: false,
    armorGear: '',
    weapons: [],
    notes: '',
    homeFamily: '',
  }
}

export function newNpcBlock(): NpcBlock {
  return {
    format: 'npc',
    stats: emptyStats(),
    hp: { current: null, maxOverride: null },
    wp: { current: null, maxOverride: null },
    san: { current: null },
    armor: '',
    skills: '',
    attacks: '',
    notes: '',
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const clampTicks = (v: unknown): number => Math.min(Math.max(num(v) ?? 0, 0), 3)

function parseStats(v: unknown): Record<StatKey, Stat> {
  const o = isObj(v) ? v : {}
  const stats = emptyStats()
  for (const k of STAT_KEYS) {
    const s = isObj(o[k]) ? (o[k] as Obj) : {}
    stats[k] = { score: num(s.score), feature: text(s.feature) }
  }
  return stats
}

function parsePool(v: unknown): Pool {
  const o = isObj(v) ? v : {}
  return { current: num(o.current), maxOverride: num(o.maxOverride) }
}

function parseAgent(o: Obj): AgentSheet {
  const p = isObj(o.personal) ? o.personal : {}
  const skills: Record<string, Skill> = {}
  if (isObj(o.skills)) {
    for (const [id, raw] of Object.entries(o.skills)) {
      if (!isObj(raw)) continue
      skills[id] = { key: text(raw.key) || id.split(':')[0], type: text(raw.type), value: num(raw.value), failed: raw.failed === true }
    }
  }
  const adapted = isObj(o.adapted) ? o.adapted : {}
  return {
    format: 'agent',
    personal: {
      profession: text(p.profession),
      employer: text(p.employer),
      nationality: text(p.nationality),
      sex: text(p.sex),
      age: text(p.age),
      education: text(p.education),
    },
    stats: parseStats(o.stats),
    hp: parsePool(o.hp),
    wp: parsePool(o.wp),
    san: { current: num(isObj(o.san) ? o.san.current : null) },
    breakingPoint: num(o.breakingPoint),
    physical: text(o.physical),
    bonds: list(o.bonds).filter(isObj).map(b => ({ name: text(b.name), score: num(b.score) })),
    motivations: text(o.motivations),
    adapted: { violence: clampTicks(adapted.violence), helplessness: clampTicks(adapted.helplessness) },
    skills,
    training: list(o.training).filter(isObj).map(t => ({ name: text(t.name), skill: text(t.skill) })),
    wounds: text(o.wounds),
    firstAidAttempted: o.firstAidAttempted === true,
    armorGear: text(o.armorGear),
    weapons: list(o.weapons).filter(isObj).map(w => ({
      name: text(w.name),
      skill: text(w.skill),
      range: text(w.range),
      damage: text(w.damage),
      armorPiercing: text(w.armorPiercing),
      lethality: text(w.lethality),
      killRadius: text(w.killRadius),
      ammo: text(w.ammo),
    })),
    notes: text(o.notes),
    homeFamily: text(o.homeFamily),
  }
}

function parseNpc(o: Obj): NpcBlock {
  return {
    format: 'npc',
    stats: parseStats(o.stats),
    hp: parsePool(o.hp),
    wp: parsePool(o.wp),
    san: { current: num(isObj(o.san) ? o.san.current : null) },
    armor: text(o.armor),
    skills: text(o.skills),
    attacks: text(o.attacks),
    notes: text(o.notes),
  }
}

/** Stored JSON → sheet. Unknown or missing format falls back to `fallback`. */
export function parseSheet(data: unknown, fallback: 'agent' | 'npc'): SheetData {
  const o = isObj(data) ? data : {}
  const format = o.format === 'agent' || o.format === 'npc' ? o.format : fallback
  return format === 'agent' ? parseAgent(o) : parseNpc(o)
}

// ---------------------------------------------------------------------------
// Validation (the database checks again)
// ---------------------------------------------------------------------------

/** First problem with a sheet, or null when it can be saved. */
export function validateSheet(sheet: SheetData): string | null {
  for (const k of STAT_KEYS) {
    const score = sheet.stats[k].score
    if (score !== null && (score < 0 || score > LIMITS.statMax)) return `${STAT_LABELS[k]} must be between 0 and ${LIMITS.statMax}.`
  }
  for (const [label, pool] of [['HP', sheet.hp], ['WP', sheet.wp]] as const) {
    for (const v of [pool.current, pool.maxOverride]) {
      if (v !== null && (v < 0 || v > LIMITS.number)) return `${label} must be between 0 and ${LIMITS.number}.`
    }
  }
  if (sheet.san.current !== null && (sheet.san.current < 0 || sheet.san.current > 99)) return 'SAN must be between 0 and 99.'
  if (sheet.format === 'agent') {
    for (const skill of Object.values(sheet.skills)) {
      if (skill.value !== null && (skill.value < 0 || skill.value > LIMITS.skillMax)) {
        return `${skillLabel(skill)} must be between 0 and ${LIMITS.skillMax}%.`
      }
      if (SKILL_BY_KEY.get(skill.key)?.typed && !skill.type.trim()) return `${skillLabel(skill)} needs a specialisation.`
    }
    for (const bond of sheet.bonds) {
      if (!bond.name.trim()) return 'Every Bond needs a name.'
      if (bond.score !== null && (bond.score < 0 || bond.score > 99)) return `Bond "${bond.name}" must be between 0 and 99.`
    }
    if (sheet.bonds.length > LIMITS.bonds) return `At most ${LIMITS.bonds} Bonds.`
    if (sheet.weapons.length > LIMITS.weapons) return `At most ${LIMITS.weapons} weapons.`
    if (sheet.training.length > LIMITS.training) return `At most ${LIMITS.training} special training entries.`
  }
  const tooLong = findLongText(sheet)
  return tooLong ? `${tooLong} is too long (${LIMITS.text} characters maximum).` : null
}

function findLongText(value: unknown, path = 'A text box'): string | null {
  if (typeof value === 'string') return value.length > LIMITS.text ? path : null
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findLongText(item, path)
      if (hit) return hit
    }
  } else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      const hit = findLongText(v, FIELD_LABELS[k] ?? path)
      if (hit) return hit
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Change-log labels (paths come from the database's flattened diff)
// ---------------------------------------------------------------------------

export const FIELD_LABELS: Record<string, string> = {
  profession: 'Profession',
  employer: 'Employer',
  nationality: 'Nationality',
  sex: 'Sex',
  age: 'Age and date of birth',
  education: 'Education and occupational history',
  physical: 'Physical description',
  motivations: 'Motivations and mental disorders',
  wounds: 'Wounds and ailments',
  firstAidAttempted: 'First aid attempted',
  armorGear: 'Armour and gear',
  notes: 'Notes',
  homeFamily: 'Home and family',
  breakingPoint: 'Breaking Point',
  armor: 'Armour',
  attacks: 'Attacks',
  format: 'Sheet type',
}

const POOL_LABELS: Record<string, string> = { hp: 'HP', wp: 'WP', san: 'SAN' }
const PART_LABELS: Record<string, string> = {
  name: 'name',
  score: 'score',
  skill: 'skill',
  range: 'range',
  damage: 'damage',
  armorPiercing: 'armour piercing',
  lethality: 'lethality',
  killRadius: 'kill radius',
  ammo: 'ammo',
}

/**
 * Changes worth showing the GM: drops a skill's internal key/specialisation
 * fields and unticked boxes appearing for newly added rows.
 */
export function isMeaningfulChange(change: { path: string; from: string | null; to: string | null }): boolean {
  const parts = change.path.split('.')
  if (parts[0] === 'skills' && (parts[2] === 'key' || parts[2] === 'type')) return false
  if (parts[0] === 'format') return false
  if (change.from === null && (change.to === 'false' || change.to === '')) return false
  return true
}

/** "stats.pow.score" → "POW", "skills.firearms.value" → "Firearms", … */
export function pathLabel(path: string): string {
  const parts = path.split('.')
  const [head, a, b] = parts
  if (head === 'stats' && a) return b === 'feature' ? `${a.toUpperCase()} feature` : a.toUpperCase()
  if (POOL_LABELS[head]) {
    if (a === 'maxOverride') return `${POOL_LABELS[head]} maximum (override)`
    return POOL_LABELS[head]
  }
  if (head === 'personal' && a) return FIELD_LABELS[a] ?? a
  if (head === 'skills' && a) {
    const field = b ?? 'value'
    const [key, slug = ''] = a.split(':')
    const label = skillLabel({ key, type: slug.replace(/-/g, ' ') })
    if (field === 'failed') return `${label} (failed this session)`
    if (field === 'value') return label
    return `${label} ${field}`
  }
  if (head === 'adapted' && a) return a === 'violence' ? 'Adapted to violence' : 'Adapted to helplessness'
  if ((head === 'bonds' || head === 'weapons' || head === 'training') && a !== undefined) {
    const noun = head === 'bonds' ? 'Bond' : head === 'weapons' ? 'Weapon' : 'Special training'
    return `${noun} ${Number(a) + 1}${b ? ` ${PART_LABELS[b] ?? b}` : ''}`
  }
  return FIELD_LABELS[head] ?? path
}
