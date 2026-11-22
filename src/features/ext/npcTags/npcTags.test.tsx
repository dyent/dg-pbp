// cspell:words npcalias recalias
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageComposer } from '../../chat/MessageComposer'
import { PostBody, isLongPost } from '../activity/PostBody'
import { aliasTagId, fetchNpcLabels, listAliasTags, listTaggableNpcs, listTaggableRecords } from './npcTagApi'
import { NpcTagProvider, useNpcTags } from './npcTagContext'
import { NpcTagChip } from './NpcTags'
import { NpcTagButton } from './NpcComposerParts'
import { onCharacterRequest } from './characterOpener'
import { onRecordRequest } from '../records/recordOpener'
import type { NpcTagOption } from './npcTagModel'

// The composer needs the same stubs as upstream's own composer tests.
vi.mock('../../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadEnabled: false, settingsLoading: false, uploading: false, uploadImage: vi.fn() }),
}))
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'gm-1' } }),
}))

const panelProps: Record<string, unknown>[] = []
vi.mock('../characters/CharactersPanel', async () => {
  const { useContext } = await import('react')
  const { OpenCharacterContext } = await import('./characterOpener')
  return {
    CharactersPanel: (props: Record<string, unknown>) => {
      panelProps.push(props)
      // Stands in for a tag inside the panel (e.g. in the Activity tab).
      const openInPanel = useContext(OpenCharacterContext)
      return (
        <button type="button" onClick={() => openInPanel?.('00000000-0000-0000-0000-00000000a002')}>
          tag in panel
        </button>
      )
    },
  }
})

vi.mock('./npcTagApi', () => ({
  listTaggableNpcs: vi.fn(),
  listTaggableRecords: vi.fn(),
  fetchNpcLabels: vi.fn(),
  listAliasTags: vi.fn(),
  aliasTagId: vi.fn(),
}))

const GM = 'gm-1'
const PLAYER = 'player-1'
const HALE = '00000000-0000-0000-0000-00000000a001'
const HIDDEN = '00000000-0000-0000-0000-00000000a009'
const TAG = '00000000-0000-0000-0000-00000000b001'
const visible: NpcTagOption[] = [{ id: HALE, name: 'Dr Hale', portraitUrl: null, aliases: ['The Stranger'] }]

function Provider({ children, isGM = true }: { children: ReactNode; isGM?: boolean }) {
  return (
    <NpcTagProvider channelId="c1" isGM={isGM} myUserId={isGM ? GM : PLAYER}>
      {children}
    </NpcTagProvider>
  )
}

/** A post as the Activity tab shows it (the chat uses the same chips). */
function Post({ text, isGM = true }: { text: string; isGM?: boolean }) {
  return (
    <Provider isGM={isGM}>
      <PostBody content={text} collapsed={false} />
    </Provider>
  )
}

beforeEach(() => {
  vi.mocked(listTaggableNpcs).mockResolvedValue(visible)
  vi.mocked(listTaggableRecords).mockResolvedValue([])
  vi.mocked(fetchNpcLabels).mockResolvedValue([])
  vi.mocked(listAliasTags).mockResolvedValue([{ id: TAG, targetId: HALE, alias: 'The Stranger' }])
  vi.mocked(aliasTagId).mockResolvedValue(TAG)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('NPC tags in posts', () => {
  it('shows every tag as a name chip, at the start of a line or not', async () => {
    render(<Post text={`Hale looks up.\n[Dr Hale](npc:${HALE}): The body was moved.\nShe glances at [Dr Hale](npc:${HALE}).`} />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Dr Hale/ })).toHaveLength(2))
  })

  it('opens the profile of an NPC the viewer can see', async () => {
    const listener = vi.fn()
    const stop = onCharacterRequest(listener)
    render(<Post text={`[Dr Hale](npc:${HALE}) Hello.`} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dr Hale' }))
    stop()
    expect(listener).toHaveBeenCalledWith(HALE)
  })

  it('asks once for the name and portrait of a hidden NPC and shows it without a link', async () => {
    vi.mocked(fetchNpcLabels).mockResolvedValue([{ id: HIDDEN, name: 'Moreau', portraitUrl: null }])
    render(<Post text={`[Old name](npc:${HIDDEN}) Hello.\n[Old name](npc:${HIDDEN}) Again.`} />)
    await waitFor(() => expect(screen.getAllByText('Moreau')).toHaveLength(2))
    expect(fetchNpcLabels).toHaveBeenCalledTimes(1)
    expect(fetchNpcLabels).toHaveBeenCalledWith('c1', [HIDDEN])
    expect(screen.queryByRole('button', { name: /Moreau/ })).toBeNull()
  })

  it('shows an alias as written; the GM can open the NPC behind it', async () => {
    const listener = vi.fn()
    const stop = onCharacterRequest(listener)
    render(<Post text={`[The Stranger](npcalias:${TAG}) nods.`} />)
    const chip = await screen.findByRole('button', { name: 'The Stranger' })
    expect(chip).toHaveAttribute('title', 'Alias of Dr Hale')
    fireEvent.click(chip)
    stop()
    expect(listener).toHaveBeenCalledWith(HALE)
  })

  it('gives players nothing but the alias text', async () => {
    render(<Post isGM={false} text={`[The Stranger](npcalias:${TAG}) nods.`} />)
    await waitFor(() => expect(listTaggableNpcs).toHaveBeenCalled())
    expect(listAliasTags).not.toHaveBeenCalled()
    expect(screen.getByText('The Stranger')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'The Stranger' })).toBeNull()
  })

  it('falls back to the written name outside a campaign', () => {
    render(<NpcTagChip href={`npc:${HALE}`}>Dr Hale</NpcTagChip>)
    expect(screen.getByText('Dr Hale')).toBeInTheDocument()
  })

  it('logs and carries on when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listTaggableNpcs).mockRejectedValue(new Error('offline'))
    vi.mocked(fetchNpcLabels).mockRejectedValue(new Error('offline'))
    render(<Post text={`[Dr Hale](npc:${HALE}) Hello.`} />)
    await waitFor(() => expect(error).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Dr Hale')).toBeInTheDocument()
    error.mockRestore()
  })
})

describe('record tags', () => {
  const MORGUE = '00000000-0000-0000-0000-00000000c001'
  const GLOVE = '00000000-0000-0000-0000-00000000c002'
  const REC_TAG = '00000000-0000-0000-0000-00000000b002'
  const morgue: NpcTagOption = { id: MORGUE, name: 'County morgue', portraitUrl: null, recordKind: 'location', aliases: ['The Slab'] }

  beforeEach(() => {
    vi.mocked(listTaggableRecords).mockResolvedValue([morgue])
    vi.mocked(listAliasTags).mockResolvedValue([{ id: REC_TAG, targetId: MORGUE, alias: 'The Slab' }])
  })

  it('shows a record the viewer can see as a chip with its current name, and opens it in the Case file', async () => {
    const listener = vi.fn()
    const stop = onRecordRequest(listener)
    const opened = vi.fn()
    const stopCharacters = onCharacterRequest(opened)
    render(<Post text={`At the [Morgue](rec:${MORGUE}).`} />)
    fireEvent.click(await screen.findByRole('button', { name: 'County morgue' }))
    stop()
    stopCharacters()
    expect(listener).toHaveBeenCalledWith(MORGUE)
    expect(opened).not.toHaveBeenCalled()
  })

  it('leaves records the viewer cannot see as plain text, without asking for labels', async () => {
    render(<Post isGM={false} text={`Found a [Bloody glove](rec:${GLOVE}) and [The Slab](recalias:${REC_TAG}).`} />)
    await waitFor(() => expect(listTaggableRecords).toHaveBeenCalled())
    expect(screen.getByText(/Found a Bloody glove and The Slab\./)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(fetchNpcLabels).not.toHaveBeenCalled()
  })

  it('shows a record alias as written; the GM can open the record behind it', async () => {
    render(<Post text={`The [The Slab](recalias:${REC_TAG}) is cold.`} />)
    const chip = await screen.findByRole('button', { name: 'The Slab' })
    expect(chip).toHaveAttribute('title', 'Alias of County morgue')
  })

  it('keeps NPC tags working when records fail to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listTaggableRecords).mockRejectedValue(new Error('offline'))
    render(<Post text={`[Dr Hale](npc:${HALE}) Hello.`} />)
    expect(await screen.findByRole('button', { name: 'Dr Hale' })).toBeInTheDocument()
    expect(error).toHaveBeenCalledWith('Failed to load record tags:', expect.any(Error))
    error.mockRestore()
  })

  it('lists records in the composer with their kind and sends rec: and recalias: links', async () => {
    vi.mocked(listAliasTags).mockResolvedValue([])
    vi.mocked(aliasTagId).mockResolvedValue(REC_TAG)
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(
      <Provider>
        <MessageComposer channelId="c1" isGM members={[]} onSendMessage={onSend} />
      </Provider>,
    )
    const box = screen.getByRole('combobox', { name: 'Message' })
    await waitFor(() => expect(listTaggableRecords).toHaveBeenCalled())
    fireEvent.change(box, { target: { value: 'At the @Cou' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /County morgue\s*Location/ }))
    expect(box).toHaveValue('At the @County morgue ')
    fireEvent.change(box, { target: { value: '@County morgue, the @Th' } })
    expect(screen.getByRole('option', { name: /The Slab\s*alias of County morgue/ })).toBeInTheDocument()
    fireEvent.change(box, { target: { value: '@County morgue, aka @The Slab' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(aliasTagId).toHaveBeenCalledWith(morgue, 'The Slab')
    expect(onSend.mock.calls[0][0].content).toBe(`[County morgue](rec:${MORGUE}), aka [The Slab](recalias:${REC_TAG})`)
  })
})

describe('Activity post body', () => {
  it('keeps the formatting and turns chat-only links into words', async () => {
    const { container } = render(
      <Post text={'**Bold** and *soft*\n- one\n- two\n\nAsk [@Sam](user:u1) to roll [1d6](dice:1d6), see [site](https://x.test) or [bad](javascript:alert(1))'} />,
    )
    await waitFor(() => expect(listTaggableNpcs).toHaveBeenCalled())
    expect(container.querySelector('strong')).toHaveTextContent('Bold')
    expect(container.querySelector('em')).toHaveTextContent('soft')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('@Sam').tagName).toBe('SPAN')
    expect(screen.getByText('1d6').tagName).toBe('SPAN')
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('href', 'https://x.test')
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
  })

  it('collapses long posts', () => {
    expect(isLongPost('short')).toBe(false)
    expect(isLongPost('x'.repeat(401))).toBe(true)
    expect(isLongPost('1\n2\n3\n4\n5\n6\n7')).toBe(true)
    render(<PostBody content="text" collapsed />)
    expect(screen.getByTestId('activity-post-body')).toHaveClass('max-h-28')
  })
})

describe('provider reload', () => {
  it('reloads names after the Characters panel closes', async () => {
    let reload: () => void = () => {}
    function Grab() {
      reload = useNpcTags()!.reload
      return null
    }
    render(
      <Provider>
        <Grab />
      </Provider>,
    )
    await waitFor(() => expect(listTaggableNpcs).toHaveBeenCalledTimes(1))
    act(() => reload())
    await waitFor(() => expect(listTaggableNpcs).toHaveBeenCalledTimes(2))
  })
})

describe('composer', () => {
  function Composer({ onSend, isGM = true }: { onSend: (p: { content: string }) => Promise<void>; isGM?: boolean }) {
    return (
      <Provider isGM={isGM}>
        <MessageComposer channelId="c1" isGM={isGM} members={[]} onSendMessage={onSend} />
      </Provider>
    )
  }

  beforeEach(() => localStorage.clear())

  it('lists NPCs after @ and sends the tag as a link', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<Composer onSend={onSend} />)
    const box = screen.getByRole('combobox', { name: 'Message' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tag an NPC or record' })).toBeInTheDocument())
    fireEvent.change(box, { target: { value: 'Hi @Dr' } })
    const option = screen.getByRole('option', { name: /Dr Hale\s*NPC/ })
    fireEvent.mouseDown(option)
    expect(box).toHaveValue('Hi @Dr Hale ')
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(onSend.mock.calls[0][0].content).toBe(`Hi [Dr Hale](npc:${HALE}) `)
  })

  it('inserts a tag from the toolbar button', async () => {
    render(<Composer onSend={vi.fn()} />)
    const box = screen.getByRole('combobox', { name: 'Message' })
    fireEvent.change(box, { target: { value: 'Hello' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Tag an NPC or record' }))
    fireEvent.click(screen.getByRole('option', { name: /Dr Hale\s*NPC/ }))
    expect(box).toHaveValue('Hello @Dr Hale ')
  })

  it('offers the GM aliases and sends them as alias tags', async () => {
    vi.mocked(listAliasTags).mockResolvedValue([])
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<Composer onSend={onSend} />)
    const box = screen.getByRole('combobox', { name: 'Message' })
    await waitFor(() => expect(listAliasTags).toHaveBeenCalled())
    fireEvent.change(box, { target: { value: '@The' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /The Stranger\s*alias of Dr Hale/ }))
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(aliasTagId).toHaveBeenCalledWith(expect.objectContaining({ id: HALE }), 'The Stranger')
    expect(onSend.mock.calls[0][0].content).toBe(`[The Stranger](npcalias:${TAG}) `)
    // The new id is remembered: the next post needs no lookup.
    fireEvent.change(box, { target: { value: '@The Stranger again' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2))
    expect(aliasTagId).toHaveBeenCalledTimes(1)
  })

  it('sends an alias as plain text if its tag cannot be made', async () => {
    vi.mocked(listAliasTags).mockResolvedValue([])
    vi.mocked(aliasTagId).mockRejectedValue(new Error('offline'))
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<Composer onSend={onSend} />)
    await waitFor(() => expect(listAliasTags).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@The Stranger nods' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(onSend.mock.calls[0][0].content).toBe('@The Stranger nods')
  })
})

describe('NpcTagButton', () => {
  it('is hidden when there are no NPCs to tag', async () => {
    vi.mocked(listTaggableNpcs).mockResolvedValue([])
    render(
      <Provider>
        <NpcTagButton onPick={vi.fn()} />
      </Provider>,
    )
    await waitFor(() => expect(listTaggableNpcs).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Tag an NPC or record' })).toBeNull()
  })

  it('offers a search box for long lists', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `00000000-0000-0000-0000-0000000000${10 + i}`, name: `NPC ${String.fromCharCode(65 + i)}`, portraitUrl: null }))
    vi.mocked(listTaggableNpcs).mockResolvedValue(many)
    const onPick = vi.fn()
    render(
      <Provider>
        <NpcTagButton onPick={onPick} />
      </Provider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Tag an NPC or record' }))
    const search = screen.getByRole('textbox', { name: 'Find an NPC or record' })
    fireEvent.change(search, { target: { value: 'NPC C' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'npc b' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('NPC B')
    fireEvent.click(screen.getByRole('button', { name: 'Tag an NPC or record' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Find an NPC or record' }), { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: 'NPCs and records to tag' })).toBeNull()
  })
})

describe('opening a character from the chat', () => {
  it('opens the Characters entry that listens, on that NPC', async () => {
    const { requestCharacter } = await import('./characterOpener')
    const { CharactersEntry } = await import('../characters/CharactersEntry')
    render(
      <>
        <CharactersEntry channelId="c1" isGM gmId={GM} isArchived={false} myUserId={GM} members={[]} className="" opensFromChat />
        <CharactersEntry channelId="c1" isGM gmId={GM} isArchived={false} myUserId={GM} members={[]} className="" label="NPCs" initialKind="npc" />
      </>,
    )
    act(() => requestCharacter(HALE))
    // Only the listening entry opens.
    expect(panelProps.length).toBeGreaterThan(0)
    expect(panelProps.every(p => p.initialSelectedId === HALE && p.initialKind === 'npc')).toBe(true)
    // Closing it and opening from the menu starts on the list again.
    // A tag inside the open panel switches it (a new key remounts it there).
    panelProps.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'tag in panel' }))
    expect(panelProps.at(-1)).toMatchObject({ initialSelectedId: '00000000-0000-0000-0000-00000000a002' })
    expect(screen.getAllByRole('button', { name: 'tag in panel' })).toHaveLength(1)
    act(() => (panelProps[0].onClose as () => void)())
    panelProps.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Characters' }))
    expect(panelProps.at(-1)).toMatchObject({ initialKind: undefined, initialSelectedId: null })
  })
})
