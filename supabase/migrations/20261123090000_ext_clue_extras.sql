-- Clue extras (Phase 2b step 4, DECISIONS.md #41).
--
--   * Status: 'unexamined' (new clues), 'investigated' or 'resolved'. Players
--     who can see the clue see it; only the GM changes it.
--   * Found: by which PC, where (a location record) and the in-game day, all
--     optional. Players see a name only when they can see that PC / location
--     (ext_clue_details).
--   * GM checklist (ext_clue_points): what the clue really points to, one line
--     each, with a "worked out" tick. Always GM only.
--   * Status and found changes are logged in the record's GM-only history.
-- The columns live on ext_records and stay empty for other kinds.

-- ---------------------------------------------------------------------------
-- 1. Clue columns on records
-- ---------------------------------------------------------------------------

ALTER TABLE public.ext_records
  ADD COLUMN clue_status TEXT CHECK (clue_status IN ('unexamined', 'investigated', 'resolved')),
  ADD COLUMN found_by_character_id UUID REFERENCES public.ext_characters(id) ON DELETE SET NULL,
  ADD COLUMN found_at_record_id UUID REFERENCES public.ext_records(id) ON DELETE SET NULL,
  ADD COLUMN found_day INTEGER;

-- Clues made before this step start as unexamined.
UPDATE public.ext_records SET clue_status = 'unexamined' WHERE kind = 'clue';

ALTER TABLE public.ext_records
  ADD CONSTRAINT ext_records_clue_status_only_clues CHECK ((kind = 'clue') = (clue_status IS NOT NULL)),
  ADD CONSTRAINT ext_records_found_only_clues CHECK (
    kind = 'clue' OR (found_by_character_id IS NULL AND found_at_record_id IS NULL AND found_day IS NULL)
  );

CREATE INDEX ext_records_found_by_idx ON public.ext_records (found_by_character_id) WHERE found_by_character_id IS NOT NULL;
CREATE INDEX ext_records_found_at_idx ON public.ext_records (found_at_record_id) WHERE found_at_record_id IS NOT NULL;

-- The GM's existing update policy covers these columns (records are GM-written).

ALTER TABLE public.ext_record_events
  DROP CONSTRAINT ext_record_events_event_type_check,
  ADD CONSTRAINT ext_record_events_event_type_check CHECK (event_type IN (
    'created', 'renamed', 'visibility_changed', 'field_edited', 'field_visibility_changed',
    'aliases_changed', 'status_changed', 'found_changed'
  ));

-- ---------------------------------------------------------------------------
-- 2. Guard: clue defaults and what "found" may point to
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_records_clue_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only on insert: clearing the status later fails the check constraint.
  IF TG_OP = 'INSERT' AND NEW.kind = 'clue' AND NEW.clue_status IS NULL THEN
    NEW.clue_status := 'unexamined';
  END IF;

  IF NEW.found_by_character_id IS NOT NULL
     AND NEW.found_by_character_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.found_by_character_id END)
     AND NOT EXISTS (
       SELECT 1 FROM public.ext_characters c
       WHERE c.id = NEW.found_by_character_id AND c.channel_id = NEW.channel_id AND c.kind = 'pc') THEN
    RAISE EXCEPTION 'A clue can only be found by a PC of this campaign' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.found_at_record_id IS NOT NULL
     AND NEW.found_at_record_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.found_at_record_id END)
     AND NOT EXISTS (
       SELECT 1 FROM public.ext_records r
       WHERE r.id = NEW.found_at_record_id AND r.channel_id = NEW.channel_id AND r.kind = 'location') THEN
    RAISE EXCEPTION 'A clue can only be found at a location of this campaign' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.found_day IS NOT NULL THEN
    PERFORM public.ext__check_day(NEW.found_day);
  END IF;
  RETURN NEW;
END;
$$;

-- Runs before ext_records_guard (triggers fire in name order).
CREATE TRIGGER ext_records_clue_guard
  BEFORE INSERT OR UPDATE ON public.ext_records
  FOR EACH ROW EXECUTE FUNCTION public.ext_records_clue_guard();

REVOKE ALL ON FUNCTION public.ext_records_clue_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. History: status and found changes (replaces the step-1 function body)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ext_records_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
    VALUES (NEW.id, NEW.channel_id, 'renamed', jsonb_build_object('from', OLD.name, 'to', NEW.name), auth.uid());
  END IF;
  IF NEW.clue_status IS DISTINCT FROM OLD.clue_status THEN
    INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
    VALUES (NEW.id, NEW.channel_id, 'status_changed',
            jsonb_build_object('from', OLD.clue_status, 'to', NEW.clue_status), auth.uid());
  END IF;
  IF NEW.found_by_character_id IS DISTINCT FROM OLD.found_by_character_id
     OR NEW.found_at_record_id IS DISTINCT FROM OLD.found_at_record_id
     OR NEW.found_day IS DISTINCT FROM OLD.found_day THEN
    INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
    VALUES (NEW.id, NEW.channel_id, 'found_changed', jsonb_build_object(
      'by', (SELECT name FROM public.ext_characters WHERE id = NEW.found_by_character_id),
      'at', (SELECT name FROM public.ext_records WHERE id = NEW.found_at_record_id),
      'day', NEW.found_day
    ), auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reading the found details with names the viewer may see
-- ---------------------------------------------------------------------------

-- For a clue the caller can see: status and found details. A name is given
-- only when the caller can see that PC / location (otherwise both id and name
-- are NULL, so nothing leaks). Empty for anything else.
CREATE FUNCTION public.ext_clue_details(p_record_id UUID)
RETURNS TABLE (
  clue_status TEXT,
  found_by_character_id UUID,
  found_by_name TEXT,
  found_at_record_id UUID,
  found_at_name TEXT,
  found_day INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.clue_status,
         CASE WHEN c.id IS NOT NULL AND public.ext_can_read_entry(c.id, 'players', false) THEN c.id END,
         CASE WHEN c.id IS NOT NULL AND public.ext_can_read_entry(c.id, 'players', false) THEN c.name END,
         CASE WHEN l.id IS NOT NULL AND public.ext_can_read_record(l.id) THEN l.id END,
         CASE WHEN l.id IS NOT NULL AND public.ext_can_read_record(l.id) THEN l.name END,
         r.found_day
  FROM public.ext_records r
  LEFT JOIN public.ext_characters c ON c.id = r.found_by_character_id
  LEFT JOIN public.ext_records l ON l.id = r.found_at_record_id
  WHERE r.id = p_record_id
    AND r.kind = 'clue'
    AND public.ext_can_read_record(r.id);
$$;

REVOKE ALL ON FUNCTION public.ext_clue_details(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_clue_details(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The GM checklist
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_clue_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  -- Copied from the clue by the guard trigger.
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (body = btrim(body) AND char_length(body) BETWEEN 1 AND 300),
  worked_out BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ext_clue_points_record_idx ON public.ext_clue_points (record_id, sort_order);

ALTER TABLE public.ext_clue_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM reads clue checklists"
  ON public.ext_clue_points FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

CREATE POLICY "GM adds checklist points"
  ON public.ext_clue_points FOR INSERT TO authenticated
  WITH CHECK (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_clue_points.channel_id AND c.is_archived)
  );

CREATE POLICY "GM edits checklist points"
  ON public.ext_clue_points FOR UPDATE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_clue_points.channel_id AND c.is_archived)
  )
  WITH CHECK (is_channel_gm(channel_id));

CREATE POLICY "GM removes checklist points"
  ON public.ext_clue_points FOR DELETE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_clue_points.channel_id AND c.is_archived)
  );

REVOKE ALL ON public.ext_clue_points FROM anon;
GRANT SELECT, INSERT, DELETE ON public.ext_clue_points TO authenticated;
GRANT UPDATE (body, worked_out, sort_order) ON public.ext_clue_points TO authenticated;
GRANT ALL ON public.ext_clue_points TO service_role;

-- Points belong to clues; the clue (and campaign) never change.
CREATE FUNCTION public.ext_clue_points_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.ext_records%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.record_id IS DISTINCT FROM OLD.record_id OR NEW.channel_id IS DISTINCT FROM OLD.channel_id THEN
      RAISE EXCEPTION 'A checklist point cannot move to another clue' USING ERRCODE = 'P0001';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM public.ext_records WHERE id = NEW.record_id;
  IF r.id IS NULL OR r.kind <> 'clue' THEN
    RAISE EXCEPTION 'Checklist points belong to clues' USING ERRCODE = 'P0001';
  END IF;
  NEW.channel_id := r.channel_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ext_clue_points_guard
  BEFORE INSERT OR UPDATE ON public.ext_clue_points
  FOR EACH ROW EXECUTE FUNCTION public.ext_clue_points_guard();

REVOKE ALL ON FUNCTION public.ext_clue_points_guard() FROM PUBLIC, anon, authenticated, service_role;
