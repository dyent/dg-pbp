// cspell:words organisation organisations
import { Building2, FolderOpen, MapPin, Search, type LucideIcon } from 'lucide-react'
import { Avatar } from '../../../components/Avatar'
import { isNpcIconUrl } from '../../chat/npcIcons'
import { BADGE } from '../characters/ui'
import { KIND_LABELS, type RecordKind } from './recordModel'

export const KIND_ICONS: Record<RecordKind, LucideIcon> = {
  operation: FolderOpen,
  location: MapPin,
  organisation: Building2,
  clue: Search,
}

/** The record's picture, or its kind's icon in a circle. */
export function RecordIcon({ kind, pictureUrl, size = 'md' }: { kind: RecordKind; pictureUrl: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-16 w-16' : 'h-10 w-10'
  if (pictureUrl) {
    return (
      <Avatar
        className={`${dims} flex-shrink-0 rounded-lg object-cover ${isNpcIconUrl(pictureUrl) ? 'dark:invert' : ''}`}
        src={pictureUrl}
        alt=""
        referrerPolicy="no-referrer"
      />
    )
  }
  const Icon = KIND_ICONS[kind]
  const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'
  return (
    <div aria-hidden="true" className={`${dims} flex flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-300`}>
      <Icon className={iconSize} />
    </div>
  )
}

export function KindBadge({ kind }: { kind: RecordKind }) {
  const Icon = KIND_ICONS[kind]
  return (
    <span className={`${BADGE} gap-1 bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-200`}>
      <Icon aria-hidden="true" className="h-3 w-3" />
      {KIND_LABELS[kind]}
    </span>
  )
}
