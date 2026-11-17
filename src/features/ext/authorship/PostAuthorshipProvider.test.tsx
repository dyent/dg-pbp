import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PostAuthorshipProvider } from './PostAuthorshipProvider'
import { useAuthorLookup, usePostAuthor } from './authorshipContext'
import { toPostingIdentities } from './resolvePostAuthor'

vi.mock('./usePostingIdentities', () => ({
  usePostingIdentities: () => ({
    identities: toPostingIdentities([
      {
        user_id: 'sam',
        character_id: 'reyes',
        name: 'Reyes',
        portrait_url: null,
        started_at: '2026-01-01T00:00:00Z',
        ended_at: null,
      },
    ]),
    error: null,
  }),
}))

function AuthorProbe({ userId, at }: { userId: string; at: string }) {
  const author = usePostAuthor(userId, at)
  return <span>{author ? author.name : 'no character'}</span>
}

function LookupProbe() {
  const lookup = useAuthorLookup()
  return <span>{lookup('sam', '2026-02-01T00:00:00Z')?.name ?? 'no character'}</span>
}

describe('PostAuthorshipProvider', () => {
  it('tells children which character wrote a post', () => {
    render(
      <PostAuthorshipProvider channelId="chan-1">
        <AuthorProbe userId="sam" at="2026-02-01T00:00:00Z" />
      </PostAuthorshipProvider>,
    )
    expect(screen.getByText('Reyes')).toBeInTheDocument()
  })

  it('offers a lookup function for lists (e.g. roll history)', () => {
    render(
      <PostAuthorshipProvider channelId="chan-1">
        <LookupProbe />
      </PostAuthorshipProvider>,
    )
    expect(screen.getByText('Reyes')).toBeInTheDocument()
  })

  it('returns no character for posts outside any posting period', () => {
    render(
      <PostAuthorshipProvider channelId="chan-1">
        <AuthorProbe userId="sam" at="2025-06-01T00:00:00Z" />
      </PostAuthorshipProvider>,
    )
    expect(screen.getByText('no character')).toBeInTheDocument()
  })

  it('knows no characters when used without the provider', () => {
    render(<AuthorProbe userId="sam" at="2026-02-01T00:00:00Z" />)
    expect(screen.getByText('no character')).toBeInTheDocument()
  })
})
