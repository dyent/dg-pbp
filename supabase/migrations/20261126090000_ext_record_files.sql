-- Files on records, and clue checklists from imports (owner feedback on Phase
-- 3, DECISIONS.md #50).
--
--   * A record (location, organisation, clue, operation) can have campaign
--     files attached: a letter, a map, a photo. The GM attaches and removes
--     them; players see an attached file only when they can see both the
--     record and the file (each keeps its own sharing). Files don't list what
--     they are attached to (owner choice).
--   * Approving an imported handout attaches its new file to the record the
--     AI said it belongs to ("related_to"), when one by that name exists.
--   * Approving (or merging) an imported clue adds its suggested GM checklist
--     points ("checklist").

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_record_files (
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.ext_campaign_files(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_id, file_id)
);

CREATE INDEX ext_record_files_file_idx ON public.ext_record_files (file_id);

ALTER TABLE public.ext_record_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM reads record files"
  ON public.ext_record_files FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

CREATE POLICY "GM attaches record files"
  ON public.ext_record_files FOR INSERT TO authenticated
  WITH CHECK (
    is_channel_gm(channel_id)
    AND created_by = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_record_files.channel_id AND c.is_archived)
  );

CREATE POLICY "GM removes record files"
  ON public.ext_record_files FOR DELETE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_record_files.channel_id AND c.is_archived)
  );

REVOKE ALL ON public.ext_record_files FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.ext_record_files TO authenticated;
GRANT ALL ON public.ext_record_files TO service_role;

-- The record and the file must be in the same campaign (copied from the record).
CREATE FUNCTION public.ext_record_files_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_channel UUID;
  v_file_channel UUID;
BEGIN
  SELECT channel_id INTO v_record_channel FROM public.ext_records WHERE id = NEW.record_id;
  SELECT channel_id INTO v_file_channel FROM public.ext_campaign_files WHERE id = NEW.file_id;
  IF v_record_channel IS NULL OR v_file_channel IS NULL OR v_record_channel <> v_file_channel THEN
    RAISE EXCEPTION 'The file and the record must be in the same campaign' USING ERRCODE = 'P0001';
  END IF;
  NEW.channel_id := v_record_channel;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_record_files_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER ext_record_files_guard
  BEFORE INSERT ON public.ext_record_files
  FOR EACH ROW EXECUTE FUNCTION public.ext_record_files_guard();

-- ---------------------------------------------------------------------------
-- 2. Reading: a record's files the caller may open
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_record_files_for(p_record_id UUID)
RETURNS TABLE (file_id UUID, title TEXT, description TEXT, folder TEXT, visibility TEXT, attached_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.title, f.description, f.folder, f.visibility, rf.created_at
  FROM public.ext_record_files rf
  JOIN public.ext_campaign_files f ON f.id = rf.file_id
  WHERE rf.record_id = p_record_id
    AND public.ext_can_read_record(p_record_id)
    AND public.ext_can_read_campaign_file(f.id)
  ORDER BY f.title, f.id;
$$;

REVOKE ALL ON FUNCTION public.ext_record_files_for(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_record_files_for(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Imports: clue checklists and handout attachments
-- ---------------------------------------------------------------------------

-- Adds suggested checklist points to a clue, skipping ones already there.
CREATE FUNCTION public.ext__add_suggested_checklist(p_record_id UUID, p_points JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point TEXT;
  v_order INTEGER;
  v_added INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_points) <> 'array' OR NOT EXISTS (SELECT 1 FROM public.ext_records WHERE id = p_record_id AND kind = 'clue') THEN
    RETURN 0;
  END IF;
  SELECT COALESCE(max(sort_order), 0) INTO v_order FROM public.ext_clue_points WHERE record_id = p_record_id;
  FOR v_point IN SELECT left(btrim(x), 300) FROM jsonb_array_elements_text(p_points) x LIMIT 20
  LOOP
    CONTINUE WHEN v_point = '' OR EXISTS (
      SELECT 1 FROM public.ext_clue_points WHERE record_id = p_record_id AND lower(body) = lower(v_point));
    v_order := v_order + 10;
    INSERT INTO public.ext_clue_points (record_id, channel_id, body, sort_order)
    SELECT p_record_id, channel_id, v_point, v_order FROM public.ext_records WHERE id = p_record_id;
    v_added := v_added + 1;
  END LOOP;
  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.ext__add_suggested_checklist(UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;

-- Approving: as before, plus a clue's checklist points.
CREATE OR REPLACE FUNCTION public.ext_approve_suggestion(p_suggestion_id UUID, p_name TEXT DEFAULT NULL, p_fields JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.ext_import_suggestions;
  v_name TEXT;
  v_fields JSONB;
  v_id UUID;
  v_type TEXT;
  v_from RECORD;
  v_to RECORD;
  v_label TEXT;
BEGIN
  s := public.ext__pending_suggestion(p_suggestion_id);
  v_name := left(btrim(COALESCE(NULLIF(btrim(p_name), ''), s.name)), 80);
  v_fields := COALESCE(p_fields, s.details->'fields', '[]'::jsonb);
  IF COALESCE(s.details->>'summary', '') <> '' THEN
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'key', CASE WHEN s.kind = 'npc' THEN 'background' WHEN s.kind = 'operation' THEN 'summary' ELSE 'description' END,
      'value', s.details->>'summary'));
  END IF;

  IF s.kind = 'npc' THEN
    INSERT INTO public.ext_characters (channel_id, kind, name, revealed, created_by, provenance)
    VALUES (s.channel_id, 'npc', v_name, false, auth.uid(), 'source')
    RETURNING id INTO v_id;
    v_type := 'character';
    PERFORM public.ext__apply_suggested_fields(v_id, NULL, s.channel_id, v_fields, public.ext__suggestion_reference(s));
  ELSIF s.kind IN ('location', 'organisation', 'clue', 'operation') THEN
    INSERT INTO public.ext_records (channel_id, kind, name, created_by, provenance)
    VALUES (s.channel_id, s.kind, v_name, auth.uid(), 'source')
    RETURNING id INTO v_id;
    v_type := 'record';
    PERFORM public.ext__apply_suggested_fields(NULL, v_id, s.channel_id, v_fields, public.ext__suggestion_reference(s));
    IF s.kind = 'clue' THEN
      PERFORM public.ext__add_suggested_checklist(v_id, s.details->'checklist');
    END IF;
  ELSIF s.kind = 'link' THEN
    SELECT * INTO v_from FROM public.ext__find_end_by_name(s.channel_id, s.details->'link'->>'from');
    SELECT * INTO v_to FROM public.ext__find_end_by_name(s.channel_id, s.details->'link'->>'to');
    v_label := left(btrim(COALESCE(NULLIF(btrim(p_name), ''), NULLIF(s.details->'link'->>'label', ''), s.name)), 60);
    BEGIN
      INSERT INTO public.ext_links (channel_id, from_character_id, from_record_id, to_character_id, to_record_id, label, created_by)
      VALUES (s.channel_id, v_from.character_id, v_from.record_id, v_to.character_id, v_to.record_id, v_label, auth.uid())
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'These two are already linked with that label' USING ERRCODE = 'P0001';
    END;
    v_type := 'link';
  ELSE
    RAISE EXCEPTION 'Handouts are approved from the app' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ext_import_suggestions
    SET status = 'approved', details = details || jsonb_build_object('created', jsonb_build_object('type', v_type, 'id', v_id))
    WHERE id = s.id;
  RETURN jsonb_build_object('type', v_type, 'id', v_id);
END;
$$;

-- Merging: as before, plus a clue's checklist points.
CREATE OR REPLACE FUNCTION public.ext_merge_suggestion(
  p_suggestion_id UUID, p_character_id UUID DEFAULT NULL, p_record_id UUID DEFAULT NULL, p_fields JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.ext_import_suggestions;
  v_done INTEGER;
BEGIN
  s := public.ext__pending_suggestion(p_suggestion_id);
  IF num_nonnulls(p_character_id, p_record_id) <> 1 THEN
    RAISE EXCEPTION 'Choose what to merge into' USING ERRCODE = '22023';
  END IF;
  IF s.kind = 'npc' THEN
    IF p_character_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.ext_characters WHERE id = p_character_id AND channel_id = s.channel_id) THEN
      RAISE EXCEPTION 'Choose a character of this campaign to merge into' USING ERRCODE = 'P0001';
    END IF;
  ELSIF s.kind IN ('location', 'organisation', 'clue', 'operation') THEN
    IF p_record_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.ext_records WHERE id = p_record_id AND channel_id = s.channel_id AND kind = s.kind) THEN
      RAISE EXCEPTION 'Choose a record of the same kind to merge into' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only NPCs and records can be merged' USING ERRCODE = 'P0001';
  END IF;

  v_done := public.ext__apply_suggested_fields(
    p_character_id, p_record_id, s.channel_id, COALESCE(p_fields, s.details->'fields', '[]'::jsonb), public.ext__suggestion_reference(s));
  IF s.kind = 'clue' THEN
    v_done := v_done + public.ext__add_suggested_checklist(p_record_id, s.details->'checklist');
  END IF;
  UPDATE public.ext_import_suggestions
    SET status = 'merged', details = details || jsonb_build_object('created', jsonb_build_object(
      'type', CASE WHEN p_character_id IS NOT NULL THEN 'character' ELSE 'record' END,
      'id', COALESCE(p_character_id, p_record_id)))
    WHERE id = s.id;
  RETURN v_done;
END;
$$;

-- Handouts: as before, and attach the new file to the record it belongs to.
-- Returns that record's name, or NULL when none matched.
DROP FUNCTION public.ext_finish_handout_suggestion(UUID, UUID);

CREATE FUNCTION public.ext_finish_handout_suggestion(p_suggestion_id UUID, p_file_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.ext_import_suggestions;
  v_record UUID;
  v_record_name TEXT;
BEGIN
  s := public.ext__pending_suggestion(p_suggestion_id);
  IF s.kind <> 'handout' THEN
    RAISE EXCEPTION 'This suggestion is not a handout' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ext_campaign_files WHERE id = p_file_id AND channel_id = s.channel_id) THEN
    RAISE EXCEPTION 'That file is not in this campaign' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(btrim(s.details->>'relatedTo'), '') <> '' THEN
    SELECT id, name INTO v_record, v_record_name FROM public.ext_records
    WHERE channel_id = s.channel_id AND lower(name) = lower(btrim(s.details->>'relatedTo'))
    ORDER BY created_at LIMIT 1;
    IF v_record IS NOT NULL THEN
      INSERT INTO public.ext_record_files (record_id, file_id, channel_id, created_by)
      VALUES (v_record, p_file_id, s.channel_id, auth.uid())
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  UPDATE public.ext_import_suggestions
    SET status = 'approved', details = details || jsonb_build_object(
      'created', jsonb_build_object('type', 'file', 'id', p_file_id),
      'attachedTo', v_record_name)
    WHERE id = s.id;
  RETURN v_record_name;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_finish_handout_suggestion(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_finish_handout_suggestion(UUID, UUID) TO authenticated, service_role;
