import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { memberName, type MemberLike } from '../characters/CharactersEntry'
import type { PlayerOption } from '../characters/GmControls'
import { FilesPanel } from './FilesPanel'

interface FilesEntryProps {
  channelId: string
  isGM: boolean
  isArchived: boolean
  gmId: string | null
  myUserId: string | undefined
  members: MemberLike[]
  /** Upstream's sidebar menu item classes, so the entry looks native. */
  className: string
}

/**
 * Fork hook point: the "Files" item in the campaign sidebar plus the panel it
 * opens. ChannelView renders this one component (FORK-EXT).
 */
export function FilesEntry({ channelId, isGM, isArchived, gmId, myUserId, members, className }: FilesEntryProps) {
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
    (userId: string) => (userId === myUserId ? 'You' : (names.get(userId) ?? 'A former player')),
    [names, myUserId],
  )

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Files
      </button>
      {/* Portal: the sidebar is CSS-transformed, which would trap a fixed
          overlay inside it. */}
      {open &&
        createPortal(
          <FilesPanel
            channelId={channelId}
            isGM={isGM}
            isArchived={isArchived}
            players={players}
            nameOf={nameOf}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  )
}
