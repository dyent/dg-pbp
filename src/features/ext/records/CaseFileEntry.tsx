import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNpcTags } from '../npcTags/npcTagContext'
import { onRecordRequest } from './recordOpener'
import { memberName, type MemberLike } from '../characters/CharactersEntry'
import type { PlayerOption } from '../characters/GmControls'
import { CaseFilePanel } from './CaseFilePanel'

interface CaseFileEntryProps {
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
 * Fork hook point: the "Case file" item in the campaign sidebar plus the panel
 * it opens. ChannelView renders this one component (FORK-EXT).
 */
export function CaseFileEntry({ channelId, isGM, isArchived, gmId, myUserId, members, className }: CaseFileEntryProps) {
  // `n` remounts the panel when a record tag in the chat asks for another record.
  const [shown, setShown] = useState<{ id: string | null; n: number } | null>(null)
  const tags = useNpcTags()
  const reloadTags = tags?.reload

  useEffect(() => onRecordRequest(id => setShown(s => ({ id, n: (s?.n ?? 0) + 1 }))), [])

  const close = () => {
    setShown(null)
    // New records or aliases become taggable.
    reloadTags?.()
  }

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
      <button type="button" onClick={() => setShown(s => ({ id: null, n: (s?.n ?? 0) + 1 }))} className={className}>
        Case file
      </button>
      {/* Portal: the sidebar is CSS-transformed, which would trap a fixed overlay inside it. */}
      {shown &&
        createPortal(
          <CaseFilePanel
            key={shown.n}
            initialRecordId={shown.id}
            channelId={channelId}
            isGM={isGM}
            isArchived={isArchived}
            myUserId={myUserId}
            players={players}
            nameOf={nameOf}
            onClose={close}
          />,
          document.body,
        )}
    </>
  )
}
