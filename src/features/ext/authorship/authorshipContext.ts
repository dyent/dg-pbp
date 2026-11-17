import { createContext, useContext } from 'react'
import type { PostAuthor } from './resolvePostAuthor'

/** Returns the character a user was posting as at a given time, or null. */
export type AuthorLookup = (
  userId: string | null | undefined,
  createdAt: string | null | undefined,
) => PostAuthor | null

const noAgents: AuthorLookup = () => null

// Default: no characters known. Upstream components rendered outside our provider
// (or in upstream tests) keep their original behavior.
export const PostAuthorshipContext = createContext<AuthorLookup>(noAgents)

export function useAuthorLookup(): AuthorLookup {
  return useContext(PostAuthorshipContext)
}

export function usePostAuthor(
  userId: string | null | undefined,
  createdAt: string | null | undefined,
): PostAuthor | null {
  return useContext(PostAuthorshipContext)(userId, createdAt)
}
