-- Phase 2a step 5b: character activity log and notes (DECISIONS.md #31, #35).
--
-- Notes: the GM and players add notes to characters they can see.
--   * a player's note is seen by the writer and the GM ('author'), or by
--     everyone who can see the character ('everyone');
--   * the GM's notes are 'gm' (GM only) or 'everyone';
--   * a note belongs to the player who wrote it and is labelled with the
--     character they were posting as (name copied at the time);
--   * each note has an optional in-game date (day number, as in the calendar).
-- Posts: ext_character_posts() finds the posts about a character, run with the
-- caller's own rights (SECURITY INVOKER), so whispers and rooms they can't see
-- are never returned. Nothing is copied anywhere.

CREATE TABLE public.ext_character_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.ext_characters(id) ON DELETE CASCADE,
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

CREATE INDEX ext_character_notes_character_idx ON public.ext_character_notes (character_id, created_at DESC);
CREATE INDEX ext_character_notes_channel_idx ON public.ext_character_notes (channel_id);

ALTER TABLE public.ext_character_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM, author, or everyone who can see the character read notes"
  ON public.ext_character_notes FOR SELECT
  USING (
    is_channel_gm(channel_id)
    OR (author_id = auth.uid() AND is_channel_member(channel_id))
    OR (visibility = 'everyone' AND is_channel_member(channel_id)
        AND public.ext_can_read_entry(character_id, 'players', false))
  );

-- Reads only; every write goes through the functions below.
GRANT SELECT ON public.ext_character_notes TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Note functions
-- ---------------------------------------------------------------------------

-- Checks shared by add and edit. Returns the character's campaign.
CREATE FUNCTION public.ext__check_character_note(
  p_character_id UUID, p_body TEXT, p_visibility TEXT, p_in_game_day INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel UUID;
  v_gm BOOLEAN;
BEGIN
  SELECT channel_id INTO v_channel FROM public.ext_characters WHERE id = p_character_id;
  IF v_channel IS NULL THEN
    RAISE EXCEPTION 'You can only add notes to characters you can see' USING ERRCODE = '42501';
  END IF;
  v_gm := is_channel_gm(v_channel);
  IF NOT v_gm AND NOT (is_channel_member(v_channel) AND public.ext_can_read_entry(p_character_id, 'players', false)) THEN
    RAISE EXCEPTION 'You can only add notes to characters you can see' USING ERRCODE = '42501';
  END IF;
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

CREATE FUNCTION public.ext_add_character_note(
  p_character_id UUID, p_body TEXT, p_visibility TEXT, p_in_game_day INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel UUID := public.ext__check_character_note(p_character_id, p_body, p_visibility, p_in_game_day);
  v_as UUID;
  v_as_name TEXT;
  v_id UUID;
BEGIN
  IF NOT is_channel_gm(v_channel) THEN
    SELECT c.id, c.name INTO v_as, v_as_name
    FROM public.ext_posting_periods pp JOIN public.ext_characters c ON c.id = pp.character_id
    WHERE pp.channel_id = v_channel AND pp.user_id = auth.uid() AND pp.ended_at IS NULL;
  END IF;
  INSERT INTO public.ext_character_notes
    (channel_id, character_id, author_id, author_character_id, author_character_name, body, visibility, in_game_day)
  VALUES
    (v_channel, p_character_id, auth.uid(), v_as, v_as_name, btrim(p_body), p_visibility, p_in_game_day)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Only the writer edits a note (the author label stays as it was).
CREATE FUNCTION public.ext_update_character_note(
  p_note_id UUID, p_body TEXT, p_visibility TEXT, p_in_game_day INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.ext_character_notes%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.ext_character_notes WHERE id = p_note_id FOR UPDATE;
  IF n.id IS NULL OR n.author_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only edit your own notes' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ext__check_character_note(n.character_id, p_body, p_visibility, p_in_game_day);
  UPDATE public.ext_character_notes
  SET body = btrim(p_body), visibility = p_visibility, in_game_day = p_in_game_day, updated_at = clock_timestamp()
  WHERE id = n.id;
END;
$$;

-- The writer or the GM deletes a note.
CREATE FUNCTION public.ext_delete_character_note(p_note_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.ext_character_notes%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.ext_character_notes WHERE id = p_note_id FOR UPDATE;
  IF n.id IS NULL OR NOT (
       is_channel_gm(n.channel_id)
       OR (n.author_id = auth.uid() AND is_channel_member(n.channel_id))
     ) THEN
    RAISE EXCEPTION 'You can only delete your own notes' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = n.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.ext_character_notes WHERE id = n.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext__check_character_note(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_add_character_note(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_update_character_note(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_delete_character_note(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_add_character_note(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_update_character_note(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_delete_character_note(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Posts about a character (caller's own access)
-- ---------------------------------------------------------------------------

-- Newest first, up to p_limit (max 200), older than p_before when given.
--   kind 'spoke'     an NPC post ("Speak as NPC") under p_npc_name
--   kind 'posted'    a post by a player while posting as p_character_id
--   kind 'mentioned' any other post whose text contains one of p_terms as a
--                    whole word (case-insensitive). The app sends the name, and
--                    for the GM the aliases too.
CREATE FUNCTION public.ext_character_posts(
  p_channel_id UUID,
  p_character_id UUID,
  p_npc_name TEXT,
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
  found AS (
    SELECT m.*,
      CASE
        WHEN m.type = 'npc' AND p_npc_name IS NOT NULL AND lower(m.npc_name) = lower(btrim(p_npc_name)) THEN 'spoke'
        WHEN m.type IN ('regular', 'scene', 'dice_roll') AND EXISTS (
          SELECT 1 FROM public.ext_posting_periods pp
          WHERE pp.channel_id = m.channel_id AND pp.character_id = p_character_id
            AND pp.user_id = m.sender_id AND m.created_at >= pp.started_at
            AND (pp.ended_at IS NULL OR m.created_at < pp.ended_at)
        ) THEN 'posted'
        WHEN m.type IN ('regular', 'scene', 'npc')
             AND EXISTS (SELECT 1 FROM terms WHERE m.content ~* terms.pattern) THEN 'mentioned'
      END AS found_kind
    FROM public.messages m
    WHERE m.channel_id = p_channel_id
      AND NOT m.is_deleted
      AND (p_before IS NULL OR m.created_at < p_before)
  )
  SELECT f.id, f.found_kind, f.sender_id, f.type, f.content, f.npc_name, f.sub_channel_id, f.whisper_to, f.created_at
  FROM found f
  WHERE f.found_kind IS NOT NULL
  ORDER BY f.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.ext_character_posts(UUID, UUID, TEXT, TEXT[], TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_character_posts(UUID, UUID, TEXT, TEXT[], TIMESTAMPTZ, INTEGER) TO authenticated, service_role;
