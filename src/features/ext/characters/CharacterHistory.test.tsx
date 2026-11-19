import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HistoryEntry } from './CharacterHistory'
import type { CharacterEvent } from './characterModel'

const edited: CharacterEvent = { id: 'e1', eventType: 'field_edited', details: { action: 'edited', label: 'Occupation', old_label: 'Occupation', old_body: 'Cop', new_body: '' }, note: null, visibility: 'gm', actorId: 'u1', createdAt: '2026-11-18T10:00:00Z' }
const role: CharacterEvent = { id: 'e2', eventType: 'role_changed', details: { from: { kind: 'pc', in_play: true, owner_id: 'u1' }, to: { kind: 'pc', in_play: false, owner_id: 'u1' } }, note: 'Sidelined', visibility: 'owner', actorId: null, createdAt: '2026-11-17T10:00:00Z' }
const note: CharacterEvent = { id: 'e3', eventType: 'note', details: {}, note: 'Met the cultist', visibility: 'gm', actorId: 'gm', createdAt: '2026-11-16T10:00:00Z' }

const nameOf = (id: string) => (id === 'u1' ? 'Sam' : 'GM')

describe('HistoryEntry', () => {
  it('shows an edit with its author, GM-only marker and details for the GM', () => {
    render(<HistoryEntry event={edited} isGM nameOf={nameOf} extra={<span>extra line</span>} />)
    expect(screen.getByText('Edited "Occupation".')).toBeInTheDocument()
    expect(screen.getByText('by Sam')).toBeInTheDocument()
    expect(screen.getByText('extra line')).toBeInTheDocument()
    expect(screen.getByText('GM only')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Show the change'))
    expect(screen.getByText('Cop')).toBeInTheDocument()
    expect(screen.getByText('(empty)')).toBeInTheDocument()
  })

  it('shows the note of a role change and old GM notes', () => {
    const { unmount } = render(<HistoryEntry event={role} isGM={false} nameOf={nameOf} />)
    expect(screen.getByText('"Sidelined"')).toBeInTheDocument()
    unmount()
    render(<HistoryEntry event={note} isGM nameOf={nameOf} />)
    expect(screen.getByText('Note:')).toBeInTheDocument()
    expect(screen.getByText('Met the cultist')).toBeInTheDocument()
  })

  it('hides change details and markers from players', () => {
    render(<HistoryEntry event={edited} isGM={false} nameOf={nameOf} />)
    expect(screen.queryByText('Show the change')).not.toBeInTheDocument()
    expect(screen.queryByText('GM only')).not.toBeInTheDocument()
  })

  it('lists sheet changes with readable labels for the GM', () => {
    const sheetEvent: CharacterEvent = {
      id: 's1',
      eventType: 'sheet_edited',
      details: {
        action: 'edited',
        total: 65,
        changes: [
          { path: 'stats.pow.score', from: '12', to: '11' },
          { path: 'personal.profession', from: '', to: 'FBI' },
          { path: 'skills.art:x.key', from: null, to: 'art' },
        ],
      },
      note: null,
      visibility: 'gm',
      actorId: 'u1',
      createdAt: '2026-11-18T10:00:00Z',
    }
    const { unmount } = render(<HistoryEntry event={sheetEvent} isGM nameOf={nameOf} />)
    expect(screen.getByText('Sheet edited (65 changes).')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Show the changes'))
    expect(screen.getByText('POW:')).toBeInTheDocument()
    expect(screen.getByText('Profession:')).toBeInTheDocument()
    expect(screen.getByText('(empty)')).toBeInTheDocument()
    expect(screen.queryByText(/Art/)).not.toBeInTheDocument()
    expect(screen.getByText('…and 62 more.')).toBeInTheDocument()
    unmount()
    render(<HistoryEntry event={sheetEvent} isGM={false} nameOf={nameOf} />)
    expect(screen.queryByText('Show the changes')).not.toBeInTheDocument()
  })
})
