import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { CalendarChange } from './calendarModel'
import { useCalendarChanges } from './useCalendarChanges'

interface CalendarContextValue {
  /** Sorted oldest first. */
  changes: CalendarChange[]
  reload: () => void
}

// Default: no in-game dates. Upstream components rendered outside our provider
// (or in upstream tests) show nothing extra.
const CalendarContext = createContext<CalendarContextValue>({ changes: [], reload: () => {} })

export function useCalendar(): CalendarContextValue {
  return useContext(CalendarContext)
}

/** Loads the campaign's in-game date changes for the header and chat dividers. */
export function InGameCalendarProvider({ channelId, children }: { channelId: string; children: ReactNode }) {
  const { changes, reload } = useCalendarChanges(channelId)
  const value = useMemo(() => ({ changes, reload }), [changes, reload])
  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}
