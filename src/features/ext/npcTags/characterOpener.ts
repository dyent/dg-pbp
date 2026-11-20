import { createContext } from 'react'

// Lets a tag in the chat open a character in the Characters panel, which
// lives in the sidebar (ChannelView renders it; it listens here).

type Listener = (characterId: string) => void

const listeners = new Set<Listener>()

/** Asks the Characters panel to open on this character. */
export function requestCharacter(characterId: string): void {
  for (const listener of listeners) listener(characterId)
}

/** Subscribes the Characters panel; returns the unsubscribe function. */
export function onCharacterRequest(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Inside an open Characters panel, tags (e.g. in the Activity tab) switch that
 * panel to the character instead of opening a second one.
 */
export const OpenCharacterContext = createContext<((characterId: string) => void) | null>(null)
