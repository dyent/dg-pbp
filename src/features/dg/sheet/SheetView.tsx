import type { ReactNode } from 'react'
import { BADGE, SECTION_TITLE } from '../../ext/characters/ui'
import { PoolAdjuster } from './PoolAdjuster'
import type { PoolKey, SheetCalc } from './sheetApi'
import {
  STAT_KEYS,
  STAT_LABELS,
  effectiveMax,
  orderedSkills,
  skillLabel,
  times5,
  type AgentSheet,
  type NpcBlock,
  type Pool,
} from './sheetModel'

export function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`rounded-md border border-surface-200 p-3 dark:border-surface-700 ${className}`}>
      <h4 className={`${SECTION_TITLE} mb-2`}>{title}</h4>
      {children}
    </section>
  )
}

const dash = <span className="text-surface-400 dark:text-surface-500">—</span>
const show = (v: string | number | null) => (v === null || v === '' ? dash : v)

function TextBlock({ value }: { value: string }) {
  return value ? <p className="whitespace-pre-wrap break-words text-sm text-surface-900 dark:text-surface-100">{value}</p> : <p className="text-sm">{dash}</p>
}

function Pair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-surface-600 dark:text-surface-400">{label}</dt>
      <dd className="text-sm text-surface-900 dark:text-surface-100">{value}</dd>
    </div>
  )
}

export function StatsTable({ sheet, showFeatures = true }: { sheet: AgentSheet | NpcBlock; showFeatures?: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-surface-500 dark:text-surface-400">
          <th scope="col" className="font-medium">Statistic</th>
          <th scope="col" className="w-14 text-right font-medium">Score</th>
          <th scope="col" className="w-14 text-right font-medium">×5</th>
          {showFeatures && <th scope="col" className="pl-3 font-medium">Distinguishing feature</th>}
        </tr>
      </thead>
      <tbody>
        {STAT_KEYS.map(k => (
          <tr key={k} className="border-t border-surface-100 dark:border-surface-700">
            <th scope="row" className="py-1 text-left font-normal text-surface-700 dark:text-surface-300">
              {STAT_LABELS[k]} <span className="text-xs text-surface-500">({k.toUpperCase()})</span>
            </th>
            <td className="text-right font-medium text-surface-900 dark:text-surface-100">{show(sheet.stats[k].score)}</td>
            <td className="text-right text-surface-700 dark:text-surface-300">{show(times5(sheet.stats[k].score))}</td>
            {showFeatures && <td className="pl-3 text-surface-700 dark:text-surface-300">{sheet.stats[k].feature || ''}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Quick change of a current value from view mode (see PoolAdjuster). */
export type PoolChange = (pool: PoolKey, value: number | null) => void

function Current({
  name,
  pool,
  value,
  startFrom,
  onPoolChange,
}: {
  name: string
  pool: PoolKey
  value: number | null
  startFrom: number | null
  onPoolChange?: PoolChange
}) {
  if (!onPoolChange) return <span className="text-base font-semibold">{show(value)}</span>
  return <PoolAdjuster name={name} value={value} startFrom={startFrom} onCommit={v => onPoolChange(pool, v)} />
}

function PoolLine({
  label,
  name,
  poolKey,
  pool,
  calc,
  onPoolChange,
}: {
  label: string
  name: string
  poolKey: PoolKey
  pool: Pool
  calc: number | null
  onPoolChange?: PoolChange
}) {
  const max = effectiveMax(pool, calc)
  return (
    <Pair
      label={label}
      value={
        <>
          <Current name={name} pool={poolKey} value={pool.current} startFrom={max} onPoolChange={onPoolChange} /> / {show(max)}
          {pool.maxOverride !== null && calc !== null && pool.maxOverride !== calc && (
            <span className="ml-1 text-xs text-surface-500">(calculated: {calc})</span>
          )}
        </>
      }
    />
  )
}

export function DerivedBlock({ sheet, calc, onPoolChange }: { sheet: AgentSheet | NpcBlock; calc: SheetCalc; onPoolChange?: PoolChange }) {
  const san = sheet.san.current
  const bp = sheet.format === 'agent' ? (sheet.breakingPoint ?? calc.breakingPointStart) : null
  return (
    <dl className={`grid grid-cols-2 gap-3 ${onPoolChange ? 'sm:grid-cols-2' : 'sm:grid-cols-4'}`}>
      <PoolLine label="Hit Points (HP)" name="HP" poolKey="hp" pool={sheet.hp} calc={calc.hpMax} onPoolChange={onPoolChange} />
      <PoolLine label="Willpower (WP)" name="WP" poolKey="wp" pool={sheet.wp} calc={calc.wpMax} onPoolChange={onPoolChange} />
      <Pair
        label="Sanity (SAN)"
        value={
          <>
            <Current name="SAN" pool="san" value={san} startFrom={calc.sanStart} onPoolChange={onPoolChange} /> / {show(calc.sanMax)}
            {san !== null && calc.sanMax !== null && san > calc.sanMax && (
              <span className={`${BADGE} ml-1 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`}>above maximum</span>
            )}
          </>
        }
      />
      {sheet.format === 'agent' && (
        <Pair
          label="Breaking Point"
          value={
            <>
              <span className="text-base font-semibold">{show(bp)}</span>
              {sheet.breakingPoint === null && bp !== null && <span className="ml-1 text-xs text-surface-500">(starting value)</span>}
              {san !== null && bp !== null && san <= bp && (
                <span className={`${BADGE} ml-1 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`}>reached</span>
              )}
            </>
          }
        />
      )}
    </dl>
  )
}

/** A change to the sheet's tick boxes, saved straight from the view. */
export type TickChange = (next: AgentSheet) => void

function Ticks({ count, label, onChange }: { count: number; label: string; onChange?: (count: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-surface-800 dark:text-surface-200">
      <span className="w-28">{label}</span>
      {onChange ? (
        <span className="flex gap-1">
          {[1, 2, 3].map(n => (
            <input
              key={n}
              type="checkbox"
              aria-label={`${label} incident ${n}`}
              checked={count >= n}
              onChange={e => onChange(e.target.checked ? n : n - 1)}
              className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:border-surface-600"
            />
          ))}
        </span>
      ) : (
        <span aria-label={`${count} of 3`} className="tracking-widest">
          {[0, 1, 2].map(i => (i < count ? '☒' : '☐')).join('')}
        </span>
      )}
      {count >= 3 && <span className={`${BADGE} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`}>Adapted</span>}
    </div>
  )
}

export function SheetView({
  sheet,
  calc,
  onPoolChange,
  onTick,
}: {
  sheet: AgentSheet
  calc: SheetCalc
  onPoolChange?: PoolChange
  onTick?: TickChange
}) {
  const p = sheet.personal
  const tick = onTick
    ? (change: (draft: AgentSheet) => void) => {
        const next = structuredClone(sheet)
        change(next)
        onTick(next)
      }
    : undefined
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="agent-sheet">
      <Section title="Personal data" className="lg:col-span-2">
        <dl className="grid gap-2 sm:grid-cols-3">
          <Pair label="Profession" value={show(p.profession)} />
          <Pair label="Employer" value={show(p.employer)} />
          <Pair label="Nationality" value={show(p.nationality)} />
          <Pair label="Sex" value={show(p.sex)} />
          <Pair label="Age and date of birth" value={show(p.age)} />
          <Pair label="Education and occupational history" value={show(p.education)} />
        </dl>
      </Section>

      <Section title="Statistics">
        <StatsTable sheet={sheet} />
      </Section>

      <Section title="Derived attributes">
        <DerivedBlock sheet={sheet} calc={calc} onPoolChange={onPoolChange} />
      </Section>

      <Section title="Physical description">
        <TextBlock value={sheet.physical} />
      </Section>

      <Section title="Bonds">
        {sheet.bonds.length === 0 ? (
          <p className="text-sm">{dash}</p>
        ) : (
          <ul className="space-y-1">
            {sheet.bonds.map((b, i) => (
              <li key={i} className="flex justify-between gap-2 text-sm text-surface-900 dark:text-surface-100">
                <span className="break-words">{b.name}</span>
                <span className="font-medium">{show(b.score)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Motivations and mental disorders">
        <TextBlock value={sheet.motivations} />
      </Section>

      <Section title="Incidents of SAN loss without going insane">
        <Ticks
          count={sheet.adapted.violence}
          label="Violence"
          onChange={tick && (n => tick(d => { d.adapted.violence = n }))}
        />
        <Ticks
          count={sheet.adapted.helplessness}
          label="Helplessness"
          onChange={tick && (n => tick(d => { d.adapted.helplessness = n }))}
        />
      </Section>

      <Section title="Skills" className="lg:col-span-2">
        <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {orderedSkills(sheet.skills).map(([id, skill]) => {
            const value = skill.value ?? 0
            return (
              <li
                key={id}
                className={`flex justify-between gap-2 text-sm ${value === 0 ? 'text-surface-400 dark:text-surface-500' : 'text-surface-900 dark:text-surface-100'}`}
              >
                {tick ? (
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      aria-label={`${skillLabel(skill)} failed this session`}
                      title="Failed this session (for the improvement roll)"
                      checked={skill.failed}
                      onChange={e => tick(d => { d.skills[id].failed = e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:border-surface-600"
                    />
                    {skillLabel(skill)}
                  </label>
                ) : (
                  <span>
                    {skill.failed && <span title="Failed this session" aria-label="failed this session">☒ </span>}
                    {skillLabel(skill)}
                  </span>
                )}
                <span className="font-medium">{value}%</span>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="Special training">
        {sheet.training.length === 0 ? (
          <p className="text-sm">{dash}</p>
        ) : (
          <ul className="space-y-1 text-sm text-surface-900 dark:text-surface-100">
            {sheet.training.map((t, i) => (
              <li key={i}>
                {t.name}
                {t.skill && <span className="text-surface-500"> ({t.skill})</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Wounds and ailments">
        <TextBlock value={sheet.wounds} />
        {tick ? (
          <label className="mt-1 flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-400">
            <input
              type="checkbox"
              checked={sheet.firstAidAttempted}
              onChange={e => tick(d => { d.firstAidAttempted = e.target.checked })}
              className="h-3.5 w-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:border-surface-600"
            />
            First aid attempted since last injury
          </label>
        ) : (
          <p className="mt-1 text-xs text-surface-600 dark:text-surface-400">
            First aid attempted since last injury: {sheet.firstAidAttempted ? 'Yes' : 'No'}
          </p>
        )}
      </Section>

      <Section title="Armour and gear">
        <TextBlock value={sheet.armorGear} />
      </Section>

      <Section title="Weapons" className="lg:col-span-2">
        {sheet.weapons.length === 0 ? (
          <p className="text-sm">{dash}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-500 dark:text-surface-400">
                  {['Weapon', 'Skill %', 'Base range', 'Damage', 'Armour piercing', 'Lethality', 'Kill radius', 'Ammo'].map(h => (
                    <th key={h} scope="col" className="pr-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.weapons.map((w, i) => (
                  <tr key={i} className="border-t border-surface-100 text-surface-900 dark:border-surface-700 dark:text-surface-100">
                    {[w.name, w.skill, w.range, w.damage, w.armorPiercing, w.lethality, w.killRadius, w.ammo].map((v, j) => (
                      <td key={j} className="py-1 pr-2">{show(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Personal details and notes">
        <TextBlock value={sheet.notes} />
      </Section>

      <Section title="Developments that affect home and family">
        <TextBlock value={sheet.homeFamily} />
      </Section>
    </div>
  )
}

export function NpcBlockView({ block, calc, onPoolChange }: { block: NpcBlock; calc: SheetCalc; onPoolChange?: PoolChange }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="npc-block">
      <Section title="Statistics">
        <StatsTable sheet={block} showFeatures={false} />
      </Section>
      <Section title="Derived attributes">
        <DerivedBlock sheet={block} calc={calc} onPoolChange={onPoolChange} />
      </Section>
      <Section title="Armour">
        <TextBlock value={block.armor} />
      </Section>
      <Section title="Skills">
        <TextBlock value={block.skills} />
      </Section>
      <Section title="Attacks">
        <TextBlock value={block.attacks} />
      </Section>
      <Section title="Notes">
        <TextBlock value={block.notes} />
      </Section>
    </div>
  )
}
