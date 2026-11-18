import { useCallback, useEffect, useRef, useState } from 'react'

/** How long to wait after the last − / + click before saving (one log entry per burst). */
export const POOL_SAVE_DELAY_MS = 800

interface PoolAdjusterProps {
  /** Short name for screen readers and the input, e.g. "HP". */
  name: string
  value: number | null
  /** Where − / + start when there's no value yet (e.g. maximum HP). */
  startFrom?: number | null
  /** Saves the new value; the caller reports errors. */
  onCommit: (value: number | null) => void
}

const clamp = (n: number) => Math.min(999, Math.max(0, n))

/**
 * Current HP / WP / SAN in view mode: − and + buttons (saved after a short
 * pause, so several clicks make one change) and a click-to-type number.
 */
export function PoolAdjuster({ name, value, startFrom = null, onCommit }: PoolAdjusterProps) {
  const [local, setLocal] = useState<number | null>(value)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ value: number | null } | null>(null)
  const commitRef = useRef(onCommit)
  const inputRef = useRef<HTMLInputElement>(null)

  // Put the cursor in the box when the player clicks the number to type.
  useEffect(() => {
    if (typing) inputRef.current?.select()
  }, [typing])

  useEffect(() => {
    commitRef.current = onCommit
  }, [onCommit])

  // Follow saved changes from elsewhere unless a change of ours is waiting.
  useEffect(() => {
    if (!pending.current) setLocal(value)
  }, [value])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    if (next) commitRef.current(next.value)
  }, [])

  // Save anything still waiting when the sheet closes.
  useEffect(() => flush, [flush])

  const schedule = (next: number | null) => {
    setLocal(next)
    pending.current = { value: next }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, POOL_SAVE_DELAY_MS)
  }

  const step = (delta: number) => schedule(clamp((local ?? startFrom ?? 0) + delta))

  const finishTyping = (save: boolean) => {
    setTyping(false)
    if (!save) return
    const trimmed = text.trim()
    const next = trimmed === '' ? null : clamp(Number(trimmed))
    if (next === local) return
    setLocal(next)
    pending.current = { value: next }
    flush()
  }

  const buttonClass =
    'inline-flex h-7 w-7 items-center justify-center rounded border border-surface-300 text-sm text-surface-700 hover:bg-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-40 dark:border-surface-600 dark:text-surface-200 dark:hover:bg-surface-700'

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className={buttonClass} aria-label={`Lower ${name}`} onClick={() => step(-1)} disabled={local === 0}>
        −
      </button>
      {typing ? (
        <input
          ref={inputRef}
          inputMode="numeric"
          aria-label={`Current ${name}`}
          value={text}
          onChange={e => setText(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={() => finishTyping(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              finishTyping(true)
            } else if (e.key === 'Escape') {
              // Don't let Escape close the window too.
              e.stopPropagation()
              e.preventDefault()
              finishTyping(false)
            }
          }}
          className="w-12 rounded border border-surface-300 px-1 py-0.5 text-center text-base font-semibold dark:border-surface-600 dark:bg-surface-900 dark:text-surface-100"
        />
      ) : (
        <button
          type="button"
          title="Click to type a value"
          aria-label={`Current ${name}: ${local ?? 'not set'}. Click to type a value`}
          onClick={() => {
            setText(local === null ? '' : String(local))
            setTyping(true)
          }}
          className="min-w-[2rem] rounded px-1 text-base font-semibold underline decoration-dotted underline-offset-4 hover:bg-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-surface-700"
        >
          {local ?? '—'}
        </button>
      )}
      <button type="button" className={buttonClass} aria-label={`Raise ${name}`} onClick={() => step(1)} disabled={local === 999}>
        +
      </button>
    </span>
  )
}
