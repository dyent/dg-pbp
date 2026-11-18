import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CharacterHistory } from './CharacterHistory'
import type { CharacterEvent } from './characterModel'

const events: CharacterEvent[] = [
  { id: 'e1', eventType: 'field_edited', details: { action: 'edited', label: 'Occupation', old_label: 'Occupation', old_body: 'Cop', new_body: '' }, note: null, visibility: 'gm', actorId: 'u1', createdAt: '2026-11-18T10:00:00Z' },
  { id: 'e2', eventType: 'role_changed', details: { from: { kind: 'pc', in_play: true, owner_id: 'u1' }, to: { kind: 'pc', in_play: false, owner_id: 'u1' } }, note: 'Sidelined', visibility: 'owner', actorId: null, createdAt: '2026-11-17T10:00:00Z' },
  { id: 'e3', eventType: 'note', details: {}, note: 'Met the cultist', visibility: 'gm', actorId: 'gm', createdAt: '2026-11-16T10:00:00Z' },
]

const nameOf = (id: string) => (id === 'u1' ? 'Sam' : 'GM')

describe('CharacterHistory', () => {
  it('lists entries with author, notes and GM-only markers for the GM', () => {
    render(<CharacterHistory events={events} isGM canAddNote nameOf={nameOf} onAddNote={vi.fn()} />)
    expect(screen.getByText('Edited "Occupation".')).toBeInTheDocument()
    expect(screen.getByText('by Sam')).toBeInTheDocument()
    expect(screen.getByText('"Sidelined"')).toBeInTheDocument()
    expect(screen.getByText('Met the cultist')).toBeInTheDocument()
    expect(screen.getAllByText('GM only')).toHaveLength(2)
    fireEvent.click(screen.getByText('Show the change'))
    expect(screen.getByText('Cop')).toBeInTheDocument()
    expect(screen.getByText('(empty)')).toBeInTheDocument()
  })

  it('hides change details and the note box from players', () => {
    render(<CharacterHistory events={events} isGM={false} canAddNote nameOf={nameOf} onAddNote={vi.fn()} />)
    expect(screen.queryByText('Show the change')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('New history note')).not.toBeInTheDocument()
    expect(screen.queryByText('GM only')).not.toBeInTheDocument()
  })

  it('shows an empty state', () => {
    render(<CharacterHistory events={[]} isGM canAddNote={false} nameOf={nameOf} onAddNote={vi.fn()} />)
    expect(screen.getByText('No history yet.')).toBeInTheDocument()
    expect(screen.queryByLabelText('New history note')).not.toBeInTheDocument()
  })

  it('adds a note and clears the box on success only', async () => {
    const onAddNote = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<CharacterHistory events={[]} isGM canAddNote nameOf={nameOf} onAddNote={onAddNote} />)
    const box = screen.getByLabelText('New history note')
    fireEvent.submit(box.closest('form')!)
    expect(onAddNote).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: 'Owes the GM a favour' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(onAddNote).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add note' })).not.toBeDisabled())
    expect(box).toHaveValue('Owes the GM a favour')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(box).toHaveValue(''))
  })
})
