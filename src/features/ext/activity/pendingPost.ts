// "Go to post" across rooms: switching between Main and a room mounts a fresh
// campaign view, so the post to jump to is kept here (outside React state)
// until that room's messages are on screen. A request older than 30 seconds is
// dropped, so an abandoned jump never fires on a later visit.
const MAX_AGE_MS = 30_000

let pending: { messageId: string; subChannelId: string | null; at: number } | null = null

export function rememberPost(messageId: string, subChannelId: string | null, now = Date.now()): void {
  pending = { messageId, subChannelId, at: now }
}

/** The post waiting to be shown in this room (Main = null), if any. */
export function waitingPost(subChannelId: string | null, now = Date.now()): string | null {
  if (!pending) return null
  if (now - pending.at > MAX_AGE_MS) {
    pending = null
    return null
  }
  return pending.subChannelId === subChannelId ? pending.messageId : null
}

export function forgetPost(): void {
  pending = null
}
