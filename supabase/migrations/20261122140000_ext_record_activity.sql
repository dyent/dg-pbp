-- cspell:words recalias
-- Campaign records, step 2 (Phase 2b, DECISIONS.md #38, #41): aliases, notes,
-- the Activity search and @tags for records.
--
-- Aliases: other names of a record (e.g. "the Hollow" for a cult). GM only, in
-- their own table because players can read a shown record's row.
-- Tags in posts, as for NPCs (#36, #37):
--   `[Morgue](rec:<record id>)`            tagged by name
--   `[The Hollow](recalias:<alias tag id>)` tagged by a GM-only alias; the id is
--                                           random, so players can't tell which
--                                           record it is
-- Notes: the GM and players add notes to records they can see, with the same
-- rules as character notes (ext_character_notes).
-- Posts: ext_record_posts() finds posts that tag or mention a record, run with
-- the caller's own rights (SECURITY INVOKER), so players only get posts they
-- can read, and only the GM's search finds alias tags.

-- ---------------------------------------------------------------------------
-- 1. Aliases (GM only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_record_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (alias = btrim(alias) AND char_length(alias) BETWEEN 1 AND 40),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ext_record_aliases_alias_idx ON public.ext_record_aliases (record_id, lower(alias));
CREATE INDEX ext_record_aliases_channel_idx ON public.ext_record_aliases (channel_id);

ALTER TABLE public.ext_record_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM reads record aliases"
  ON public.ext_record_aliases FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

REVOKE ALL ON public.ext_record_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ext_record_aliases TO authenticated;
GRANT ALL ON public.ext_record_aliases TO service_role;

ALTER TABLE public.ext_record_events
  DROP CONSTRAINT ext_record_events_event_type_check,
  ADD CONSTRAINT ext_record_events_event_type_check CHECK (event_type IN (
    'created', 'renamed', 'visibility_changed', 'field_edited', 'field_visibility_changed',
    'aliases_changed'
  ));

-- Replace a record's aliases (at most 10, 1-40 characters each, no repeats).
CREATE FUNCTION public.ext_set_record_aliases(p_record_id UUID, p_aliases TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.ext_records%ROWTYPE;
  v_new TEXT[];
  v_old TEXT[];
BEGIN
  SELECT * INTO r FROM public.ext_records WHERE id = p_record_id FOR UPDATE;
  IF r.id IS NULL OR NOT COALESCE(is_channel_gm(r.channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can change aliases' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = r.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;

  -- Trimmed, blanks dropped, first spelling of each kept (case-insensitive), in order.
  SELECT COALESCE(array_agg(a ORDER BY pos), '{}') INTO v_new
  FROM (
    SELECT DISTINCT ON (lower(btrim(x.a))) btrim(x.a) AS a, x.pos
    FROM unnest(COALESCE(p_aliases, '{}'::text[])) WITH ORDINALITY AS x(a, pos)
    WHERE btrim(COALESCE(x.a, '')) <> ''
    ORDER BY lower(btrim(x.a)), x.pos
  ) s;
  IF cardinality(v_new) > 10 THEN
    RAISE EXCEPTION 'A record can have at most 10 aliases' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_new) a WHERE char_length(a) > 40) THEN
    RAISE EXCEPTION 'Aliases can be at most 40 characters' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(array_agg(alias ORDER BY sort_order), '{}') INTO v_old
    FROM public.ext_record_aliases WHERE record_id = p_record_id;
  IF v_old = v_new THEN
    RETURN;
  END IF;

  DELETE FROM public.ext_record_aliases WHERE record_id = p_record_id;
  INSERT INTO public.ext_record_aliases (record_id, channel_id, alias, sort_order)
  SELECT p_record_id, r.channel_id, a, pos
  FROM unnest(v_new) WITH ORDINALITY AS x(a, pos);

  INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
  VALUES (p_record_id, r.channel_id, 'aliases_changed',
          jsonb_build_object('from', to_jsonb(v_old), 'to', to_jsonb(v_new)), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.ext_set_record_aliases(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_set_record_aliases(UUID, TEXT[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Alias tags (GM only), as ext_npc_alias_tags
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_record_alias_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ext_record_alias_tags_alias_idx ON public.ext_record_alias_tags (record_id, lower(alias));
CREATE INDEX ext_record_alias_tags_channel_idx ON public.ext_record_alias_tags (channel_id);

ALTER TABLE public.ext_record_alias_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM reads record alias tags"
  ON public.ext_record_alias_tags FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

REVOKE ALL ON public.ext_record_alias_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ext_record_alias_tags TO authenticated;
GRANT ALL ON public.ext_record_alias_tags TO service_role;

-- The alias tag id for one of a record's aliases (created the first time). GM only.
CREATE FUNCTION public.ext_record_alias_tag(p_record_id UUID, p_alias TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.ext_records%ROWTYPE;
  v_alias TEXT := btrim(COALESCE(p_alias, ''));
  v_id UUID;
BEGIN
  SELECT * INTO r FROM public.ext_records WHERE id = p_record_id;
  IF r.id IS NULL OR NOT COALESCE(is_channel_gm(r.channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can tag by alias' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ext_record_aliases a WHERE a.record_id = r.id AND lower(a.alias) = lower(v_alias)
  ) THEN
    RAISE EXCEPTION 'That is not one of this record''s aliases' USING ERRCODE = '22023';
  END IF;

  SELECT t.id INTO v_id FROM public.ext_record_alias_tags t
  WHERE t.record_id = r.id AND lower(t.alias) = lower(v_alias);
  IF v_id IS NULL THEN
    INSERT INTO public.ext_record_alias_tags (channel_id, record_id, alias)
    VALUES (r.channel_id, r.id, v_alias)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT t.id INTO v_id FROM public.ext_record_alias_tags t
      WHERE t.record_id = r.id AND lower(t.alias) = lower(v_alias);
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_record_alias_tag(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_record_alias_tag(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Notes (as ext_character_notes)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_record_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- The PC the author was posting as (players only), and its name at the time.
  author_character_id UUID REFERENCES public.ext_characters(id) ON DELETE SET NULL,
  author_character_name TEXT CHECK (author_character_name IS NULL OR char_length(author_character_name) <= 100),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  visibility TEXT NOT NULL CHECK (visibility IN ('author', 'gm', 'everyone')),
  calendar TEXT NOT NULL DEFAULT 'gregorian' CHECK (calendar IN ('gregorian')),
  in_game_day INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ext_record_notes_record_idx ON public.ext_record_notes (record_id, created_at DESC);
CREATE INDEX ext_record_notes_channel_idx ON public.ext_record_notes (channel_id);

ALTER TABLE public.ext_record_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM, author, or everyone who can see the record read notes"
  ON public.ext_record_notes FOR SELECT TO authenticated
  USING (
    is_channel_gm(channel_id)
    OR (author_id = auth.uid() AND is_channel_member(channel_id))
    OR (visibility = 'everyone' AND public.ext_can_read_record(record_id))
  );

-- Reads only; every write goes through the functions below.
REVOKE ALL ON public.ext_record_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ext_record_notes TO authenticated;
GRANT ALL ON public.ext_record_notes TO service_role;

-- Checks shared by add and edit. Returns the record's campaign.
CREATE FUNCTION public.ext__check_record_note(p_record_id UUID, p_body TEXT, p_visibility TEXT, p_in_game_day INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel UUID;
  v_gm BOOLEAN;
BEGIN
  SELECT channel_id INTO v_channel FROM public.ext_records WHERE id = p_record_id;
  IF v_channel IS NULL OR NOT public.ext_can_read_record(p_record_id) THEN
    RAISE EXCEPTION 'You can only add notes to records you can see' USING ERRCODE = '42501';
  END IF;
  v_gm := COALESCE(is_channel_gm(v_channel), false);
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = v_channel AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'A note must be 1 to 2000 characters' USING ERRCODE = 'P0001';
  END IF;
  IF v_gm AND p_visibility IS DISTINCT FROM 'gm' AND p_visibility IS DISTINCT FROM 'everyone' THEN
    RAISE EXCEPTION 'GM notes are GM only or for everyone' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_gm AND p_visibility IS DISTINCT FROM 'author' AND p_visibility IS DISTINCT FROM 'everyone' THEN
    RAISE EXCEPTION 'Your notes are for you and the GM, or for everyone' USING ERRCODE = 'P0001';
  END IF;
  IF p_in_game_day IS NOT NULL THEN
    PERFORM public.ext__check_day(p_in_game_day);
  END IF;
  RETURN v_channel;
END;
$$;

CREATE FUNCTION public.ext_add_record_note(p_record_id UUID, p_body TEXT, p_visibility TEXT, p_in_game_day INTEGER DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel UUID := public.ext__check_record_note(p_record_id, p_body, p_visibility, p_in_game_day);
  v_as UUID;
  v_as_name TEXT;
  v_id UUID;
BEGIN
  IF NOT is_channel_gm(v_channel) THEN
    SELECT c.id, c.name INTO v_as, v_as_name
    FROM public.ext_posting_periods pp JOIN public.ext_characters c ON c.id = pp.character_id
    WHERE pp.channel_id = v_channel AND pp.user_id = auth.uid() AND pp.ended_at IS NULL;
  END IF;
  INSERT INTO public.ext_record_notes
    (channel_id, record_id, author_id, author_character_id, author_character_name, body, visibility, in_game_day)
  VALUES
    (v_channel, p_record_id, auth.uid(), v_as, v_as_name, btrim(p_body), p_visibility, p_in_game_day)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Only the writer edits a note (the author label stays as it was).
CREATE FUNCTION public.ext_update_record_note(p_note_id UUID, p_body TEXT, p_visibility TEXT, p_in_game_day INTEGER DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.ext_record_notes%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.ext_record_notes WHERE id = p_note_id FOR UPDATE;
  IF n.id IS NULL OR n.author_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only edit your own notes' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ext__check_record_note(n.record_id, p_body, p_visibility, p_in_game_day);
  UPDATE public.ext_record_notes
  SET body = btrim(p_body), visibility = p_visibility, in_game_day = p_in_game_day, updated_at = clock_timestamp()
  WHERE id = n.id;
END;
$$;

-- The writer or the GM deletes a note.
CREATE FUNCTION public.ext_delete_record_note(p_note_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.ext_record_notes%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.ext_record_notes WHERE id = p_note_id FOR UPDATE;
  IF n.id IS NULL OR NOT (
       COALESCE(is_channel_gm(n.channel_id), false)
       OR (n.author_id = auth.uid() AND is_channel_member(n.channel_id))
     ) THEN
    RAISE EXCEPTION 'You can only delete your own notes' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = n.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.ext_record_notes WHERE id = n.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext__check_record_note(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_add_record_note(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_update_record_note(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_delete_record_note(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_add_record_note(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_update_record_note(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_delete_record_note(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Posts about a record (caller's own access)
-- ---------------------------------------------------------------------------

-- Newest first, up to p_limit (max 200), older than p_before when given. Every
-- hit is kind 'mentioned': a `rec:` tag of the record, one of its alias tags
-- (only the GM can read those), or one of p_terms as a whole word. The app
-- sends the name, and for the GM the aliases too.
CREATE FUNCTION public.ext_record_posts(
  p_channel_id UUID,
  p_record_id UUID,
  p_terms TEXT[],
  p_before TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  sender_id UUID,
  type TEXT,
  content TEXT,
  npc_name TEXT,
  sub_channel_id UUID,
  whisper_to UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH terms AS (
    SELECT '\m' || regexp_replace(btrim(t), '([.^$|?*+()\[\]{}\\-])', '\\\1', 'g') || '\M' AS pattern
    FROM unnest(COALESCE(p_terms, '{}'::text[])) AS t
    WHERE char_length(btrim(t)) BETWEEN 2 AND 100
    LIMIT 12
  ),
  links AS (
    SELECT '](rec:' || p_record_id::text || ')' AS link
    UNION ALL
    SELECT '](recalias:' || a.id::text || ')'
    FROM public.ext_record_alias_tags a
    WHERE a.record_id = p_record_id
  )
  SELECT m.id, 'mentioned', m.sender_id, m.type, m.content, m.npc_name, m.sub_channel_id, m.whisper_to, m.created_at
  FROM public.messages m
  WHERE m.channel_id = p_channel_id
    AND NOT m.is_deleted
    AND m.type IN ('regular', 'scene', 'npc')
    AND (p_before IS NULL OR m.created_at < p_before)
    AND (
      EXISTS (SELECT 1 FROM links l WHERE strpos(m.content, l.link) > 0)
      OR EXISTS (SELECT 1 FROM terms WHERE m.content ~* terms.pattern)
    )
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.ext_record_posts(UUID, UUID, TEXT[], TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_record_posts(UUID, UUID, TEXT[], TIMESTAMPTZ, INTEGER) TO authenticated, service_role;
