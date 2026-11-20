import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CharactersPanel } from './CharactersPanel'
import type { PlayerOption } from './GmControls'
import type { CharacterKind } from './characterModel'
import { OpenPostContext, type OpenPost } from '../activity/openPostContext'
import { OpenCharacterContext, onCharacterRequest } from '../npcTags/characterOpener'
import { useNpcTags } from '../npcTags/npcTagContext'

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
  /** Button text; "NPCs" when it stands in for upstream's NPC window. */
  label?: string
  /** List shown first: PCs, or NPCs from GM Tools. */
  initialKind?: CharacterKind
  /** Called when the panel closes (ChannelView reloads the "Speak as" names). */
  onClosed?: () => void
  /** Shows a post in the chat (Activity tab's "Go to post"); the panel closes first. */
  onOpenPost?: OpenPost
  /** This entry opens when a tag in the chat is clicked (only one entry should). */
  opensFromChat?: boolean
}

/** Account name of a member (character names change as they switch PCs). */
export function memberName(member: MemberLike): string {
  return member.profile?.display_name?.trim() || member.character_name?.trim() || 'Player'
}

/** "Agent Reyes (Sam)": a member's posting name plus their account name, when different. */
export function withPlayerName(characterName: string, displayName: string | null | undefined): string {
  const player = displayName?.trim()
  return player && player !== characterName.trim() ? `${characterName} (${player})` : characterName
}

/**
 * Fork hook point: the "Characters" item in the campaign sidebar plus the
 * panel it opens. ChannelView renders this one component (FORK-EXT).
 */
export function CharactersEntry({ channelId, isGM, isArchived, gmId, myUserId, members, className, label = 'Characters', initialKind, onClosed, onOpenPost, opensFromChat = false }: CharactersEntryProps) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<{ id: string | null; kind: CharacterKind | undefined; n: number }>({ id: null, kind: initialKind, n: 0 })
  const reloadTags = useNpcTags()?.reload
  const close = useCallback(() => {
    setOpen(false)
    onClosed?.()
    reloadTags?.()
  }, [onClosed, reloadTags])

  // A new key remounts an already open panel on this character.
  const showCharacter = useCallback((id: string) => {
    setShown(prev => ({ id, kind: 'npc', n: prev.n + 1 }))
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!opensFromChat) return
    return onCharacterRequest(showCharacter)
  }, [opensFromChat, showCharacter])

  const openFromMenu = () => {
    setShown(prev => ({ id: null, kind: initialKind, n: prev.n + 1 }))
    setOpen(true)
  }
  const openPost = useMemo<OpenPost | null>(
    () =>
      onOpenPost
        ? (messageId, subChannelId) => {
            close()
            onOpenPost(messageId, subChannelId)
          }
        : null,
    [onOpenPost, close],
  )

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
      <button type="button" onClick={openFromMenu} className={className}>
        {label}
      </button>
      {/* Portal: the sidebar is CSS-transformed, which would trap a fixed
          overlay inside it. */}
      {open &&
        createPortal(
          <OpenPostContext.Provider value={openPost}>
            <OpenCharacterContext.Provider value={showCharacter}>
            <CharactersPanel
              key={shown.n}
              channelId={channelId}
              isGM={isGM}
              isArchived={isArchived}
              myUserId={myUserId}
              players={players}
              nameOf={nameOf}
              initialKind={shown.kind}
              initialSelectedId={shown.id}
              onClose={close}
            />
            </OpenCharacterContext.Provider>
          </OpenPostContext.Provider>,
          document.body,
        )}
    </>
  )
}
