// Fork (Phase 2a step 3): which character wrote a post?
//
// A player can switch between characters over time. Each switch is recorded as a
// posting period (ext_posting_periods). A post or roll is attributed to the
// period that covers its timestamp: started_at <= t < ended_at (open periods
// have no end). See docs/delta-green/02-phase2a-plan.md.

export interface PostingIdentity {
  userId: string
  characterId: string
  name: string
  portraitUrl: string | null
  /** Epoch milliseconds. */
  startedAt: number
  /** Epoch milliseconds, or null while the period is still open. */
  endedAt: number | null
}

export interface PostAuthor {
  characterId: string
  name: string
  portraitUrl: string | null
}

export interface PostingIdentityRow {
  user_id: string
  character_id: string
  name: string
  portrait_url: string | null
  started_at: string
  ended_at: string | null
}

/** Converts rows from ext_posting_identities() into lookup-ready identities. */
export function toPostingIdentities(rows: readonly PostingIdentityRow[]): PostingIdentity[] {
  return rows
    .map(row => ({
      userId: row.user_id,
      characterId: row.character_id,
      name: row.name,
      portraitUrl: row.portrait_url || null,
      startedAt: Date.parse(row.started_at),
      endedAt: row.ended_at === null ? null : Date.parse(row.ended_at),
    }))
    .filter(identity => !Number.isNaN(identity.startedAt))
}

/**
 * The character `userId` was posting as at `createdAt`, or null when they were not
 * posting as any character then (callers fall back to the upstream name).
 */
export function resolvePostAuthor(
  identities: readonly PostingIdentity[],
  userId: string | null | undefined,
  createdAt: string | null | undefined,
): PostAuthor | null {
  if (!userId || !createdAt) return null
  const at = Date.parse(createdAt)
  if (Number.isNaN(at)) return null

  let match: PostingIdentity | null = null
  for (const identity of identities) {
    if (identity.userId !== userId) continue
    const covers = identity.startedAt <= at && (identity.endedAt === null || at < identity.endedAt)
    // Periods never overlap in practice; if they ever did, the latest start wins.
    if (covers && (!match || identity.startedAt >= match.startedAt)) match = identity
  }

  return match
    ? { characterId: match.characterId, name: match.name, portraitUrl: match.portraitUrl }
    : null
}
