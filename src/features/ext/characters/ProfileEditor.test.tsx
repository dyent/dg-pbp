import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProfileEditor } from './ProfileEditor'
import { useImageUpload } from '../../../hooks/useImageUpload'
import type { CharacterField, CharacterSummary } from './characterModel'

vi.mock('../../../hooks/useImageUpload', () => ({ useImageUpload: vi.fn() }))
vi.mock('../../chat/IconPicker', () => ({
  IconPicker: ({ onPick, onClose }: { onPick: (u: string) => void; onClose: () => void }) => (
    <div>
      <button type="button" onClick={() => onPick('https://icon/x.svg')}>Pick icon</button>
      <button type="button" onClick={onClose}>Close picker</button>
    </div>
  ),
}))

const character: CharacterSummary = {
  id: 'c1', kind: 'pc', inPlay: true, name: 'Agent Reyes', portraitUrl: 'https://img/r.png', status: 'active', ownerId: 'u1', isMine: true, updatedAt: 't',
}

function f(id: string, overrides: Partial<CharacterField> = {}): CharacterField {
  return { id, characterId: 'c1', channelId: 'ch1', itemType: 'field', fieldKey: null, label: id, body: '', visibility: 'players', private: false, sortOrder: 10, ...overrides }
}

const fields = [
  f('Occupation', { fieldKey: 'occupation', sortOrder: 10 }),
  f('Appearance', { fieldKey: 'appearance', sortOrder: 20 }),
  f('Secrets', { fieldKey: 'secrets', visibility: 'owner', private: true, sortOrder: 10 }),
]

const uploadImage = vi.fn()

function setup(overrides: Partial<Omit<React.ComponentProps<typeof ProfileEditor>, 'onSave' | 'onCancel'>> = {}) {
  const props = { channelId: 'ch1', character, fields, isGM: false, saving: false, onCancel: vi.fn(), onSave: vi.fn(), ...overrides }
  render(<ProfileEditor {...props} />)
  return props
}

const section = (name: string) => screen.getByRole('region', { name: `${name} fields` })

describe('ProfileEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useImageUpload).mockReturnValue({ uploadEnabled: true, settingsLoading: false, uploading: false, uploadImage })
  })

  it('shows only Everyone and Owner columns to an owner', () => {
    setup()
    expect(section('Everyone')).toBeInTheDocument()
    expect(section('Owner')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'GM only fields' })).not.toBeInTheDocument()
    const options = within(section('Owner')).getByLabelText('Who sees Secrets').querySelectorAll('option')
    expect([...options].map(o => o.textContent)).toEqual(['Everyone', 'Owner'])
    // Standard fields can't be removed by the owner.
    expect(screen.queryByLabelText('Remove Occupation')).not.toBeInTheDocument()
  })

  it('shows the GM column to the GM and lets them remove standard fields', () => {
    setup({ isGM: true })
    expect(section('GM only')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove Occupation')).toBeInTheDocument()
  })

  it('saves edits, additions, moves and removals as one change set', () => {
    const props = setup()
    fireEvent.change(screen.getByLabelText('Occupation text'), { target: { value: 'FBI' } })
    fireEvent.click(screen.getByLabelText('Move Appearance up'))
    fireEvent.click(within(section('Owner')).getByRole('button', { name: '+ Heading' }))
    fireEvent.click(within(section('Everyone')).getByRole('button', { name: '+ Field' }))
    fireEvent.change(screen.getByDisplayValue('New field'), { target: { value: 'Family' } })
    fireEvent.click(screen.getByLabelText('Remove Family'))
    fireEvent.click(screen.getByLabelText('Private (stays hidden after the character leaves play)'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(props.onSave).toHaveBeenCalledTimes(1)
    const { name, portraitUrl, changes } = props.onSave.mock.calls[0][0]
    expect(name).toBe('Agent Reyes')
    expect(portraitUrl).toBe('https://img/r.png')
    expect(changes.deletes).toEqual([])
    expect(changes.updates).toEqual(
      expect.arrayContaining([
        { id: 'Occupation', patch: { body: 'FBI', sort_order: 20 } },
        { id: 'Appearance', patch: { sort_order: 10 } },
        { id: 'Secrets', patch: { private: false } },
      ]),
    )
    expect(changes.inserts).toEqual([{ item_type: 'heading', label: 'New heading', body: '', visibility: 'owner', private: false, sort_order: 20 }])
  })

  it('moves a field to another column', () => {
    const props = setup()
    fireEvent.change(screen.getByLabelText('Who sees Occupation'), { target: { value: 'owner' } })
    expect(within(section('Owner')).getByDisplayValue('Occupation')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Move Occupation down'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave.mock.calls[0][0].changes.updates).toContainEqual({ id: 'Occupation', patch: { visibility: 'owner', sort_order: 20 } })
  })

  it('blocks saving without a name or with an untitled field', () => {
    const props = setup()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Edit character' }))
    expect(screen.getByRole('alert')).toHaveTextContent('needs a name')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Reyes' } })
    fireEvent.change(screen.getByDisplayValue('Occupation'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('needs a title')
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('warns when a PC name is longer than posts can show', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Special Agent Maria Reyes' } })
    expect(screen.getByText(/Posts show only the first 20 characters/)).toBeInTheDocument()
  })

  it('picks an icon, removes the portrait, and cancels', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close picker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick icon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave.mock.calls[0][0].portraitUrl).toBe('https://icon/x.svg')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave.mock.calls[1][0].portraitUrl).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('uploads a portrait into the character folder', async () => {
    uploadImage.mockResolvedValue('ch1/character/abc.jpg')
    const props = setup()
    const file = new File(['x'], 'p.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Upload portrait'), { target: { files: [file] } })
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(file, 'character'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onSave.mock.calls[0][0].portraitUrl).toBe('ch1/character/abc.jpg'))
  })

  it('shows upload errors and ignores an empty pick', async () => {
    uploadImage.mockRejectedValue(new Error('Image is too large'))
    setup()
    fireEvent.change(screen.getByLabelText('Upload portrait'), { target: { files: [] } })
    expect(uploadImage).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Upload portrait'), { target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Image is too large')
  })

  it('falls back to a generic upload error', async () => {
    uploadImage.mockRejectedValue('weird')
    setup()
    fireEvent.change(screen.getByLabelText('Upload portrait'), { target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Image upload failed')
  })

  it('disables uploads when the server has them off, and shows saving state', () => {
    vi.mocked(useImageUpload).mockReturnValue({ uploadEnabled: false, settingsLoading: false, uploading: false, uploadImage })
    setup({ saving: true })
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('gives NPCs Everyone and GM only columns', () => {
    setup({ isGM: true, character: { ...character, kind: 'npc', ownerId: null, isMine: false }, fields: [f('Notes', { visibility: 'gm' })] })
    expect(screen.queryByRole('region', { name: 'Owner fields' })).not.toBeInTheDocument()
    expect(within(section('GM only')).getByDisplayValue('Notes')).toBeInTheDocument()
    expect(screen.queryByText(/Posts show only/)).not.toBeInTheDocument()
  })
})
