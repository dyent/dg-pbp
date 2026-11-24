import { useId, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { useNpcTags } from './npcTagContext'
import { NpcMentionOptions, NpcTagButton } from './NpcComposerParts'
import { matchTagTerms, tagInsertion, tagQueryBefore } from './npcTagModel'

type TagTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}

/**
 * A text box where `@` offers the NPCs and records the writer can tag, as in the
 * chat composer, plus the same tag button. Used for notes. The text keeps `@Name`;
 * the caller turns it into tags on save (`useNpcTags().linkify`).
 */
export function TagTextarea({ value, onChange, className, onKeyDown, ...rest }: TagTextareaProps) {
  const tags = useNpcTags()
  const ref = useRef<HTMLTextAreaElement>(null)
  const listboxId = useId()
  const [cursor, setCursor] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const query = cursor === null ? null : tagQueryBefore(value.slice(0, cursor))
  const terms = query === null || dismissed || !tags ? [] : matchTagTerms(tags.options, query).slice(0, 8)
  const open = terms.length > 0
  const current = Math.min(active, Math.max(terms.length - 1, 0))

  const place = (next: string, at: number) => {
    onChange(next)
    setCursor(at)
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(at, at)
    })
  }

  /** Replaces the `@query` being typed with `@Name `. */
  const pickFromList = (name: string) => {
    const end = cursor ?? value.length
    const start = value.lastIndexOf('@', end - 1)
    const before = value.slice(0, start)
    const inserted = `@${name} `
    place(before + inserted + value.slice(end), before.length + inserted.length)
    setActive(0)
  }

  /** Inserts `@Name ` at the cursor (tag button). */
  const pickFromButton = (name: string) => {
    const at = ref.current?.selectionStart ?? value.length
    const inserted = tagInsertion(value.slice(0, at), name)
    place(value.slice(0, at) + inserted + value.slice(at), at + inserted.length)
  }

  return (
    <div className="relative">
      <div className="flex items-start gap-1">
        <textarea
          {...rest}
          ref={ref}
          value={value}
          className={className}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open ? `${listboxId}-option-${current}` : undefined}
          onChange={e => {
            onChange(e.target.value)
            setCursor(e.target.selectionStart)
            setDismissed(false)
            setActive(0)
          }}
          onSelect={e => setCursor(e.currentTarget.selectionStart)}
          onBlur={() => setCursor(null)}
          onKeyDown={e => {
            if (open) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((current + (e.key === 'ArrowDown' ? 1 : terms.length - 1)) % terms.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pickFromList(terms[current].text)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setDismissed(true)
                return
              }
            }
            onKeyDown?.(e)
          }}
        />
        <NpcTagButton onPick={pickFromButton} />
      </div>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="NPCs and records to tag"
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800"
        >
          <NpcMentionOptions terms={terms} listboxId={listboxId} startIndex={0} activeIndex={current} onPick={pickFromList} />
        </div>
      )}
    </div>
  )
}
