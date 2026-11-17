import { useMemo, type ReactNode } from 'react'
import { PostAuthorshipContext, type AuthorLookup } from './authorshipContext'
import { resolvePostAuthor } from './resolvePostAuthor'
import { usePostingIdentities } from './usePostingIdentities'

/**
 * Makes "which character wrote this?" available to everything inside a campaign
 * view (chat messages, roll history). Wrapped around ChannelView's content.
 */
export function PostAuthorshipProvider({ channelId, children }: { channelId: string; children: ReactNode }) {
  const { identities } = usePostingIdentities(channelId)
  const lookup = useMemo<AuthorLookup>(
    () => (userId, createdAt) => resolvePostAuthor(identities, userId, createdAt),
    [identities],
  )
  return <PostAuthorshipContext.Provider value={lookup}>{children}</PostAuthorshipContext.Provider>
}
