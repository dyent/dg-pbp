-- Links between records and characters (Phase 2b step 3, DECISIONS.md #40).
--
-- Any record or character can be linked to any other with a short label, e.g.
-- "Kowalski — deputy at → Sheriff's office". A link shows on both ends.
--   * Each end is a character or a record (exactly one of the two columns).
--   * Both ends belong to the same campaign; the ends never change once the
--     link exists (delete it and add a new one instead).
--   * visibility 'gm' (the default) or 'players' (shown). Players see a shown
--     link only when they can see both ends, and only through ext_links_for,
--     which also gives them the other end's name (players can't read
--     ext_characters). The table itself is GM-only.
--   * Only the GM adds, edits and removes links; never in an archived campaign.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Copied from the ends by the guard trigger.
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  from_character_id UUID REFERENCES public.ext_characters(id) ON DELETE CASCADE,
  from_record_id UUID REFERENCES public.ext_records(id) ON DELETE CASCADE,
  to_character_id UUID REFERENCES public.ext_characters(id) ON DELETE CASCADE,
  to_record_id UUID REFERENCES public.ext_records(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 60),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm', 'players')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_links_one_from CHECK (num_nonnulls(from_character_id, from_record_id) = 1),
  CONSTRAINT ext_links_one_to CHECK (num_nonnulls(to_character_id, to_record_id) = 1),
  CONSTRAINT ext_links_not_to_self
    CHECK (COALESCE(from_character_id, from_record_id) <> COALESCE(to_character_id, to_record_id))
);

-- The same two ends can be linked more than once, but not twice with the same label.
CREATE UNIQUE INDEX ext_links_unique_idx ON public.ext_links (
  COALESCE(from_character_id, from_record_id),
  COALESCE(to_character_id, to_record_id),
  lower(label)
);
CREATE INDEX ext_links_from_character_idx ON public.ext_links (from_character_id) WHERE from_character_id IS NOT NULL;
CREATE INDEX ext_links_from_record_idx ON public.ext_links (from_record_id) WHERE from_record_id IS NOT NULL;
CREATE INDEX ext_links_to_character_idx ON public.ext_links (to_character_id) WHERE to_character_id IS NOT NULL;
CREATE INDEX ext_links_to_record_idx ON public.ext_links (to_record_id) WHERE to_record_id IS NOT NULL;
CREATE INDEX ext_links_channel_idx ON public.ext_links (channel_id);

ALTER TABLE public.ext_links ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Row-level security: GM only (players read through ext_links_for)
-- ---------------------------------------------------------------------------

CREATE POLICY "GM reads links"
  ON public.ext_links FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

CREATE POLICY "GM adds links"
  ON public.ext_links FOR INSERT TO authenticated
  WITH CHECK (
    is_channel_gm(channel_id)
    AND created_by = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_links.channel_id AND c.is_archived)
  );

CREATE POLICY "GM edits links"
  ON public.ext_links FOR UPDATE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_links.channel_id AND c.is_archived)
  )
  WITH CHECK (is_channel_gm(channel_id));

CREATE POLICY "GM removes links"
  ON public.ext_links FOR DELETE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_links.channel_id AND c.is_archived)
  );

REVOKE ALL ON public.ext_links FROM anon;
GRANT SELECT, INSERT, DELETE ON public.ext_links TO authenticated;
GRANT UPDATE (label, visibility) ON public.ext_links TO authenticated;
GRANT ALL ON public.ext_links TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Guard trigger: both ends in one campaign; ends fixed once created
-- ---------------------------------------------------------------------------

-- The campaign of a link end (character or record), or NULL if it doesn't exist.
CREATE FUNCTION public.ext__link_end_channel(p_character_id UUID, p_record_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_character_id IS NOT NULL THEN (SELECT channel_id FROM public.ext_characters WHERE id = p_character_id)
    ELSE (SELECT channel_id FROM public.ext_records WHERE id = p_record_id)
  END;
$$;

CREATE FUNCTION public.ext_links_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from UUID;
  v_to UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.from_character_id IS DISTINCT FROM OLD.from_character_id
       OR NEW.from_record_id IS DISTINCT FROM OLD.from_record_id
       OR NEW.to_character_id IS DISTINCT FROM OLD.to_character_id
       OR NEW.to_record_id IS DISTINCT FROM OLD.to_record_id
       OR NEW.channel_id IS DISTINCT FROM OLD.channel_id THEN
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

CREATE TRIGGER ext_links_guard
  BEFORE INSERT OR UPDATE ON public.ext_links
  FOR EACH ROW EXECUTE FUNCTION public.ext_links_guard();

REVOKE ALL ON FUNCTION public.ext__link_end_channel(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ext_links_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Reading: the links of one character or record, with the other end
-- ---------------------------------------------------------------------------

-- May the caller see this link end? Characters: revealed or their own PC.
CREATE FUNCTION public.ext__can_see_link_end(p_character_id UUID, p_record_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_character_id IS NOT NULL THEN public.ext_can_read_entry(p_character_id, 'players', false)
    ELSE public.ext_can_read_record(p_record_id)
  END;
$$;

REVOKE ALL ON FUNCTION public.ext__can_see_link_end(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Links of exactly one character or record. The GM gets every link; others
-- get shown links whose two ends they can both see. 'outgoing' is true when
-- the subject is the "from" end (subject — label → other).
CREATE FUNCTION public.ext_links_for(p_character_id UUID DEFAULT NULL, p_record_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  label TEXT,
  visibility TEXT,
  outgoing BOOLEAN,
  other_type TEXT,
  other_id UUID,
  other_name TEXT,
  other_kind TEXT,
  other_picture_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_channel UUID;
  v_is_gm BOOLEAN;
BEGIN
  IF num_nonnulls(p_character_id, p_record_id) <> 1 THEN
    RAISE EXCEPTION 'Give exactly one character or record' USING ERRCODE = '22023';
  END IF;
  v_channel := public.ext__link_end_channel(p_character_id, p_record_id);
  IF v_channel IS NULL OR NOT public.ext__can_see_link_end(p_character_id, p_record_id) THEN
    RETURN;
  END IF;
  v_is_gm := is_channel_gm(v_channel);

  RETURN QUERY
  WITH mine AS (
    SELECT l.*,
           (l.from_character_id IS NOT DISTINCT FROM p_character_id
             AND l.from_record_id IS NOT DISTINCT FROM p_record_id) AS is_out
    FROM public.ext_links l
    WHERE (p_character_id IS NOT NULL AND (l.from_character_id = p_character_id OR l.to_character_id = p_character_id))
       OR (p_record_id IS NOT NULL AND (l.from_record_id = p_record_id OR l.to_record_id = p_record_id))
  ),
  ends AS (
    SELECT m.*,
           CASE WHEN m.is_out THEN m.to_character_id ELSE m.from_character_id END AS o_char,
           CASE WHEN m.is_out THEN m.to_record_id ELSE m.from_record_id END AS o_rec
    FROM mine m
  )
  SELECT e.id, e.label, e.visibility, e.is_out,
         CASE WHEN e.o_char IS NOT NULL THEN 'character' ELSE 'record' END,
         COALESCE(e.o_char, e.o_rec),
         COALESCE(c.name, r.name),
         COALESCE(c.kind, r.kind),
         COALESCE(c.portrait_url, r.picture_url),
         e.created_at
  FROM ends e
  LEFT JOIN public.ext_characters c ON c.id = e.o_char
  LEFT JOIN public.ext_records r ON r.id = e.o_rec
  WHERE v_is_gm
     OR (e.visibility = 'players' AND public.ext__can_see_link_end(e.o_char, e.o_rec))
  ORDER BY e.created_at, e.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_links_for(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_links_for(UUID, UUID) TO authenticated, service_role;
