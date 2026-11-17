// Tests for the FORK-EXT hook points in upstream components (MessageItem,
// RollHistoryModal). Kept in our folder so upstream's test files stay untouched.
// cspell:words Okafor okafor
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageItem } from '../../chat/MessageItem'
import { RollHistoryModal } from '../../dice/RollHistoryModal'
import { useRollHistory } from '../../dice/useRollHistory'
import { PostAuthorshipContext, type AuthorLookup } from './authorshipContext'
import { resolvePostAuthor, toPostingIdentities } from './resolvePostAuthor'

vi.mock('../../dice/useRollHistory', () => ({
  useRollHistory: vi.fn(),
}))

// Sam posted as Reyes until 1 March, then as Okafor (no portrait).
const lookup: AuthorLookup = (userId, createdAt) =>
  resolvePostAuthor(
    toPostingIdentities([
      {
        user_id: 'sam',
        character_id: 'reyes',
        name: 'Reyes',
        portrait_url: 'https://example.com/reyes.png',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: '2026-03-01T00:00:00Z',
      },
      {
        user_id: 'sam',
        character_id: 'okafor',
        name: 'Okafor',
        portrait_url: null,
        started_at: '2026-03-01T00:00:00Z',
        ended_at: null,
      },
    ]),
    userId,
    createdAt,
  )

// The membership row always shows the *current* character (upstream behavior).
const members = [{ user_id: 'sam', character_name: 'Okafor', character_avatar_url: null }]

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    type: 'regular',
    content: 'We should check the morgue.',
    created_at: '2026-02-01T12:00:00Z',
    sender_id: 'sam',
    sender: { display_name: 'Sam', avatar_url: 'https://example.com/account.png' },
    ...overrides,
  } as any
}

function renderPost(message: any, withAgents = true) {
  const item = (
    <MessageItem message={message} currentUserId="someone" isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} members={members} />
  )
  return render(withAgents ? <PostAuthorshipContext.Provider value={lookup}>{item}</PostAuthorshipContext.Provider> : item)
}

describe('MessageItem character authorship (FORK-EXT)', () => {
  it('labels an old post with the character active when it was written, not the current one', () => {
    const { container } = renderPost(post())
    expect(screen.getByText('Reyes')).toBeInTheDocument()
    expect(screen.queryByText('Okafor')).not.toBeInTheDocument()
    expect(container.querySelector('img[src="https://example.com/reyes.png"]')).not.toBeNull()
  })

  it('labels a recent post with the current character', () => {
    renderPost(post({ created_at: '2026-04-01T12:00:00Z' }))
    expect(screen.getByText('Okafor')).toBeInTheDocument()
  })

  it('shows the account picture when the character has no portrait', () => {
    const { container } = renderPost(post({ created_at: '2026-04-01T12:00:00Z' }))
    expect(container.querySelector('img[src="https://example.com/account.png"]')).not.toBeNull()
  })

  it('keeps NPC posts attributed to the NPC', () => {
    renderPost(post({ type: 'npc', npc_name: 'Dr Hale', npc_avatar_url: null }))
    expect(screen.getByText('Dr Hale')).toBeInTheDocument()
    expect(screen.queryByText('Reyes')).not.toBeInTheDocument()
  })

  it('falls back to the upstream name for posts before the player had an character', () => {
    renderPost(post({ created_at: '2025-06-01T12:00:00Z' }))
    expect(screen.getByText('Okafor')).toBeInTheDocument()
  })

  it('behaves exactly like upstream outside a campaign view', () => {
    renderPost(post(), false)
    expect(screen.getByText('Okafor')).toBeInTheDocument()
  })
})

describe('RollHistoryModal character authorship (FORK-EXT)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRollHistory).mockReturnValue({
      rolls: [
        {
          id: 'r1',
          notation: '1d100',
          result: 42,
          breakdown: { rolls: [42] },
          created_at: '2026-02-01T12:00:00Z',
          roller_id: 'sam',
          roller_character_name: 'Okafor',
          roller: { character_name: 'Okafor' },
          sub_channel_id: null,
          sub_channel_name: null,
        },
      ],
      loading: false,
      error: null,
    } as any)
  })

  it('labels a roll with the character active when it was rolled', () => {
    render(
      <PostAuthorshipContext.Provider value={lookup}>
        <RollHistoryModal channelId="c1" onClose={vi.fn()} />
      </PostAuthorshipContext.Provider>,
    )
    expect(screen.getByText('Reyes')).toBeInTheDocument()
  })

  it('keeps the upstream label outside a campaign view', () => {
    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)
    expect(screen.getByText('Okafor')).toBeInTheDocument()
  })
})
