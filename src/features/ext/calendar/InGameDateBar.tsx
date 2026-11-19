import { useId, useMemo, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '../characters/ui'
import { clearRoomDate, setDate, shiftDate, undoChange } from './calendarApi'
import { useCalendar } from './calendarContext'
import { SHIFT_UNITS, dateAt, dayToIso, formatDay, isoToDay, type ShiftUnit } from './calendarModel'

interface InGameDateBarProps {
  channelId: string
  /** The room on screen (null = Main). */
  subChannelId: string | null
  roomName: string | null
  isGM: boolean
  isArchived: boolean
}

const UNIT_LABELS: Record<ShiftUnit, string> = { day: 'days', week: 'weeks', month: 'months', year: 'years' }

/**
 * The in-game date of the room on screen, under the room's status bar, with the
 * GM's controls to set it, move it, give a room its own date or undo a change.
 * Fork hook point in upstream's ChannelView (FORK-EXT).
 */
export function InGameDateBar({ channelId, subChannelId, roomName, isGM, isArchived }: InGameDateBarProps) {
  const id = useId()
  const { addToast } = useToast()
  const { changes, reload } = useCalendar()
  const current = useMemo(() => dateAt(changes, subChannelId), [changes, subChannelId])
  const lastChange = changes.at(-1)
  const canChange = isGM && !isArchived

  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<'campaign' | 'room'>('campaign')
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState<ShiftUnit>('day')
  const [iso, setIso] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (!current && !canChange) return null

  const target = subChannelId && scope === 'room' ? subChannelId : null

  const openForm = () => {
    setScope(subChannelId && current?.own ? 'room' : 'campaign')
    setIso(current ? dayToIso(current.day) : '')
    setProblem(null)
    setOpen(true)
  }

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true)
    setProblem(null)
    try {
      await action()
      addToast(done, 'success')
      reload()
      setOpen(false)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'The in-game date was not changed.')
    } finally {
      setBusy(false)
    }
  }

  const shift = (direction: 1 | -1) => {
    const n = Number(amount)
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      setProblem('Enter a whole number from 1 to 1000.')
      return
    }
    void run(() => shiftDate(channelId, target, n * direction, unit), 'In-game date moved.')
  }

  const set = () => {
    const day = isoToDay(iso)
    if (day === null) {
      setProblem('Enter a date between the years 1 and 9999.')
      return
    }
    void run(() => setDate(channelId, target, day), 'In-game date set.')
  }

  const where = subChannelId ? (current?.own ? `${roomName ?? 'this room'}’s own date` : 'campaign date') : null

  return (
    <div className="border-b border-primary-100 bg-primary-50 px-4 py-1.5 text-sm sm:px-6 dark:border-primary-900 dark:bg-primary-950">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {current ? (
          <span className="text-primary-900 dark:text-primary-100">
            <span className="font-medium">In-game date:</span> {formatDay(current.day)}
            {where && <span className="text-primary-700 dark:text-primary-300"> ({where})</span>}
          </span>
        ) : (
          <span className="text-primary-700 dark:text-primary-300">No in-game date set.</span>
        )}
        {canChange && !open && (
          <button type="button" className="text-sm font-medium text-primary-700 underline hover:text-primary-900 dark:text-primary-300 dark:hover:text-primary-100" onClick={openForm}>
            {current ? 'Change date' : 'Set the in-game date'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-3 rounded-md border border-primary-200 bg-white p-3 dark:border-primary-800 dark:bg-surface-800">
          {subChannelId && (
            <fieldset>
              <legend className={LABEL}>Change the date of</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-surface-800 dark:text-surface-200">
                <label className="flex items-center gap-2">
                  <input type="radio" name={`${id}-scope`} checked={scope === 'campaign'} onChange={() => setScope('campaign')} />
                  The whole campaign
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name={`${id}-scope`} checked={scope === 'room'} onChange={() => setScope('room')} />
                  Only {roomName ?? 'this room'}
                </label>
              </div>
              {scope === 'campaign' && current?.own && (
                <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
                  This room has its own date, so a campaign change won’t show here until the room returns to the campaign date.
                </p>
              )}
            </fieldset>
          )}

          {(target ? current : dateAt(changes, null)) && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={`${id}-amount`} className={LABEL}>
                  Move time by
                </label>
                <input
                  id={`${id}-amount`}
                  type="number"
                  min={1}
                  max={1000}
                  className={`${INPUT} mt-1 w-24`}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`${id}-unit`} className={LABEL}>
                  Unit
                </label>
                <select id={`${id}-unit`} className={`${INPUT} mt-1`} value={unit} onChange={e => setUnit(e.target.value as ShiftUnit)}>
                  {SHIFT_UNITS.map(u => (
                    <option key={u} value={u}>
                      {UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => shift(1)}>
                Forward
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => shift(-1)}>
                Back
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={`${id}-date`} className={LABEL}>
                Set the date to
              </label>
              <input id={`${id}-date`} type="date" min="0001-01-01" max="9999-12-31" className={`${INPUT} mt-1`} value={iso} onChange={e => setIso(e.target.value)} />
            </div>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={set}>
              Set date
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-surface-100 pt-3 dark:border-surface-700">
            {subChannelId && current?.own && (
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy}
                onClick={() => void run(() => clearRoomDate(channelId, subChannelId), `${roomName ?? 'The room'} follows the campaign date again.`)}
              >
                Return {roomName ?? 'this room'} to the campaign date
              </button>
            )}
            {lastChange && (
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void run(() => undoChange(lastChange.id), 'Last date change undone.')}>
                Undo the last change
              </button>
            )}
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>

          {problem && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
