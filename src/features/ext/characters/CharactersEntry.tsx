import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CharactersPanel } from './CharactersPanel'
import type { PlayerOption } from './GmControls'

/** The bits of an upstream channel_members row this feature needs. */
export interface MemberLike {
  user_id: string
  character_name?: string | null
  is_blocked?: boolean | null
  profile?: { display_name: string | null } | null
}

interface CharactersEntryProps {
  channelId: string
  isGM: boolean
  isArchived: boolean
  gmId: string | null
  myUserId: string | undefined
  members: MemberLike[]
  /** Upstream's sidebar menu item classes, so the entry looks native. */
  className: string
}

/** Account name of a member (character names change as they switch PCs). */
function memberName(member: MemberLike): string {
  return member.profile?.display_name?.trim() || member.character_name?.trim() || 'Player'
}

/**
 * Fork hook point: the "Characters" item in the campaign sidebar plus the
 * panel it opens. ChannelView renders this one component (FORK-EXT).
 */
export function CharactersEntry({ channelId, isGM, isArchived, gmId, myUserId, members, className }: CharactersEntryProps) {
  const [open, setOpen] = useState(false)

  const players: PlayerOption[] = useMemo(
    () =>
      members
        .filter(m => m.user_id !== gmId && !m.is_blocked)
        .map(m => ({ userId: m.user_id, name: memberName(m) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members, gmId],
  )

  const names = useMemo(() => new Map(members.map(m => [m.user_id, memberName(m)])), [members])
  const nameOf = useCallback(
    (userId: string) => {
      if (userId === myUserId) return 'You'
      if (userId === gmId) return names.get(userId) ? `${names.get(userId)} (GM)` : 'GM'
      return names.get(userId) ?? 'A former player'
    },
    [names, gmId, myUserId],
  )

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Characters
      </button>
      {/* Portal: the sidebar is CSS-transformed, which would trap a fixed
          overlay inside it. */}
      {open &&
        createPortal(
          <CharactersPanel
            channelId={channelId}
            isGM={isGM}
            isArchived={isArchived}
            myUserId={myUserId}
            players={players}
            nameOf={nameOf}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  )
}
