import { useMemo, useState } from 'react'
import { HiddenBadge, Portrait, RoleBadge, StatusBadge } from './CharacterBadges'
import { LIMITS, type CharacterKind, type CharacterSummary, type Tag } from './characterModel'
import { BTN_PRIMARY, INPUT, SECTION_TITLE } from './ui'

interface CharacterListProps {
  characters: CharacterSummary[]
  tags: Tag[]
  isGM: boolean
  canCreate: boolean
  kind: CharacterKind
  onKindChange: (kind: CharacterKind) => void
  selectedId: string | null
  onSelect: (id: string) => void
  ownerName: (userId: string) => string
  onCreate: (kind: CharacterKind, name: string) => Promise<boolean>
}

export function CharacterList({
  characters,
  tags,
  isGM,
  canCreate,
  kind,
  onKindChange,
  selectedId,
  onSelect,
  ownerName,
  onCreate,
}: CharacterListProps) {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return characters.filter(c => {
      if (c.kind !== kind) return false
      if (term) {
        const haystack = [c.name, ...(c.aliases ?? [])].join(' ').toLowerCase()
        if (!haystack.includes(term)) return false
      }
      if (tagFilter && !(c.tagIds ?? []).includes(tagFilter)) return false
      return true
    })
  }, [characters, kind, search, tagFilter])

  const mine = visible.filter(c => c.isMine)
  const others = visible.filter(c => !c.isMine)
  const pcCount = characters.filter(c => c.kind === 'pc').length
  const npcCount = characters.filter(c => c.kind === 'npc').length

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const ok = await onCreate(kind, name)
    setCreating(false)
    if (ok) setNewName('')
  }

  const renderRow = (c: CharacterSummary) => (
    <li key={c.id}>
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        aria-current={selectedId === c.id ? 'true' : undefined}
        className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-100 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          selectedId === c.id ? 'bg-primary-50 dark:bg-primary-900/30' : ''
        }`}
      >
        <Portrait character={c} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-surface-900 dark:text-surface-100">{c.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            {c.kind === 'pc' && <RoleBadge character={c} />}
            <StatusBadge character={c} />
            <HiddenBadge character={c} />
            {c.kind === 'pc' && c.ownerId && !c.isMine && (
              <span className="truncate text-xs text-surface-500 dark:text-surface-400">{ownerName(c.ownerId)}</span>
            )}
          </span>
        </span>
      </button>
    </li>
  )

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Character type" className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-surface-100 p-1 dark:bg-surface-900">
        {(['pc', 'npc'] as const).map(k => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => onKindChange(k)}
            className={`rounded px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 ${
              kind === k
                ? 'bg-white text-surface-900 shadow dark:bg-surface-700 dark:text-surface-100'
                : 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'
            }`}
          >
            {k === 'pc' ? `PCs (${pcCount})` : `NPCs (${npcCount})`}
          </button>
        ))}
      </div>

      {isGM && (
        <div className="mb-3 space-y-2">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search names and aliases"
            aria-label="Search characters"
            className={INPUT}
          />
          {kind === 'npc' && tags.length > 0 && (
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} aria-label="Filter by tag" className={INPUT}>
              <option value="">All tags</option>
              {tags.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-2 py-4 text-sm text-surface-500 dark:text-surface-400">
            {search || tagFilter
              ? 'No characters match.'
              : kind === 'pc'
                ? isGM
                  ? 'No PCs yet. Add one below, then give it to a player with the Role setting.'
                  : 'No PCs to show yet. Your GM will set your character up.'
                : isGM
                  ? 'No NPCs yet. Add one below.'
                  : 'No NPCs revealed yet.'}
          </p>
        ) : (
          <>
            {mine.length > 0 && (
              <>
                <p className={`${SECTION_TITLE} px-2 pb-1`}>Your characters</p>
                <ul className="mb-3 space-y-0.5">{mine.map(renderRow)}</ul>
                {others.length > 0 && <p className={`${SECTION_TITLE} px-2 pb-1`}>Others</p>}
              </>
            )}
            <ul className="space-y-0.5">{others.map(renderRow)}</ul>
          </>
        )}
      </div>

      {canCreate && (
        <form onSubmit={handleCreate} className="mt-3 flex gap-2 border-t border-surface-100 pt-3 dark:border-surface-700">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            maxLength={LIMITS.name}
            placeholder={kind === 'pc' ? 'New PC name' : 'New NPC name'}
            aria-label={kind === 'pc' ? 'New PC name' : 'New NPC name'}
            className={`${INPUT} min-w-0 flex-1`}
          />
          <button type="submit" disabled={creating || !newName.trim()} className={BTN_PRIMARY}>
            {creating ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}
    </div>
  )
}
