import { useMemo, type ReactNode } from 'react'
import { PostAuthorshipContext, type AuthorLookup } from './authorshipContext'
import { resolvePostAuthor } from './resolvePostAuthor'
import { usePostingIdentities } from './usePostingIdentities'

/**
 * Makes "which character wrote this?" available to everything inside a campaign
 * view (chat messages, roll history). Wrapped around ChannelView's content.
 * `playerNames` (account names by user id) labels posts made while a player had
 * no active character.
 */
export function PostAuthorshipProvider({
  channelId,
  playerNames,
  children,
}: {
  channelId: string
  playerNames?: ReadonlyMap<string, string>
  children: ReactNode
}) {
  const { identities } = usePostingIdentities(channelId)
  const lookup = useMemo<AuthorLookup>(
    () => (userId, createdAt) => resolvePostAuthor(identities, userId, createdAt, userId ? playerNames?.get(userId) : null),
    [identities, playerNames],
  )
  return <PostAuthorshipContext.Provider value={lookup}>{children}</PostAuthorshipContext.Provider>
}
