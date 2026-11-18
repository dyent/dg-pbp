import { Avatar } from '../../../components/Avatar'
import { isNpcIconUrl } from '../../chat/npcIcons'
import { STATUS_LABELS, roleOf, type CharacterSummary } from './characterModel'
import { BADGE } from './ui'

export function RoleBadge({ character }: { character: CharacterSummary }) {
  const role = roleOf(character)
  const color =
    role === 'pc_in_play'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : role === 'pc_reserve'
        ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
        : role === 'pc_out_of_play'
          ? 'bg-surface-200 text-surface-700 dark:bg-surface-700 dark:text-surface-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
  const text =
    role === 'npc'
      ? 'NPC'
      : role === 'pc_reserve'
        ? 'Reserve'
        : role === 'pc_out_of_play'
          ? 'Retired'
          : character.status
            ? 'Active'
            : 'In play'
  const title =
    role === 'pc_reserve'
      ? 'Backup, wounded or on hiatus: the player keeps control but can’t post as them'
      : role === 'pc_out_of_play'
        ? 'Left the story (dead, insane, gone for good)'
        : undefined
  return (
    <span className={`${BADGE} ${color}`} title={title}>
      {text}
    </span>
  )
}

export function StatusBadge({ character }: { character: CharacterSummary }) {
  if (!character.status) return null
  const color =
    character.status === 'active'
      ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
      : character.status === 'deceased' || character.status === 'insane'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
        : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200'
  return <span className={`${BADGE} ${color}`}>{STATUS_LABELS[character.status]}</span>
}

export function HiddenBadge({ character }: { character: CharacterSummary }) {
  if (character.revealed !== false) return null
  return (
    <span className={`${BADGE} bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300`} title="Not revealed to players">
      <svg aria-hidden="true" className="mr-0.5 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.2 6.2C4.2 7.5 2.7 9.6 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3" />
      </svg>
      Hidden
    </span>
  )
}

export function Portrait({ character, size = 'md' }: { character: Pick<CharacterSummary, 'name' | 'portraitUrl'>; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'h-8 w-8 text-sm' : size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-10 w-10 text-base'
  if (character.portraitUrl) {
    return (
      <Avatar
        className={`${dims} flex-shrink-0 rounded-full object-cover ${isNpcIconUrl(character.portraitUrl) ? 'dark:invert' : ''}`}
        src={character.portraitUrl}
        alt=""
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <div aria-hidden="true" className={`${dims} flex flex-shrink-0 items-center justify-center rounded-full bg-primary-100 font-medium text-primary-600 dark:bg-primary-900 dark:text-primary-300`}>
      {(character.name[0] || '?').toUpperCase()}
    </div>
  )
}
