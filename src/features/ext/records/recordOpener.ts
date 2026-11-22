import { createContext } from 'react'

// Lets a record tag in the chat open the record in the Case file, which lives
// in the sidebar (ChannelView renders it; it listens here).

type Listener = (recordId: string) => void

const listeners = new Set<Listener>()

/** Asks the Case file to open on this record. */
export function requestRecord(recordId: string): void {
  for (const listener of listeners) listener(recordId)
}

/** Subscribes the Case file; returns the unsubscribe function. */
export function onRecordRequest(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Inside an open Case file, record tags switch it to the record instead of opening a second one. */
export const OpenRecordContext = createContext<((recordId: string) => void) | null>(null)
