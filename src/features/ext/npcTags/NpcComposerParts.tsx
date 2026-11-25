// cspell:words npcalias recalias
import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { useClickOutside } from '../../../hooks/useClickOutside'
import { useNpcTags } from './npcTagContext'
import { NpcFace } from './NpcTags'
import { matchTagTerms, type TagTerm } from './npcTagModel'
import { KIND_ICONS } from '../records/RecordIcon'
import { KIND_LABELS } from '../records/recordModel'

/** Composer hook (FORK-EXT): NPCs for the `@` list and the send-time conversion. */
export function useComposerNpcTags() {
  const tags = useNpcTags()
  const options = tags?.options ?? []
  return {
    options,
    /** NPC names (and the GM's aliases) matching the text typed after `@`, minus names already listed for players. */
    match: (query: string | null, memberNames: readonly string[]): TagTerm[] =>
      query === null ? [] : matchTagTerms(options, query, memberNames),
    /**
     * `@Dr Hale` → `[Dr Hale](npc:<id>)`, `@Alias` → `[Alias](npcalias:<id>)`. Returns the text
     * straight away unless a GM alias first needs a tag id from the database, so a send only
     * waits when it has to (upstream starts the send in the same moment as the click).
     */
    linkify: (content: string): string | Promise<string> => (tags ? (tags.linkifyNow(content) ?? tags.linkify(content)) : content),
  }
}

/**
 * "Dr Hale  NPC" / "Morgue  Location", or for the GM's aliases
 * "The Stranger  alias of Dr Hale" (no portrait).
 */
function TermLabel({ term }: { term: TagTerm }) {
  const kind = term.npc.recordKind
  const Icon = kind ? KIND_ICONS[kind] : null
  return (
    <>
      {Icon ? (
        <span aria-hidden="true" className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
          <Icon className="h-3.5 w-3.5" />
        </span>
      ) : (
        <NpcFace npc={term.alias ? { name: term.text, portraitUrl: null } : term.npc} />
      )}
      <span className="font-medium text-surface-900 dark:text-surface-100">{term.text}</span>
      <span className="text-xs text-surface-500 dark:text-surface-400">
        {term.alias ? `alias of ${term.npc.name}` : kind ? KIND_LABELS[kind] : 'NPC'}
      </span>
    </>
  )
}

interface NpcMentionOptionsProps {
  terms: TagTerm[]
  listboxId: string
  startIndex: number
  activeIndex: number
  onPick: (name: string) => void
}

/** NPC rows in upstream's `@` mention list, after the players. */
export function NpcMentionOptions({ terms, listboxId, startIndex, activeIndex, onPick }: NpcMentionOptionsProps) {
  return (
    <>
      {terms.map((term, i) => {
        const active = activeIndex === startIndex + i
        return (
          <button
            key={term.text}
            type="button"
            role="option"
            id={`${listboxId}-option-${startIndex + i}`}
            aria-selected={active}
            onMouseDown={e => {
              e.preventDefault()
              onPick(term.text)
            }}
            className={`flex w-full items-center space-x-2 px-3 py-2 text-left text-sm ${active ? 'bg-primary-50 dark:bg-primary-950' : 'hover:bg-primary-50 dark:hover:bg-primary-950'}`}
          >
            <TermLabel term={term} />
          </button>
        )
      })}
    </>
  )
}

/** Toolbar button: pick an NPC and insert `@Name ` at the cursor. */
export function NpcTagButton({ onPick }: { onPick: (name: string) => void }) {
  const tags = useNpcTags()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)
  if (!tags || tags.options.length === 0) return null
  // The search box takes the focus when the list opens (only shown for long lists).
  const focusOnOpen = (el: HTMLInputElement | null) => el?.focus()
  const list = matchTagTerms(tags.options, filter)
  const pick = (name: string) => {
    setOpen(false)
    setFilter('')
    onPick(name)
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Tag an NPC or record"
        title="Tag an NPC or record (@Name)"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        className="rounded-full p-2 text-surface-500 transition-colors hover:bg-primary-50 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:bg-primary-950 dark:hover:text-primary-400"
      >
        <UserRound className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-surface-200 bg-white shadow-lg dark:border-surface-700 dark:bg-surface-800">
          {tags.options.length > 8 && (
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setOpen(false)
                }
                if (e.key === 'Enter' && list[0]) {
                  e.preventDefault()
                  pick(list[0].text)
                }
              }}
              placeholder="Find an NPC or record"
              aria-label="Find an NPC or record"
              ref={focusOnOpen}
              className="w-full rounded-t-lg border-b border-surface-200 bg-transparent px-3 py-2 text-sm text-surface-900 focus:outline-none dark:border-surface-700 dark:text-surface-100"
            />
          )}
          <div role="listbox" aria-label="NPCs and records to tag" className="max-h-56 overflow-y-auto py-1">
            {list.length === 0 ? (
              <p className="px-3 py-2 text-sm text-surface-500">Nothing matches.</p>
            ) : (
              list.map(term => (
                <button
                  key={term.text}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(term.text)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-primary-50 dark:hover:bg-primary-950"
                >
                  <TermLabel term={term} />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
