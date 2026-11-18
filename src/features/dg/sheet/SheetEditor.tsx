// cspell:words specialisation Specialisation
import { useId, useState, type ReactNode } from 'react'
import { BTN_ICON, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '../../ext/characters/ui'
import { Section } from './SheetView'
import {
  LIMITS,
  STAT_KEYS,
  STAT_LABELS,
  TYPED_SKILLS,
  breakingPoint,
  effectiveMax,
  orderedSkills,
  sheetDerived,
  skillBase,
  skillId,
  skillLabel,
  times5,
  validateSheet,
  type AgentSheet,
  type NpcBlock,
  type Pool,
  type SheetData,
  type Weapon,
} from './sheetModel'

// ---------------------------------------------------------------------------
// Small inputs
// ---------------------------------------------------------------------------

function NumberInput({ value, onChange, label, max = LIMITS.number, className = 'w-16' }: {
  value: number | null
  onChange: (v: number | null) => void
  label: string
  max?: number
  className?: string
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={value ?? ''}
      onChange={e => {
        const raw = e.target.value.trim()
        if (raw === '') return onChange(null)
        if (!/^\d{1,3}$/.test(raw)) return
        onChange(Math.min(Number(raw), max))
      }}
      className={`${INPUT} ${className} text-right`}
    />
  )
}

function TextField({ label, value, onChange, multiline = false, rows = 3 }: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} rows={rows} value={value} maxLength={LIMITS.text} onChange={e => onChange(e.target.value)} className={`${INPUT} mt-1`} />
      ) : (
        <input id={id} value={value} maxLength={LIMITS.text} onChange={e => onChange(e.target.value)} className={`${INPUT} mt-1`} />
      )}
    </div>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={`${BTN_ICON} hover:!text-red-600`} aria-label={label} onClick={onClick}>
      ✕
    </button>
  )
}

// ---------------------------------------------------------------------------
// Shared blocks
// ---------------------------------------------------------------------------

type Update<T> = (fn: (draft: T) => void) => void

function StatsEditor<T extends AgentSheet | NpcBlock>({ sheet, update, withFeatures }: { sheet: T; update: Update<T>; withFeatures: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-surface-500 dark:text-surface-400">
          <th scope="col" className="font-medium">Statistic</th>
          <th scope="col" className="font-medium">Score</th>
          <th scope="col" className="w-12 text-right font-medium">×5</th>
          {withFeatures && <th scope="col" className="pl-2 font-medium">Distinguishing feature</th>}
        </tr>
      </thead>
      <tbody>
        {STAT_KEYS.map(k => (
          <tr key={k}>
            <th scope="row" className="py-0.5 text-left font-normal text-surface-700 dark:text-surface-300">{k.toUpperCase()}</th>
            <td>
              <NumberInput
                label={STAT_LABELS[k]}
                value={sheet.stats[k].score}
                max={LIMITS.statMax}
                onChange={v => update(d => { d.stats[k].score = v })}
              />
            </td>
            <td className="text-right text-surface-600 dark:text-surface-400">{times5(sheet.stats[k].score) ?? '—'}</td>
            {withFeatures && (
              <td className="pl-2">
                <input
                  aria-label={`${STAT_LABELS[k]} feature`}
                  value={sheet.stats[k].feature}
                  maxLength={200}
                  onChange={e => update(d => { d.stats[k].feature = e.target.value })}
                  className={INPUT}
                />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PoolEditor<T extends AgentSheet | NpcBlock>({ name, pool, calc, update, pick }: {
  name: 'HP' | 'WP'
  pool: Pool
  calc: number | null
  update: Update<T>
  pick: (d: T) => Pool
}) {
  const max = effectiveMax(pool, calc)
  return (
    <div className="space-y-1">
      <p className={LABEL}>{name}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <NumberInput label={`Current ${name}`} value={pool.current} onChange={v => update(d => { pick(d).current = v })} />
        <span>/ {max ?? '—'}</span>
        {pool.current === null && max !== null && (
          <button type="button" className={BTN_SECONDARY} onClick={() => update(d => { pick(d).current = max })}>
            Start at {max}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-surface-600 dark:text-surface-400">
        <span>Maximum override</span>
        <NumberInput label={`${name} maximum override`} value={pool.maxOverride} onChange={v => update(d => { pick(d).maxOverride = v })} className="w-14" />
        <span>calculated: {calc ?? '—'}</span>
      </div>
    </div>
  )
}

function DerivedEditor<T extends AgentSheet | NpcBlock>({ sheet, update }: { sheet: T; update: Update<T> }) {
  const derived = sheetDerived(sheet)
  const san = sheet.san.current
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <PoolEditor name="HP" pool={sheet.hp} calc={derived.hpMax} update={update} pick={d => d.hp} />
      <PoolEditor name="WP" pool={sheet.wp} calc={derived.wpMax} update={update} pick={d => d.wp} />
      <div className="space-y-1">
        <p className={LABEL}>SAN</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <NumberInput label="Current SAN" value={san} max={99} onChange={v => update(d => { d.san.current = v })} />
          <span>/ {derived.sanMax}</span>
          {san === null && derived.sanStart !== null && (
            <button type="button" className={BTN_SECONDARY} onClick={() => update(d => { d.san.current = derived.sanStart })}>
              Start at {derived.sanStart}
            </button>
          )}
        </div>
        {san !== null && san > derived.sanMax && <p className="text-xs text-red-600 dark:text-red-400">Above the maximum (99 − Unnatural).</p>}
      </div>
      {sheet.format === 'agent' && (
        <BreakingPointEditor sheet={sheet} update={update as unknown as Update<AgentSheet>} start={derived.breakingPointStart} />
      )}
    </div>
  )
}

function BreakingPointEditor({ sheet, update, start }: { sheet: AgentSheet; update: Update<AgentSheet>; start: number | null }) {
  const next = breakingPoint(sheet.san.current, sheet.stats.pow.score)
  return (
    <div className="space-y-1">
      <p className={LABEL}>Breaking Point</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <NumberInput label="Breaking Point" value={sheet.breakingPoint} max={99} onChange={v => update(d => { d.breakingPoint = v })} />
        {next !== null && (
          <button type="button" className={BTN_SECONDARY} onClick={() => update(d => { d.breakingPoint = next })}>
            Recalculate ({next})
          </button>
        )}
      </div>
      <p className="text-xs text-surface-600 dark:text-surface-400">
        Starts at {start ?? '—'} (SAN − POW). When it's reached, recalculate from current SAN.
      </p>
    </div>
  )
}

function EditorFrame({ children, error, saving, onCancel }: { children: ReactNode; error: string | null; saving: boolean; onCancel: () => void }) {
  return (
    <>
      {children}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-surface-100 bg-white py-3 dark:border-surface-700 dark:bg-surface-800">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  )
}

function useDraft<T extends SheetData>(initial: T) {
  const [draft, setDraft] = useState<T>(() => structuredClone(initial))
  const update: Update<T> = fn =>
    setDraft(current => {
      const next = structuredClone(current)
      fn(next)
      return next
    })
  return [draft, update] as const
}

interface EditorProps<T> {
  sheet: T
  saving: boolean
  onCancel: () => void
  onSave: (sheet: T) => void
}

// ---------------------------------------------------------------------------
// Agent sheet editor
// ---------------------------------------------------------------------------

const EMPTY_WEAPON: Weapon = { name: '', skill: '', range: '', damage: '', armorPiercing: '', lethality: '', killRadius: '', ammo: '' }
const WEAPON_FIELDS: [keyof Weapon, string][] = [
  ['name', 'Weapon'],
  ['skill', 'Skill %'],
  ['range', 'Base range'],
  ['damage', 'Damage'],
  ['armorPiercing', 'Armour piercing'],
  ['lethality', 'Lethality'],
  ['killRadius', 'Kill radius'],
  ['ammo', 'Ammo'],
]

export function SheetEditor({ sheet, saving, onCancel, onSave }: EditorProps<AgentSheet>) {
  const [draft, update] = useDraft(sheet)
  const [error, setError] = useState<string | null>(null)
  const [typedKey, setTypedKey] = useState(TYPED_SKILLS[0].key)
  const [typedName, setTypedName] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateSheet(draft)
    setError(problem)
    if (!problem) onSave(draft)
  }

  const addTypedSkill = () => {
    const type = typedName.trim()
    if (!type) return setError('Type a specialisation first, e.g. Russian.')
    const id = skillId(typedKey, type)
    if (draft.skills[id]) return setError(`${skillLabel({ key: typedKey, type })} is already on the sheet.`)
    setError(null)
    update(d => { d.skills[id] = { key: typedKey, type, value: skillBase(typedKey), failed: false } })
    setTypedName('')
  }

  const p = draft.personal
  const setPersonal = (key: keyof AgentSheet['personal']) => (v: string) => update(d => { d.personal[key] = v })

  return (
    <form onSubmit={submit} aria-label="Edit sheet" className="space-y-3">
      <EditorFrame error={error} saving={saving} onCancel={onCancel}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Personal data" className="lg:col-span-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <TextField label="Profession" value={p.profession} onChange={setPersonal('profession')} />
              <TextField label="Employer" value={p.employer} onChange={setPersonal('employer')} />
              <TextField label="Nationality" value={p.nationality} onChange={setPersonal('nationality')} />
              <TextField label="Sex" value={p.sex} onChange={setPersonal('sex')} />
              <TextField label="Age and date of birth" value={p.age} onChange={setPersonal('age')} />
              <TextField label="Education and occupational history" value={p.education} onChange={setPersonal('education')} />
            </div>
          </Section>

          <Section title="Statistics">
            <StatsEditor sheet={draft} update={update} withFeatures />
          </Section>

          <Section title="Derived attributes">
            <DerivedEditor sheet={draft} update={update} />
          </Section>

          <Section title="Physical description">
            <TextField label="Physical description" value={draft.physical} onChange={v => update(d => { d.physical = v })} multiline />
          </Section>

          <Section title="Bonds">
            <ul className="space-y-2">
              {draft.bonds.map((bond, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    aria-label={`Bond ${i + 1} name`}
                    value={bond.name}
                    maxLength={200}
                    onChange={e => update(d => { d.bonds[i].name = e.target.value })}
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                  <NumberInput label={`Bond ${i + 1} score`} value={bond.score} max={99} onChange={v => update(d => { d.bonds[i].score = v })} />
                  <RemoveButton label={`Remove bond ${bond.name || i + 1}`} onClick={() => update(d => { d.bonds.splice(i, 1) })} />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`${BTN_SECONDARY} mt-2`}
              disabled={draft.bonds.length >= LIMITS.bonds}
              onClick={() => update(d => { d.bonds.push({ name: '', score: d.stats.cha.score }) })}
            >
              + Bond
            </button>
            <p className="mt-1 text-xs text-surface-500">A new Bond starts at CHA ({draft.stats.cha.score ?? 'not set'}).</p>
          </Section>

          <Section title="Motivations and mental disorders">
            <TextField label="Motivations and mental disorders" value={draft.motivations} onChange={v => update(d => { d.motivations = v })} multiline rows={5} />
          </Section>

          <Section title="Incidents of SAN loss without going insane">
            {(['violence', 'helplessness'] as const).map(kind => (
              <fieldset key={kind} className="flex items-center gap-2 text-sm">
                <legend className="sr-only">{kind === 'violence' ? 'Violence' : 'Helplessness'}</legend>
                <span className="w-28 text-surface-700 dark:text-surface-300">{kind === 'violence' ? 'Violence' : 'Helplessness'}</span>
                {[1, 2, 3].map(n => (
                  <input
                    key={n}
                    type="checkbox"
                    aria-label={`${kind === 'violence' ? 'Violence' : 'Helplessness'} incident ${n}`}
                    checked={draft.adapted[kind] >= n}
                    onChange={e => update(d => { d.adapted[kind] = e.target.checked ? n : n - 1 })}
                  />
                ))}
              </fieldset>
            ))}
          </Section>

          <Section title="Skills" className="lg:col-span-2">
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {orderedSkills(draft.skills).map(([id, skill]) => (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${skillLabel(skill)} failed this session`}
                    title="Failed this session"
                    checked={skill.failed}
                    onChange={e => update(d => { d.skills[id].failed = e.target.checked })}
                  />
                  <span className="min-w-0 flex-1 truncate text-surface-800 dark:text-surface-200">{skillLabel(skill)}</span>
                  <NumberInput label={skillLabel(skill)} value={skill.value} max={LIMITS.skillMax} className="w-14" onChange={v => update(d => { d.skills[id].value = v })} />
                  {skill.type && <RemoveButton label={`Remove ${skillLabel(skill)}`} onClick={() => update(d => { delete d.skills[id] })} />}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-surface-500">Tick the box when a skill fails this session (for improvement rolls).</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select value={typedKey} onChange={e => setTypedKey(e.target.value)} aria-label="Typed skill" className={`${INPUT} w-auto`}>
                {TYPED_SKILLS.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <input
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Russian"
                aria-label="Specialisation"
                className={`${INPUT} w-40`}
              />
              <button type="button" className={BTN_SECONDARY} onClick={addTypedSkill}>
                + Add skill
              </button>
            </div>
          </Section>

          <Section title="Special training">
            <ul className="space-y-2">
              {draft.training.map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input aria-label={`Training ${i + 1}`} value={t.name} maxLength={200} onChange={e => update(d => { d.training[i].name = e.target.value })} className={`${INPUT} min-w-0 flex-1`} />
                  <input
                    aria-label={`Training ${i + 1} skill or stat`}
                    placeholder="Skill or stat"
                    value={t.skill}
                    maxLength={100}
                    onChange={e => update(d => { d.training[i].skill = e.target.value })}
                    className={`${INPUT} w-32`}
                  />
                  <RemoveButton label={`Remove training ${t.name || i + 1}`} onClick={() => update(d => { d.training.splice(i, 1) })} />
                </li>
              ))}
            </ul>
            <button type="button" className={`${BTN_SECONDARY} mt-2`} disabled={draft.training.length >= LIMITS.training} onClick={() => update(d => { d.training.push({ name: '', skill: '' }) })}>
              + Training
            </button>
          </Section>

          <Section title="Wounds and ailments">
            <TextField label="Wounds and ailments" value={draft.wounds} onChange={v => update(d => { d.wounds = v })} multiline />
            <label className="mt-2 flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
              <input type="checkbox" checked={draft.firstAidAttempted} onChange={e => update(d => { d.firstAidAttempted = e.target.checked })} />
              First aid attempted since last injury
            </label>
          </Section>

          <Section title="Armour and gear">
            <TextField label="Armour and gear" value={draft.armorGear} onChange={v => update(d => { d.armorGear = v })} multiline rows={5} />
          </Section>

          <Section title="Weapons" className="lg:col-span-2">
            <ul className="space-y-3">
              {draft.weapons.map((w, i) => (
                <li key={i} className="rounded border border-surface-200 p-2 dark:border-surface-700">
                  <div className="grid gap-2 sm:grid-cols-4">
                    {WEAPON_FIELDS.map(([key, label]) => (
                      <input
                        key={key}
                        aria-label={`Weapon ${i + 1} ${label}`}
                        placeholder={label}
                        value={w[key]}
                        maxLength={100}
                        onChange={e => update(d => { d.weapons[i][key] = e.target.value })}
                        className={INPUT}
                      />
                    ))}
                  </div>
                  <div className="mt-1 text-right">
                    <RemoveButton label={`Remove weapon ${w.name || i + 1}`} onClick={() => update(d => { d.weapons.splice(i, 1) })} />
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className={`${BTN_SECONDARY} mt-2`} disabled={draft.weapons.length >= LIMITS.weapons} onClick={() => update(d => { d.weapons.push({ ...EMPTY_WEAPON }) })}>
              + Weapon
            </button>
          </Section>

          <Section title="Personal details and notes">
            <TextField label="Personal details and notes" value={draft.notes} onChange={v => update(d => { d.notes = v })} multiline rows={5} />
          </Section>

          <Section title="Developments that affect home and family">
            <TextField label="Developments that affect home and family" value={draft.homeFamily} onChange={v => update(d => { d.homeFamily = v })} multiline rows={5} />
          </Section>
        </div>
      </EditorFrame>
    </form>
  )
}

// ---------------------------------------------------------------------------
// NPC stat block editor
// ---------------------------------------------------------------------------

export function NpcBlockEditor({ sheet, saving, onCancel, onSave }: EditorProps<NpcBlock>) {
  const [draft, update] = useDraft(sheet)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateSheet(draft)
    setError(problem)
    if (!problem) onSave(draft)
  }

  return (
    <form onSubmit={submit} aria-label="Edit stat block" className="space-y-3">
      <EditorFrame error={error} saving={saving} onCancel={onCancel}>
        <p className="text-xs text-surface-600 dark:text-surface-400">Fill in only what you need; blank statistics are skipped.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Statistics">
            <StatsEditor sheet={draft} update={update} withFeatures={false} />
          </Section>
          <Section title="Derived attributes">
            <DerivedEditor sheet={draft} update={update} />
          </Section>
          <Section title="Armour">
            <TextField label="Armour" value={draft.armor} onChange={v => update(d => { d.armor = v })} />
          </Section>
          <Section title="Skills">
            <TextField label="Skills" value={draft.skills} onChange={v => update(d => { d.skills = v })} multiline />
            <p className="mt-1 text-xs text-surface-500">E.g. Alertness 60%, Firearms 50%, Persuade 40%.</p>
          </Section>
          <Section title="Attacks">
            <TextField label="Attacks" value={draft.attacks} onChange={v => update(d => { d.attacks = v })} multiline />
          </Section>
          <Section title="Notes">
            <TextField label="Notes" value={draft.notes} onChange={v => update(d => { d.notes = v })} multiline />
          </Section>
        </div>
      </EditorFrame>
    </form>
  )
}
