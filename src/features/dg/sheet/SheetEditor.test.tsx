// cspell:words Lockpicking Glock specialisation Specialisation
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NpcBlockEditor, SheetEditor } from './SheetEditor'
import { NpcBlockView, SheetView } from './SheetView'
import { newAgentSheet, newNpcBlock, type AgentSheet, type NpcBlock } from './sheetModel'

const calc = { hpMax: 12, wpMax: 13, sanStart: 65, sanMax: 99, breakingPointStart: 52 }

function filledSheet(): AgentSheet {
  const s = newAgentSheet()
  s.personal.profession = 'FBI Special Agent'
  Object.assign(s.stats.str, { score: 11 })
  Object.assign(s.stats.con, { score: 12 })
  Object.assign(s.stats.pow, { score: 13, feature: 'Unflappable' })
  Object.assign(s.stats.cha, { score: 9 })
  s.hp = { current: 10, maxOverride: 14 }
  s.wp = { current: 13, maxOverride: null }
  s.san.current = 40
  s.breakingPoint = 52
  s.bonds = [{ name: 'Maya (daughter)', score: 9 }]
  s.adapted = { violence: 3, helplessness: 1 }
  s.skills.firearms = { key: 'firearms', type: '', value: 50, failed: true }
  s.skills['foreign_language:russian'] = { key: 'foreign_language', type: 'Russian', value: 40, failed: false }
  s.training = [{ name: 'Lockpicking', skill: 'Craft' }, { name: 'Parachuting', skill: '' }]
  s.weapons = [{ name: 'Glock 22', skill: '50%', range: '15 m', damage: '1D10', armorPiercing: '', lethality: '', killRadius: '', ammo: '15' }]
  s.firstAidAttempted = true
  s.motivations = 'Protect Maya'
  return s
}

describe('SheetView', () => {
  it('shows statistics, derived values, bonds, adaptation, skills and weapons', () => {
    render(<SheetView sheet={filledSheet()} calc={calc} />)
    expect(screen.getByText('FBI Special Agent')).toBeInTheDocument()
    expect(screen.getByText('65')).toBeInTheDocument() // POW x5
    expect(screen.getByText('Unflappable')).toBeInTheDocument()
    expect(screen.getByText('(calculated: 12)')).toBeInTheDocument() // HP override
    expect(screen.getByText('reached')).toBeInTheDocument() // SAN 40 <= BP 52
    expect(screen.getByText('Maya (daughter)')).toBeInTheDocument()
    expect(screen.getByText('Adapted')).toBeInTheDocument()
    expect(screen.getByLabelText('failed this session')).toBeInTheDocument()
    expect(screen.getByText('Foreign Language (Russian)')).toBeInTheDocument()
    expect(screen.getByText('Glock 22')).toBeInTheDocument()
    expect(screen.getByText('(Craft)')).toBeInTheDocument()
    expect(screen.getByText(/First aid attempted since last injury: Yes/)).toBeInTheDocument()
    expect(screen.getByText('Protect Maya')).toBeInTheDocument()
  })

  it('shows empty states and the starting Breaking Point', () => {
    render(<SheetView sheet={newAgentSheet()} calc={calc} />)
    expect(screen.getByText('(starting value)')).toBeInTheDocument()
    expect(screen.getByText(/First aid attempted since last injury: No/)).toBeInTheDocument()
  })

  it('flags SAN above its maximum', () => {
    const s = filledSheet()
    s.san.current = 99
    render(<SheetView sheet={s} calc={{ ...calc, sanMax: 90 }} />)
    expect(screen.getByText('above maximum')).toBeInTheDocument()
  })

  it('shows an NPC stat block without features or Breaking Point', () => {
    const block: NpcBlock = { ...newNpcBlock(), attacks: 'Scalpel 30%', armor: 'None' }
    block.stats.str.score = 9
    render(<NpcBlockView block={block} calc={calc} />)
    expect(screen.getByText('Scalpel 30%')).toBeInTheDocument()
    expect(screen.queryByText('Breaking Point')).not.toBeInTheDocument()
    expect(screen.queryByText('Distinguishing feature')).not.toBeInTheDocument()
  })
})

function renderEditor(sheet: AgentSheet = newAgentSheet()) {
  const onSave = vi.fn<(s: AgentSheet) => void>()
  const onCancel = vi.fn()
  render(<SheetEditor sheet={sheet} saving={false} onCancel={onCancel} onSave={onSave} />)
  return { onSave, onCancel, saved: () => onSave.mock.calls.at(-1)![0] }
}

const section = (name: string) => screen.getByRole('region', { name })
const tb = (name: string) => screen.getByRole('textbox', { name })

describe('SheetEditor', () => {
  it('calculates derived values live from the statistics', () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Strength'), { target: { value: '11' } })
    fireEvent.change(screen.getByLabelText('Constitution'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Power'), { target: { value: '13' } })
    const derived = section('Derived attributes')
    expect(within(derived).getAllByText('calculated: 12')).toHaveLength(1)
    expect(within(derived).getByText('calculated: 13')).toBeInTheDocument()
    expect(within(derived).getByText(/Starts at 52/)).toBeInTheDocument()
    expect(within(section('Statistics')).getByText('65')).toBeInTheDocument()
  })

  it('fills starting HP, WP and SAN, and recalculates the Breaking Point', () => {
    const { saved } = renderEditor()
    fireEvent.change(screen.getByLabelText('Strength'), { target: { value: '11' } })
    fireEvent.change(screen.getByLabelText('Constitution'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Power'), { target: { value: '13' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start at 12' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start at 13' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start at 65' }))
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate (52)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saved()).toMatchObject({ hp: { current: 12 }, wp: { current: 13 }, san: { current: 65 }, breakingPoint: 52 })
  })

  it('accepts only whole numbers, caps them, and clears to empty', () => {
    const { saved } = renderEditor()
    const pow = screen.getByLabelText('Power')
    fireEvent.change(pow, { target: { value: 'abc' } })
    expect(pow).toHaveValue('')
    fireEvent.change(pow, { target: { value: '150' } })
    expect(pow).toHaveValue('99')
    fireEvent.change(pow, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('HP maximum override'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Current SAN'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saved().stats.pow.score).toBeNull()
    expect(saved().hp.maxOverride).toBe(15)
  })

  it('warns when SAN is above 99 minus Unnatural', () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Unnatural'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Current SAN'), { target: { value: '95' } })
    expect(screen.getByText(/Above the maximum/)).toBeInTheDocument()
  })

  it('edits personal data, text sections and features', () => {
    const { saved } = renderEditor()
    fireEvent.change(screen.getByLabelText('Profession'), { target: { value: 'Nurse' } })
    fireEvent.change(screen.getByLabelText('Employer'), { target: { value: 'CDC' } })
    fireEvent.change(screen.getByLabelText('Power feature'), { target: { value: 'Calm' } })
    for (const label of ['Physical description', 'Motivations and mental disorders', 'Wounds and ailments', 'Armour and gear', 'Personal details and notes', 'Developments that affect home and family']) {
      fireEvent.change(tb(label), { target: { value: `${label} text` } })
    }
    fireEvent.click(screen.getByLabelText('First aid attempted since last injury'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saved()).toMatchObject({
      personal: { profession: 'Nurse', employer: 'CDC' },
      physical: 'Physical description text',
      motivations: 'Motivations and mental disorders text',
      wounds: 'Wounds and ailments text',
      armorGear: 'Armour and gear text',
      notes: 'Personal details and notes text',
      homeFamily: 'Developments that affect home and family text',
      firstAidAttempted: true,
    })
    expect(saved().stats.pow.feature).toBe('Calm')
  })

  it('adds Bonds starting at CHA, edits and removes them', () => {
    const { saved } = renderEditor()
    fireEvent.change(screen.getByLabelText('Charisma'), { target: { value: '11' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Bond' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Bond' }))
    fireEvent.change(screen.getByLabelText('Bond 1 name'), { target: { value: 'Maya' } })
    fireEvent.change(screen.getByLabelText('Bond 2 name'), { target: { value: 'Partner' } })
    fireEvent.change(screen.getByLabelText('Bond 2 score'), { target: { value: '7' } })
    fireEvent.click(screen.getByLabelText('Remove bond Maya'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saved().bonds).toEqual([{ name: 'Partner', score: 7 }])
  })

  it('ticks SAN-loss incidents and failed skills', () => {
    const { saved } = renderEditor()
    fireEvent.click(screen.getByLabelText('Violence incident 2'))
    fireEvent.click(screen.getByLabelText('Helplessness incident 1'))
    fireEvent.click(screen.getByLabelText('Helplessness incident 1'))
    fireEvent.click(screen.getByLabelText('Firearms failed this session'))
    fireEvent.change(screen.getByLabelText('Firearms'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saved().adapted).toEqual({ violence: 2, helplessness: 0 })
    expect(saved().skills.firearms).toMatchObject({ value: 45, failed: true })
  })

  it('adds typed skills at their base value, refuses duplicates and blanks, and removes them', () => {
    const { saved } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: '+ Add skill' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Type a specialisation first')
    fireEvent.change(screen.getByLabelText('Typed skill'), { target: { value: 'foreign_language' } })
    fireEvent.change(screen.getByLabelText('Specialisation'), { target: { value: 'Russian' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add skill' }))
    expect(screen.getByLabelText('Foreign Language (Russian)')).toHaveValue('0')
    fireEvent.change(screen.getByLabelText('Specialisation'), { target: { value: 'russian' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add skill' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already on the sheet')
    fireEvent.change(screen.getByLabelText('Specialisation'), { target: { value: 'Physics' } })
    fireEvent.change(screen.getByLabelText('Typed skill'), { target: { value: 'science' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add skill' }))
    fireEvent.click(screen.getByLabelText('Remove Foreign Language (Russian)'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saved().skills['foreign_language:russian']).toBeUndefined()
    expect(saved().skills['science:physics']).toEqual({ key: 'science', type: 'Physics', value: 0, failed: false })
  })

  it('adds, edits and removes special training and weapons', () => {
    const { saved } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: '+ Training' }))
    fireEvent.change(screen.getByLabelText('Training 1'), { target: { value: 'Lockpicking' } })
    fireEvent.change(screen.getByLabelText('Training 1 skill or stat'), { target: { value: 'DEX' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Training' }))
    fireEvent.click(screen.getByLabelText('Remove training 2'))
    fireEvent.click(screen.getByRole('button', { name: '+ Weapon' }))
    fireEvent.change(screen.getByLabelText('Weapon 1 Weapon'), { target: { value: 'Shotgun' } })
    fireEvent.change(screen.getByLabelText('Weapon 1 Damage'), { target: { value: '2D6' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Weapon' }))
    fireEvent.click(screen.getByLabelText('Remove weapon 2'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saved().training).toEqual([{ name: 'Lockpicking', skill: 'DEX' }])
    expect(saved().weapons).toEqual([expect.objectContaining({ name: 'Shotgun', damage: '2D6' })])
  })

  it('blocks invalid sheets and cancels', () => {
    const { onSave, onCancel } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: '+ Bond' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Every Bond needs a name')
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('keeps the original sheet untouched while editing', () => {
    const original = filledSheet()
    renderEditor(original)
    fireEvent.change(screen.getByLabelText('Power'), { target: { value: '5' } })
    expect(original.stats.pow.score).toBe(13)
    expect(screen.getByRole('button', { name: 'Recalculate (35)' })).toBeInTheDocument()
  })

  it('shows the saving state', () => {
    render(<SheetEditor sheet={newAgentSheet()} saving onCancel={vi.fn()} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})

describe('NpcBlockEditor', () => {
  it('edits a short stat block and validates it', () => {
    const onSave = vi.fn<(s: NpcBlock) => void>()
    render(<NpcBlockEditor sheet={newNpcBlock()} saving={false} onCancel={vi.fn()} onSave={onSave} />)
    expect(screen.queryByLabelText('Power feature')).not.toBeInTheDocument()
    expect(screen.queryByText('Breaking Point')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Strength'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('Constitution'), { target: { value: '10' } })
    fireEvent.change(tb('Armour'), { target: { value: 'Vest (3)' } })
    fireEvent.change(tb('Skills'), { target: { value: 'Firearms 50%' } })
    fireEvent.change(tb('Attacks'), { target: { value: 'Pistol' } })
    fireEvent.change(tb('Notes'), { target: { value: 'Nervous' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start at 10' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0][0]).toMatchObject({ armor: 'Vest (3)', skills: 'Firearms 50%', attacks: 'Pistol', notes: 'Nervous', hp: { current: 10 } })

    fireEvent.change(screen.getByLabelText('Current SAN'), { target: { value: '99' } })
    fireEvent.change(tb('Notes'), { target: { value: 'x'.repeat(4000) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('reports validation problems', () => {
    const onSave = vi.fn()
    const block = newNpcBlock()
    block.hp.current = 1000
    render(<NpcBlockEditor sheet={block} saving={false} onCancel={vi.fn()} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('HP must be between')
    expect(onSave).not.toHaveBeenCalled()
  })
})
