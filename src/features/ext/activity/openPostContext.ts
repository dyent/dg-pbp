import { createContext, useContext } from 'react'

/** Close the characters panel and show a post in the chat (room or Main). */
export type OpenPost = (messageId: string, subChannelId: string | null) => void

/** Provided by CharactersEntry when ChannelView can jump to posts; else null. */
export const OpenPostContext = createContext<OpenPost | null>(null)

export function useOpenPost(): OpenPost | null {
  return useContext(OpenPostContext)
}
