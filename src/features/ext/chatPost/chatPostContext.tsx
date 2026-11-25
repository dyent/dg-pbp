import { createContext, useContext, type ReactNode } from 'react'

/**
 * Lets a fork panel (Files, Case files) put a picture into the chat's message
 * box (DECISIONS.md #51). ChannelView gives the panels a way to call the
 * composer's insertImages; the panel closes afterwards so the GM sees the draft.
 */
export interface ChatPost {
  /** Puts `![](path)` for each picture into the message box and closes the panel. */
  insertImages: (paths: string[]) => void
}

const ChatPostContext = createContext<ChatPost | null>(null)

export function ChatPostProvider({ value, children }: { value: ChatPost | null; children: ReactNode }) {
  return <ChatPostContext.Provider value={value}>{children}</ChatPostContext.Provider>
}

/** Null outside a campaign the GM can post in (e.g. archived, or a player). */
export function useChatPost(): ChatPost | null {
  return useContext(ChatPostContext)
}
