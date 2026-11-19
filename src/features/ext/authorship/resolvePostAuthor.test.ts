// cspell:words Okafor okafor
import { describe, it, expect } from 'vitest'
import { resolvePostAuthor, toPostingIdentities, type PostingIdentity } from './resolvePostAuthor'

const sam = 'user-sam'
const jo = 'user-jo'

const identities: PostingIdentity[] = toPostingIdentities([
  {
    user_id: sam,
    character_id: 'reyes',
    name: 'Reyes',
    portrait_url: 'https://example.com/reyes.png',
    started_at: '2026-01-01T00:00:00Z',
    ended_at: '2026-03-01T00:00:00Z',
  },
  {
    user_id: sam,
    character_id: 'okafor',
    name: 'Okafor',
    portrait_url: null,
    started_at: '2026-03-01T00:00:00Z',
    ended_at: null,
  },
  {
    user_id: jo,
    character_id: 'vance',
    name: 'Character Vance',
    portrait_url: '',
    started_at: '2026-02-01T00:00:00Z',
    ended_at: '2026-02-10T00:00:00Z',
  },
])

describe('toPostingIdentities', () => {
  it('converts timestamps to epoch milliseconds and keeps open periods open', () => {
    expect(identities[0]).toEqual({
      userId: sam,
      characterId: 'reyes',
      name: 'Reyes',
      portraitUrl: 'https://example.com/reyes.png',
      startedAt: Date.parse('2026-01-01T00:00:00Z'),
      endedAt: Date.parse('2026-03-01T00:00:00Z'),
    })
    expect(identities[1].endedAt).toBeNull()
  })

  it('treats an empty portrait as no portrait', () => {
    expect(identities[2].portraitUrl).toBeNull()
  })

  it('drops rows with an unreadable start time', () => {
    const rows = toPostingIdentities([
      { user_id: sam, character_id: 'x', name: 'X', portrait_url: null, started_at: 'not a date', ended_at: null },
    ])
    expect(rows).toEqual([])
  })
})

describe('resolvePostAuthor', () => {
  it('finds the character of a closed period', () => {
    expect(resolvePostAuthor(identities, sam, '2026-02-15T12:00:00Z')).toEqual({
      characterId: 'reyes',
      name: 'Reyes',
      portraitUrl: 'https://example.com/reyes.png',
    })
  })

  it('finds the character of the open period', () => {
    expect(resolvePostAuthor(identities, sam, '2026-06-01T00:00:00Z')?.name).toBe('Okafor')
  })

  it('gives a post at the exact switch moment to the new character', () => {
    expect(resolvePostAuthor(identities, sam, '2026-03-01T00:00:00Z')?.name).toBe('Okafor')
  })

  it('includes the first instant of a period', () => {
    expect(resolvePostAuthor(identities, sam, '2026-01-01T00:00:00Z')?.name).toBe('Reyes')
  })

  it('returns null before the player had any character', () => {
    expect(resolvePostAuthor(identities, sam, '2025-12-31T23:59:59Z')).toBeNull()
  })

  it('returns null after a closed period with no later one', () => {
    expect(resolvePostAuthor(identities, jo, '2026-02-20T00:00:00Z')).toBeNull()
  })

  it("only considers the post author's own periods", () => {
    expect(resolvePostAuthor(identities, jo, '2026-02-05T00:00:00Z')?.name).toBe('Character Vance')
    expect(resolvePostAuthor(identities, 'someone-else', '2026-02-05T00:00:00Z')).toBeNull()
  })

  it('returns null for missing or unreadable inputs', () => {
    expect(resolvePostAuthor(identities, null, '2026-02-05T00:00:00Z')).toBeNull()
    expect(resolvePostAuthor(identities, sam, undefined)).toBeNull()
    expect(resolvePostAuthor(identities, sam, 'yesterday')).toBeNull()
  })

  it('prefers the latest-starting period if two ever overlap', () => {
    const overlapping = toPostingIdentities([
      { user_id: sam, character_id: 'a', name: 'First', portrait_url: null, started_at: '2026-01-01T00:00:00Z', ended_at: null },
      { user_id: sam, character_id: 'b', name: 'Second', portrait_url: null, started_at: '2026-02-01T00:00:00Z', ended_at: null },
    ])
    expect(resolvePostAuthor(overlapping, sam, '2026-03-01T00:00:00Z')?.name).toBe('Second')
  })

  it('labels a post made after a period, with no character active, with the player name', () => {
    expect(resolvePostAuthor(identities, jo, '2026-02-20T00:00:00Z', 'Jo')).toEqual({ characterId: '', name: 'Jo', portraitUrl: null })
    // Before the first period it stays upstream's business.
    expect(resolvePostAuthor(identities, jo, '2026-01-20T00:00:00Z', 'Jo')).toBeNull()
    // Without a usable name it falls back as before.
    expect(resolvePostAuthor(identities, jo, '2026-02-20T00:00:00Z', '  ')).toBeNull()
  })

  it('returns null when there are no identities at all', () => {
    expect(resolvePostAuthor([], sam, '2026-03-01T00:00:00Z')).toBeNull()
  })
})
