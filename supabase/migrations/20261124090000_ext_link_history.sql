-- Link history and reversing links (owner feedback on Phase 2b step 3, DECISIONS.md #44).
--
--   * Every link added, removed, relabelled, shown / hidden or reversed is
--     written to the history of BOTH ends (character history and record
--     history; both GM only). The names are copied in at the time, so the
--     entry still reads correctly after a rename or a deletion.
--   * ext_reverse_link swaps a link's two ends ("the cult — works for → Dr
--     Hale" becomes "Dr Hale — works for → the cult"), keeping its label,
--     visibility and id. The guard still refuses any other change of ends.

-- ---------------------------------------------------------------------------
-- 1. New history entry types
-- ---------------------------------------------------------------------------

ALTER TABLE public.ext_character_events
  DROP CONSTRAINT ext_character_events_event_type_check,
  ADD CONSTRAINT ext_character_events_event_type_check CHECK (event_type IN (
    'created', 'renamed', 'status_changed', 'revealed', 'hidden',
    'field_visibility_changed', 'note',
    'given', 'taken', 'posting_started', 'posting_ended', 'converted_to_npc',
    'role_changed', 'field_edited', 'sheet_edited',
    'link_added', 'link_removed', 'link_changed', 'link_reversed'
  ));

ALTER TABLE public.ext_record_events
  DROP CONSTRAINT ext_record_events_event_type_check,
  ADD CONSTRAINT ext_record_events_event_type_check CHECK (event_type IN (
    'created', 'renamed', 'visibility_changed', 'field_edited', 'field_visibility_changed',
    'aliases_changed', 'status_changed', 'found_changed',
    'link_added', 'link_removed', 'link_changed', 'link_reversed'
  ));

-- ---------------------------------------------------------------------------
-- 2. Guard: the ends may only be swapped (reversed), never changed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ext_links_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from UUID;
  v_to UUID;
  v_same BOOLEAN;
  v_swapped BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_same := NEW.from_character_id IS NOT DISTINCT FROM OLD.from_character_id
      AND NEW.from_record_id IS NOT DISTINCT FROM OLD.from_record_id
      AND NEW.to_character_id IS NOT DISTINCT FROM OLD.to_character_id
      AND NEW.to_record_id IS NOT DISTINCT FROM OLD.to_record_id;
    v_swapped := NEW.from_character_id IS NOT DISTINCT FROM OLD.to_character_id
      AND NEW.from_record_id IS NOT DISTINCT FROM OLD.to_record_id
      AND NEW.to_character_id IS NOT DISTINCT FROM OLD.from_character_id
      AND NEW.to_record_id IS NOT DISTINCT FROM OLD.from_record_id;
    IF NOT (v_same OR v_swapped) OR NEW.channel_id IS DISTINCT FROM OLD.channel_id THEN
      RAISE EXCEPTION 'The ends of a link cannot change' USING ERRCODE = 'P0001';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  v_from := public.ext__link_end_channel(NEW.from_character_id, NEW.from_record_id);
  v_to := public.ext__link_end_channel(NEW.to_character_id, NEW.to_record_id);
  IF v_from IS NULL OR v_to IS NULL THEN
    RAISE EXCEPTION 'Both ends of a link must exist' USING ERRCODE = 'P0001';
  END IF;
  IF v_from <> v_to THEN
    RAISE EXCEPTION 'Both ends of a link must be in the same campaign' USING ERRCODE = 'P0001';
  END IF;
  NEW.channel_id := v_from;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. History: one entry on each end
-- ---------------------------------------------------------------------------

-- The current name of a link end, or NULL once it has been deleted.
CREATE FUNCTION public.ext__link_end_name(p_character_id UUID, p_record_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_character_id IS NOT NULL THEN (SELECT name FROM public.ext_characters WHERE id = p_character_id)
    ELSE (SELECT name FROM public.ext_records WHERE id = p_record_id)
  END;
$$;

REVOKE ALL ON FUNCTION public.ext__link_end_name(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Writes one history entry to an end, if that end (and its campaign) still
-- exists: when a record, character or campaign is deleted, its links go with
-- it and only the surviving end gets the entry.
CREATE FUNCTION public.ext__log_link_end(
  p_character_id UUID, p_record_id UUID, p_channel_id UUID, p_event_type TEXT, p_details JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.channels WHERE id = p_channel_id) THEN
    RETURN;
  END IF;
  IF p_character_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.ext_characters WHERE id = p_character_id) THEN
      INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
      VALUES (p_character_id, p_channel_id, p_event_type, p_details, 'gm', auth.uid());
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.ext_records WHERE id = p_record_id) THEN
    INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
    VALUES (p_record_id, p_channel_id, p_event_type, p_details, auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ext__log_link_end(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.ext_links_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ext_links;
  v_type TEXT;
  v_details JSONB;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF TG_OP = 'INSERT' THEN
    v_type := 'link_added';
  ELSIF TG_OP = 'DELETE' THEN
    v_type := 'link_removed';
  ELSIF NEW.from_character_id IS DISTINCT FROM OLD.from_character_id
        OR NEW.from_record_id IS DISTINCT FROM OLD.from_record_id THEN
    v_type := 'link_reversed';
  ELSIF NEW.label IS DISTINCT FROM OLD.label OR NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    v_type := 'link_changed';
  ELSE
    RETURN NULL;
  END IF;

  -- Names as they are now; a deleted end has no name any more (NULL).
  v_details := jsonb_build_object(
    'from', public.ext__link_end_name(v_row.from_character_id, v_row.from_record_id),
    'to', public.ext__link_end_name(v_row.to_character_id, v_row.to_record_id),
    'label', v_row.label,
    'visibility', v_row.visibility
  );
  IF v_type = 'link_changed' THEN
    v_details := v_details || jsonb_build_object('old_label', OLD.label, 'old_visibility', OLD.visibility);
  END IF;

  PERFORM public.ext__log_link_end(v_row.from_character_id, v_row.from_record_id, v_row.channel_id, v_type, v_details);
  PERFORM public.ext__log_link_end(v_row.to_character_id, v_row.to_record_id, v_row.channel_id, v_type, v_details);
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_links_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.ext_links
  FOR EACH ROW EXECUTE FUNCTION public.ext_links_after_change();

REVOKE ALL ON FUNCTION public.ext_links_after_change() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Reversing a link (GM only, not in archived campaigns)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_reverse_link(p_link_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel UUID;
BEGIN
  SELECT channel_id INTO v_channel FROM public.ext_links WHERE id = p_link_id;
  IF v_channel IS NULL OR NOT COALESCE(is_channel_gm(v_channel), false) THEN
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = v_channel AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ext_links
  SET from_character_id = to_character_id,
      from_record_id = to_record_id,
      to_character_id = from_character_id,
      to_record_id = from_record_id
  WHERE id = p_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_reverse_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_reverse_link(UUID) TO authenticated, service_role;
