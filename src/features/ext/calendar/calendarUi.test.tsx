import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../contexts/ToastContext'
import * as api from './calendarApi'
import { InGameCalendarProvider } from './calendarContext'
import { InGameDateBar } from './InGameDateBar'
import { InGameDateDivider } from './InGameDateDivider'
import { isoToDay, type CalendarChange } from './calendarModel'
import { useCalendarChanges } from './useCalendarChanges'

vi.mock('./useCalendarChanges', () => ({ useCalendarChanges: vi.fn() }))
vi.mock('./calendarApi', () => ({
  setDate: vi.fn(),
  shiftDate: vi.fn(),
  clearRoomDate: vi.fn(),
  undoChange: vi.fn(),
}))

const reload = vi.fn()
const day = (iso: string) => isoToDay(iso)!

const campaignSet: CalendarChange = {
  id: 'c1', subChannelId: null, kind: 'set', dayNumber: day('1997-10-14'), shiftAmount: null, shiftUnit: null, createdAt: '2026-11-19T10:01:00Z',
}
const campaignShift: CalendarChange = {
  id: 'c2', subChannelId: null, kind: 'shift', dayNumber: day('1997-10-17'), shiftAmount: 3, shiftUnit: 'day', createdAt: '2026-11-19T10:05:00Z',
}
const roomSet: CalendarChange = {
  id: 'c3', subChannelId: 'r1', kind: 'set', dayNumber: day('1997-07-14'), shiftAmount: null, shiftUnit: null, createdAt: '2026-11-19T10:08:00Z',
}

function useChanges(changes: CalendarChange[]) {
  vi.mocked(useCalendarChanges).mockReturnValue({ changes, reload })
}

function renderBar(props: Partial<React.ComponentProps<typeof InGameDateBar>> = {}) {
  render(
    <ToastProvider>
      <InGameCalendarProvider channelId="ch">
        <InGameDateBar channelId="ch" subChannelId={null} roomName={null} isGM isArchived={false} {...props} />
      </InGameCalendarProvider>
    </ToastProvider>,
  )
}

describe('InGameDateBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.setDate).mockResolvedValue()
    vi.mocked(api.shiftDate).mockResolvedValue()
    vi.mocked(api.clearRoomDate).mockResolvedValue()
    vi.mocked(api.undoChange).mockResolvedValue()
  })

  it('shows nothing to players before a date is set, and invites the GM to set one', () => {
    useChanges([])
    renderBar({ isGM: false })
    expect(screen.queryByText(/In-game date/)).not.toBeInTheDocument()
  })

  it('GM sets the first date', async () => {
    useChanges([])
    renderBar()
    expect(screen.getByText('No in-game date set.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set the in-game date' }))
    expect(screen.queryByLabelText('Move time by')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo the last change' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a date between the years 1 and 9999.')

    fireEvent.change(screen.getByLabelText('Set the date to'), { target: { value: '1997-10-14' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
    })
    expect(api.setDate).toHaveBeenCalledWith('ch', null, day('1997-10-14'))
    expect(reload).toHaveBeenCalled()
    expect(await screen.findByText('In-game date set.')).toBeInTheDocument()
  })

  it('shows the campaign date to players without controls', () => {
    useChanges([campaignSet, campaignShift])
    renderBar({ isGM: false })
    expect(screen.getByText(/Fri 17 Oct 1997/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change date' })).not.toBeInTheDocument()
  })

  it('archived campaigns show the date without controls', () => {
    useChanges([campaignSet])
    renderBar({ isArchived: true })
    expect(screen.getByText(/Tue 14 Oct 1997/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change date' })).not.toBeInTheDocument()
  })

  it('GM moves the campaign forward and back, checking the number', async () => {
    useChanges([campaignSet])
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Change date' }))
    expect(screen.getByLabelText('Set the date to')).toHaveValue('1997-10-14')

    fireEvent.change(screen.getByLabelText('Move time by'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 1000.')

    fireEvent.change(screen.getByLabelText('Move time by'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'week' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    })
    expect(api.shiftDate).toHaveBeenCalledWith('ch', null, 2, 'week')
    expect(await screen.findByText('In-game date moved.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Change date' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    })
    expect(api.shiftDate).toHaveBeenLastCalledWith('ch', null, -2, 'week')
  })

  it('keeps the form open with the reason when a change fails', async () => {
    useChanges([campaignSet])
    vi.mocked(api.undoChange).mockRejectedValue(new Error('Only the most recent date change can be undone'))
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Change date' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo the last change' }))
    })
    expect(api.undoChange).toHaveBeenCalledWith('c1')
    expect(screen.getByRole('alert')).toHaveTextContent('Only the most recent date change can be undone')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('in a room following the campaign: changes the campaign by default, or just the room', async () => {
    useChanges([campaignSet])
    renderBar({ subChannelId: 'r1', roomName: 'Morgue' })
    expect(screen.getByText(/\(campaign date\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change date' }))
    expect(screen.getByLabelText('The whole campaign')).toBeChecked()
    expect(screen.queryByRole('button', { name: /Return Morgue/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Only Morgue'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    })
    expect(api.shiftDate).toHaveBeenCalledWith('ch', 'r1', -1, 'day')
  })

  it('in a room with its own date: shows it, and can return it to the campaign date', async () => {
    useChanges([campaignSet, roomSet])
    renderBar({ subChannelId: 'r1', roomName: 'Morgue' })
    expect(screen.getByText(/Mon 14 Jul 1997/)).toBeInTheDocument()
    expect(screen.getByText(/Morgue’s own date/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change date' }))
    expect(screen.getByLabelText('Only Morgue')).toBeChecked()
    fireEvent.click(screen.getByLabelText('The whole campaign'))
    expect(screen.getByText(/won’t show here/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Return Morgue to the campaign date' }))
    })
    expect(api.clearRoomDate).toHaveBeenCalledWith('ch', 'r1')
    expect(await screen.findByText('Morgue follows the campaign date again.')).toBeInTheDocument()
  })
})

describe('InGameDateDivider', () => {
  beforeEach(() => vi.clearAllMocks())

  it('draws nothing outside the provider (upstream behavior)', () => {
    const { container } = render(<InGameDateDivider subChannelId={null} from="2026-11-19T10:00:00Z" to={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws the changes made between two posts', () => {
    useChanges([campaignSet, campaignShift, roomSet])
    render(
      <InGameCalendarProvider channelId="ch">
        <InGameDateDivider subChannelId={null} from="2026-11-19T10:00:00Z" to="2026-11-19T10:06:00Z" />
        <InGameDateDivider subChannelId="r1" from="2026-11-19T10:06:00Z" to={null} />
        <InGameDateDivider subChannelId={undefined} from={undefined} to={undefined} />
      </InGameCalendarProvider>,
    )
    expect(screen.getAllByTestId('in-game-date-divider').map(d => d.textContent)).toEqual([
      'Tue 14 Oct 1997',
      '3 days later: Fri 17 Oct 1997',
      'Mon 14 Jul 1997',
    ])
    expect(screen.getByRole('separator', { name: 'In-game date: Mon 14 Jul 1997' })).toBeInTheDocument()
  })
})
