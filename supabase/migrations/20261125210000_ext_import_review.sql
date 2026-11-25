-- Reviewing imports (Phase 3 steps 4 and 5, DECISIONS.md #49), plus owner
-- feedback on step 3: 10 pages per run becomes a suggestion (at most 30), and
-- repeats across runs of one source are combined.
--
--   * Approving a suggestion creates a hidden NPC or a GM-only record (or a
--     GM-only link between two existing items), labelled 'source'. Its fields
--     fill the standard profile fields; others become GM-only extra fields; a
--     GM-only "From the book" field says where it came from.
--   * Merging into an existing NPC or record only fills empty fields and adds
--     missing ones; nothing the GM wrote is overwritten.
--   * Handouts are made into campaign files by the app (it cuts the pages out
--     in the browser), then recorded here with ext_finish_handout_suggestion.
--   * Source vs canon: characters and fields get a provenance column; a
--     'source' field becomes 'canon' as soon as its text is edited.
--   * GM of the campaign only, never in archived campaigns.

-- ---------------------------------------------------------------------------
-- 1. Runs: up to 30 pages; how many repeats were combined
-- ---------------------------------------------------------------------------

ALTER TABLE public.ext_import_runs
  DROP CONSTRAINT ext_import_runs_range,
  ADD CONSTRAINT ext_import_runs_range CHECK (last_page >= first_page AND last_page - first_page < 30),
  ADD COLUMN combined_count INTEGER NOT NULL DEFAULT 0 CHECK (combined_count >= 0);

-- ---------------------------------------------------------------------------
-- 2. Source vs canon on characters and fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.ext_characters
  ADD COLUMN provenance TEXT NOT NULL DEFAULT 'canon' CHECK (provenance IN ('canon', 'source'));
ALTER TABLE public.ext_character_fields
  ADD COLUMN provenance TEXT NOT NULL DEFAULT 'canon' CHECK (provenance IN ('canon', 'source'));
ALTER TABLE public.ext_record_fields
  ADD COLUMN provenance TEXT NOT NULL DEFAULT 'canon' CHECK (provenance IN ('canon', 'source'));

-- Editing a field's text makes it the GM's own (canon).
CREATE FUNCTION public.ext__field_becomes_canon()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body AND OLD.provenance = 'source'
     AND COALESCE(current_setting('ext.keep_source', true), '') <> 'on' THEN
    NEW.provenance := 'canon';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ext__field_becomes_canon() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER ext_character_fields_becomes_canon
  BEFORE UPDATE OF body ON public.ext_character_fields
  FOR EACH ROW EXECUTE FUNCTION public.ext__field_becomes_canon();
CREATE TRIGGER ext_record_fields_becomes_canon
  BEFORE UPDATE OF body ON public.ext_record_fields
  FOR EACH ROW EXECUTE FUNCTION public.ext__field_becomes_canon();

-- ---------------------------------------------------------------------------
-- 3. Internal helpers
-- ---------------------------------------------------------------------------

-- The suggestion, if the caller is its campaign's GM, the campaign isn't
-- archived and the suggestion is still waiting.
CREATE FUNCTION public.ext__pending_suggestion(p_suggestion_id UUID)
RETURNS public.ext_import_suggestions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.ext_import_suggestions;
BEGIN
  SELECT * INTO s FROM public.ext_import_suggestions WHERE id = p_suggestion_id;
  IF s.id IS NULL OR NOT COALESCE(is_channel_gm(s.channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can review imports' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = s.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF s.status <> 'pending' THEN
    RAISE EXCEPTION 'This suggestion has already been dealt with' USING ERRCODE = 'P0001';
  END IF;
  RETURN s;
END;
$$;

-- "Last Things Last, p. 14, 21" for a suggestion.
CREATE FUNCTION public.ext__suggestion_reference(s public.ext_import_suggestions)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT left(src.title || COALESCE(', p. ' || NULLIF((
      SELECT string_agg(p::text, ', ' ORDER BY p)
      FROM (SELECT DISTINCT jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(s.details->'pages') = 'array' THEN s.details->'pages'
                   ELSE COALESCE(jsonb_build_array(s.page), '[]'::jsonb) END)::int AS p) pages
    ), ''), ''), 8000)
  FROM public.ext_import_runs r
  JOIN public.ext_sources src ON src.id = r.source_id
  WHERE r.id = s.run_id;
$$;

-- Writes suggested fields into a character or record. Standard keys fill the
-- matching field when it is empty (p_overwrite_empty_only) or always (a new
-- item); other keys become GM-only extra fields unless one with that label
-- exists. Returns how many fields were filled or added.
CREATE FUNCTION public.ext__apply_suggested_fields(
  p_character_id UUID, p_record_id UUID, p_channel_id UUID, p_fields JSONB, p_reference TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f JSONB;
  v_key TEXT;
  v_label TEXT;
  v_value TEXT;
  v_order INTEGER;
  v_done INTEGER := 0;
  v_rows INTEGER;
BEGIN
  -- Writing book text keeps fields labelled source (see ext__field_becomes_canon).
  PERFORM set_config('ext.keep_source', 'on', true);
  IF p_character_id IS NOT NULL THEN
    SELECT COALESCE(max(sort_order), 0) INTO v_order FROM public.ext_character_fields WHERE character_id = p_character_id;
  ELSE
    SELECT COALESCE(max(sort_order), 0) INTO v_order FROM public.ext_record_fields WHERE record_id = p_record_id;
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_fields) = 'array' THEN p_fields ELSE '[]'::jsonb END)
  LOOP
    v_key := lower(btrim(COALESCE(f->>'key', '')));
    v_value := left(btrim(COALESCE(f->>'value', '')), 8000);
    v_label := left(btrim(COALESCE(NULLIF(btrim(f->>'label'), ''), v_key)), 60);
    CONTINUE WHEN v_value = '' OR v_label = '';

    -- A standard field of this kind: fill it while it is still empty.
    IF p_character_id IS NOT NULL THEN
      UPDATE public.ext_character_fields
        SET body = v_value, provenance = 'source'
        WHERE character_id = p_character_id AND field_key = v_key AND btrim(body) = '';
    ELSE
      UPDATE public.ext_record_fields
        SET body = v_value, provenance = 'source'
        WHERE record_id = p_record_id AND field_key = v_key AND btrim(body) = '';
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      v_done := v_done + 1;
      CONTINUE;
    END IF;

    -- Already there with the GM's own text: leave it alone.
    IF p_character_id IS NOT NULL THEN
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.ext_character_fields
        WHERE character_id = p_character_id AND (field_key = v_key OR lower(label) = lower(v_label)));
      v_order := v_order + 10;
      INSERT INTO public.ext_character_fields (character_id, channel_id, label, body, visibility, sort_order, provenance)
      VALUES (p_character_id, p_channel_id, v_label, v_value, 'gm', v_order, 'source');
    ELSE
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.ext_record_fields
        WHERE record_id = p_record_id AND (field_key = v_key OR lower(label) = lower(v_label)));
      v_order := v_order + 10;
      INSERT INTO public.ext_record_fields (record_id, channel_id, label, body, visibility, sort_order, provenance)
      VALUES (p_record_id, p_channel_id, v_label, v_value, 'gm', v_order, 'source');
    END IF;
    v_done := v_done + 1;
  END LOOP;

  -- Where it came from (GM only), added once and extended on later merges.
  IF p_reference IS NOT NULL AND p_reference <> '' THEN
    IF p_character_id IS NOT NULL THEN
      UPDATE public.ext_character_fields
        SET body = left(body || E'\n' || p_reference, 8000)
        WHERE character_id = p_character_id AND label = 'From the book' AND position(p_reference IN body) = 0;
      IF NOT EXISTS (SELECT 1 FROM public.ext_character_fields WHERE character_id = p_character_id AND label = 'From the book') THEN
        INSERT INTO public.ext_character_fields (character_id, channel_id, label, body, visibility, sort_order, provenance)
        VALUES (p_character_id, p_channel_id, 'From the book', p_reference, 'gm', v_order + 10, 'source');
      END IF;
    ELSE
      UPDATE public.ext_record_fields
        SET body = left(body || E'\n' || p_reference, 8000)
        WHERE record_id = p_record_id AND label = 'From the book' AND position(p_reference IN body) = 0;
      IF NOT EXISTS (SELECT 1 FROM public.ext_record_fields WHERE record_id = p_record_id AND label = 'From the book') THEN
        INSERT INTO public.ext_record_fields (record_id, channel_id, label, body, visibility, sort_order, provenance)
        VALUES (p_record_id, p_channel_id, 'From the book', p_reference, 'gm', v_order + 10, 'source');
      END IF;
    END IF;
  END IF;
  PERFORM set_config('ext.keep_source', '', true);
  RETURN v_done;
END;
$$;

-- The one character or record in a campaign with this name (any case), for link ends.
CREATE FUNCTION public.ext__find_end_by_name(p_channel_id UUID, p_name TEXT, OUT character_id UUID, OUT record_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chars UUID[];
  v_recs UUID[];
BEGIN
  SELECT array_agg(id) INTO v_chars FROM public.ext_characters WHERE channel_id = p_channel_id AND lower(name) = lower(btrim(p_name));
  SELECT array_agg(id) INTO v_recs FROM public.ext_records WHERE channel_id = p_channel_id AND lower(name) = lower(btrim(p_name));
  IF COALESCE(cardinality(v_chars), 0) + COALESCE(cardinality(v_recs), 0) = 0 THEN
    RAISE EXCEPTION 'Add or approve "%" first', btrim(p_name) USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(cardinality(v_chars), 0) + COALESCE(cardinality(v_recs), 0) > 1 THEN
    RAISE EXCEPTION 'More than one item is called "%"; add this link by hand', btrim(p_name) USING ERRCODE = 'P0001';
  END IF;
  character_id := v_chars[1];
  record_id := v_recs[1];
END;
$$;

REVOKE ALL ON FUNCTION public.ext__pending_suggestion(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__suggestion_reference(public.ext_import_suggestions) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__apply_suggested_fields(UUID, UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__find_end_by_name(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. GM functions
-- ---------------------------------------------------------------------------

-- Approve: create the NPC, record or link. p_name / p_fields replace the
-- suggested ones when the GM edited them first. Returns {type, id}.
CREATE FUNCTION public.ext_approve_suggestion(p_suggestion_id UUID, p_name TEXT DEFAULT NULL, p_fields JSONB DEFAULT NULL)
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
  -- A one-line summary fills the description (records) or background (NPCs) if nothing else does.
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

-- Merge into an existing NPC (or any character) or record of the same kind:
-- fills empty fields, adds missing ones, overwrites nothing. Returns how many
-- fields were filled or added.
CREATE FUNCTION public.ext_merge_suggestion(
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
  UPDATE public.ext_import_suggestions
    SET status = 'merged', details = details || jsonb_build_object('created', jsonb_build_object(
      'type', CASE WHEN p_character_id IS NOT NULL THEN 'character' ELSE 'record' END,
      'id', COALESCE(p_character_id, p_record_id)))
    WHERE id = s.id;
  RETURN v_done;
END;
$$;

-- Reject a waiting suggestion, or take a rejection back.
CREATE FUNCTION public.ext_set_suggestion_rejected(p_suggestion_id UUID, p_rejected BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.ext_import_suggestions;
BEGIN
  SELECT * INTO s FROM public.ext_import_suggestions WHERE id = p_suggestion_id;
  IF s.id IS NULL OR NOT COALESCE(is_channel_gm(s.channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can review imports' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = s.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF s.status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'This suggestion has already been added' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.ext_import_suggestions SET status = CASE WHEN p_rejected THEN 'rejected' ELSE 'pending' END WHERE id = s.id;
END;
$$;

-- After the app has made the handout's campaign file: mark the suggestion done.
CREATE FUNCTION public.ext_finish_handout_suggestion(p_suggestion_id UUID, p_file_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.ext_import_suggestions;
BEGIN
  s := public.ext__pending_suggestion(p_suggestion_id);
  IF s.kind <> 'handout' THEN
    RAISE EXCEPTION 'This suggestion is not a handout' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ext_campaign_files WHERE id = p_file_id AND channel_id = s.channel_id) THEN
    RAISE EXCEPTION 'That file is not in this campaign' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.ext_import_suggestions
    SET status = 'approved', details = details || jsonb_build_object('created', jsonb_build_object('type', 'file', 'id', p_file_id))
    WHERE id = s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_approve_suggestion(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_merge_suggestion(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_set_suggestion_rejected(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_finish_handout_suggestion(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_approve_suggestion(UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_merge_suggestion(UUID, UUID, UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_set_suggestion_rejected(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_finish_handout_suggestion(UUID, UUID) TO authenticated, service_role;
