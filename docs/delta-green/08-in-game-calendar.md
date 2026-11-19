# In-Game Calendar: How to Use It

*Phase 2a step 5a, built 2026-11-19. Design: `07-step5-design.md`. Decision: DECISIONS.md #30.
Access: `PERMISSIONS.md`.*

## What everyone sees

- A line under the room's status bar: **In-game date: Fri 17 Oct 1997**. In a room it also says
  whether that's the *campaign date* or the room's *own date*.
- A dashed **divider in the chat** wherever the date changed, e.g.
  *3 days later: Fri 17 Oct 1997*, *Mon 14 Jul 1997* (set directly) or
  *Back to the campaign date: Fri 17 Oct 1997*. Dividers appear between the posts written before
  and after the change, and update live.
- Players see nothing until the GM sets a first date.

## Changing the date (GM)

Click **Set the in-game date** (first time) or **Change date**:

- **Move time by** a number of days, weeks, months or years, then **Forward** or **Back**. Months
  and years keep the day of the month where they can (31 Jan + 1 month = 28 Feb).
- **Set the date to** a specific date (years 1 to 9999).
- In a room, choose **The whole campaign** or **Only this room**:
  - *Only this room* gives the room its own date (a flashback, or a scene running at a different
    time). Campaign changes then don't affect that room.
  - **Return this room to the campaign date** makes it follow the campaign again.
  - Main always uses the campaign date.
- **Undo the last change** removes the campaign's most recent date change (in any room), for
  mistakes. Only the most recent one can be undone, so older posts never change date unexpectedly.

Archived campaigns keep their date; nobody can change it.

## How it works

Each change is stored with the moment it was made. The date of any post is the date that was in
force when it was written, so later steps (the activity log) can show in-game dates without
changing upstream's posts. Dates are stored as a calendar type plus a day number; only the Earth
(Gregorian) calendar exists for now, and custom calendars can be added later.

## Known limits

- Dates only, no time of day (DECISIONS.md #30).
- The first post loaded on screen shows no divider above it: older history is paged in, so the
  date before it isn't known yet. The header always shows the current date.
- Upstream's Favorites and Whispers views mix rooms; dividers there follow each post's own room.

## Files

| Code | Purpose |
|---|---|
| `supabase/migrations/20261119002024_ext_in_game_calendar.sql` | Change table, access rules, GM functions (set, move, clear a room, undo) |
| `src/features/ext/calendar/calendarModel.ts` | Day numbers, formatting, which date applies, divider wording |
| `calendarApi.ts`, `useCalendarChanges.ts`, `calendarContext.tsx` | Database calls, live loading, the provider `ChannelView` wraps around the campaign |
| `InGameDateBar.tsx` | Date line and GM controls (rendered by `ChannelView`) |
| `InGameDateDivider.tsx` | Chat dividers (rendered by `MessageList`) |

<!-- cspell:locale en-GB,en -->
