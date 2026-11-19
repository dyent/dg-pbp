-- In-game calendar (Phase 2a step 5a, DECISIONS.md #30).
--
-- The GM sets the campaign's in-game date, and optionally a different date for
-- one room (a flashback or a parallel scene). Every change is a row in
-- ext_calendar_changes; the date in force at any moment (and so the in-game
-- date of a post) is the latest change before it:
--   * a room uses its own latest change, unless that change is a 'clear'
--     (back to the campaign date) or it has none;
--   * otherwise the campaign's latest change applies (sub_channel_id IS NULL).
-- The app draws a divider in the chat for each change and shows the date in
-- the room header. Nothing is stored on upstream's messages.
--
-- Dates are stored as a calendar type + day number, so other calendars can be
-- added later. 'gregorian': day 0 = 1970-01-01 (negative before), years 1-9999.

CREATE TABLE public.ext_calendar_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  -- NULL = the whole campaign; otherwise one room.
  sub_channel_id UUID REFERENCES public.sub_channels(id) ON DELETE CASCADE,
  calendar TEXT NOT NULL DEFAULT 'gregorian' CHECK (calendar IN ('gregorian')),
  kind TEXT NOT NULL CHECK (kind IN ('set', 'shift', 'clear')),
  -- The date in force after this change (NULL only for 'clear').
  day_number INTEGER,
  -- For 'shift': how far the date moved (for the divider text).
  shift_amount INTEGER,
  shift_unit TEXT CHECK (shift_unit IN ('day', 'week', 'month', 'year')),
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind = 'clear') = (day_number IS NULL)),
  CHECK (kind <> 'clear' OR sub_channel_id IS NOT NULL),
  CHECK ((kind = 'shift') = (shift_amount IS NOT NULL AND shift_unit IS NOT NULL))
);

CREATE INDEX ext_calendar_changes_channel_idx ON public.ext_calendar_changes (channel_id, created_at);

ALTER TABLE public.ext_calendar_changes ENABLE ROW LEVEL SECURITY;

-- Members see campaign-wide changes and the changes of rooms they can see.
CREATE POLICY "Calendar changes are readable with their room"
  ON public.ext_calendar_changes FOR SELECT TO authenticated
  USING (
    is_channel_gm(channel_id)
    OR (is_channel_member(channel_id)
        AND (sub_channel_id IS NULL OR can_view_sub_channel(sub_channel_id)))
  );

REVOKE ALL ON public.ext_calendar_changes FROM anon;
GRANT SELECT ON public.ext_calendar_changes TO authenticated;
GRANT ALL ON public.ext_calendar_changes TO service_role;

-- Live updates: the app reloads the changes whenever one is added or undone.
ALTER PUBLICATION supabase_realtime ADD TABLE public.ext_calendar_changes;

-- ---------------------------------------------------------------------------
-- Internal helpers (no API grants)
-- ---------------------------------------------------------------------------

-- Raise unless the caller is the campaign's GM, the campaign isn't archived,
-- and the room (if given) belongs to it.
CREATE FUNCTION public.ext__require_calendar_gm(p_channel_id UUID, p_sub_channel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(is_channel_gm(p_channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can change the in-game date' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF p_sub_channel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sub_channels WHERE id = p_sub_channel_id AND channel_id = p_channel_id
  ) THEN
    RAISE EXCEPTION 'That room is not in this campaign' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- The day number in force now for the campaign (room NULL) or a room, or NULL
-- when no date has been set.
CREATE FUNCTION public.ext__current_day(p_channel_id UUID, p_sub_channel_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.ext_calendar_changes%ROWTYPE;
BEGIN
  IF p_sub_channel_id IS NOT NULL THEN
    SELECT * INTO r FROM public.ext_calendar_changes
     WHERE channel_id = p_channel_id AND sub_channel_id = p_sub_channel_id
     ORDER BY created_at DESC, id DESC LIMIT 1;
    IF r.id IS NOT NULL AND r.kind <> 'clear' THEN
      RETURN r.day_number;
    END IF;
  END IF;
  RETURN (SELECT day_number FROM public.ext_calendar_changes
           WHERE channel_id = p_channel_id AND sub_channel_id IS NULL
           ORDER BY created_at DESC, id DESC LIMIT 1);
END;
$$;

-- Does this room have its own date right now?
CREATE FUNCTION public.ext__room_has_own_date(p_channel_id UUID, p_sub_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT kind <> 'clear' FROM public.ext_calendar_changes
     WHERE channel_id = p_channel_id AND sub_channel_id = p_sub_channel_id
     ORDER BY created_at DESC, id DESC LIMIT 1
  ), false);
$$;

CREATE FUNCTION public.ext__check_day(p_day INTEGER)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_day IS NULL
     OR p_day < (DATE '0001-01-01' - DATE '1970-01-01')
     OR p_day > (DATE '9999-12-31' - DATE '1970-01-01') THEN
    RAISE EXCEPTION 'The in-game date must be between the years 1 and 9999' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ext__require_calendar_gm(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__current_day(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__room_has_own_date(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__check_day(INTEGER) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- GM functions
-- ---------------------------------------------------------------------------

-- Set the date for the whole campaign (room NULL) or one room.
CREATE FUNCTION public.ext_set_in_game_date(p_channel_id UUID, p_sub_channel_id UUID, p_day_number INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.ext__require_calendar_gm(p_channel_id, p_sub_channel_id);
  PERFORM public.ext__check_day(p_day_number);
  INSERT INTO public.ext_calendar_changes (channel_id, sub_channel_id, kind, day_number, changed_by)
  VALUES (p_channel_id, p_sub_channel_id, 'set', p_day_number, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Move the date forward (positive) or back (negative) by days, weeks, months
-- or years. A room without its own date starts from the campaign date (and
-- gets its own date from then on). Months and years keep the day of the month
-- where possible (31 Jan + 1 month = 28/29 Feb).
CREATE FUNCTION public.ext_shift_in_game_date(p_channel_id UUID, p_sub_channel_id UUID, p_amount INTEGER, p_unit TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
  v_id UUID;
BEGIN
  PERFORM public.ext__require_calendar_gm(p_channel_id, p_sub_channel_id);
  IF p_unit IS NULL OR p_unit NOT IN ('day', 'week', 'month', 'year') THEN
    RAISE EXCEPTION 'Choose days, weeks, months or years' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 OR abs(p_amount) > 1000 THEN
    RAISE EXCEPTION 'Move the date by 1 to 1000 at a time' USING ERRCODE = 'P0001';
  END IF;
  v_current := public.ext__current_day(p_channel_id, p_sub_channel_id);
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Set the in-game date first' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_new := (
      (DATE '1970-01-01' + v_current)
      + CASE p_unit
          WHEN 'day' THEN make_interval(days => p_amount)
          WHEN 'week' THEN make_interval(weeks => p_amount)
          WHEN 'month' THEN make_interval(months => p_amount)
          ELSE make_interval(years => p_amount)
        END
    )::date - DATE '1970-01-01';
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    v_new := NULL;
  END;
  PERFORM public.ext__check_day(v_new);

  INSERT INTO public.ext_calendar_changes (channel_id, sub_channel_id, kind, day_number, shift_amount, shift_unit, changed_by)
  VALUES (p_channel_id, p_sub_channel_id, 'shift', v_new, p_amount, p_unit, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Return a room to the campaign date.
CREATE FUNCTION public.ext_clear_room_date(p_channel_id UUID, p_sub_channel_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_sub_channel_id IS NULL THEN
    RAISE EXCEPTION 'Choose a room' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.ext__require_calendar_gm(p_channel_id, p_sub_channel_id);
  IF NOT public.ext__room_has_own_date(p_channel_id, p_sub_channel_id) THEN
    RAISE EXCEPTION 'This room already follows the campaign date' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.ext_calendar_changes (channel_id, sub_channel_id, kind, changed_by)
  VALUES (p_channel_id, p_sub_channel_id, 'clear', auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Undo the campaign's most recent date change (for mistakes). Only the latest
-- one, so the dates of earlier posts never shift unexpectedly.
CREATE FUNCTION public.ext_undo_in_game_date_change(p_change_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.ext_calendar_changes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.ext_calendar_changes WHERE id = p_change_id;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Only the GM can change the in-game date' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ext__require_calendar_gm(r.channel_id, NULL);
  IF EXISTS (
    SELECT 1 FROM public.ext_calendar_changes
     WHERE channel_id = r.channel_id AND (created_at, id) > (r.created_at, r.id)
  ) THEN
    RAISE EXCEPTION 'Only the most recent date change can be undone' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.ext_calendar_changes WHERE id = p_change_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_set_in_game_date(UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_shift_in_game_date(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_clear_room_date(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_undo_in_game_date_change(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_set_in_game_date(UUID, UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_shift_in_game_date(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_clear_room_date(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_undo_in_game_date_change(UUID) TO authenticated, service_role;
