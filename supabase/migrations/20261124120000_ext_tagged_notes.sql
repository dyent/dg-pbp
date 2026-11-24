-- Notes that tag a character or record show in ITS Activity too (owner
-- feedback, DECISIONS.md #45).
--
-- A note on Agent Reyes saying "Met [Dr Hale](npc:…)" now also appears in Dr
-- Hale's Activity, labelled with what it was written on.
--   * ext_tagged_notes runs with the caller's own rights: row-level security
--     on the two note tables decides which notes come back, exactly as on the
--     note's own page. Alias tags only match for the GM (players can't read
--     the alias tag tables).
--   * ext_visible_end_label gives the name of what the note was written on,
--     or nothing when the caller can't see it (a note a player wrote on a
--     character that has been hidden since).

-- ---------------------------------------------------------------------------
-- 1. Name of a character or record, if the caller may see it
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_visible_end_label(p_character_id UUID, p_record_id UUID)
RETURNS TABLE (name TEXT, kind TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(c.name, r.name), COALESCE(c.kind, r.kind)
  FROM (SELECT 1) AS one
  LEFT JOIN public.ext_characters c ON c.id = p_character_id
  LEFT JOIN public.ext_records r ON r.id = p_record_id AND p_character_id IS NULL
  WHERE num_nonnulls(p_character_id, p_record_id) = 1
    AND COALESCE(c.id, r.id) IS NOT NULL
    AND public.ext__can_see_link_end(p_character_id, p_record_id);
$$;

REVOKE ALL ON FUNCTION public.ext_visible_end_label(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_visible_end_label(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Notes elsewhere in the campaign that tag this character or record
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_tagged_notes(
  p_channel_id UUID,
  p_character_id UUID DEFAULT NULL,
  p_record_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  about_type TEXT,
  about_id UUID,
  about_name TEXT,
  about_kind TEXT,
  author_id UUID,
  author_character_name TEXT,
  body TEXT,
  visibility TEXT,
  in_game_day INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH links AS (
    SELECT '](npc:' || p_character_id::text || ')' AS link WHERE p_character_id IS NOT NULL
    UNION ALL
    SELECT '](npcalias:' || a.id::text || ')' FROM public.ext_npc_alias_tags a WHERE a.character_id = p_character_id
    UNION ALL
    SELECT '](rec:' || p_record_id::text || ')' WHERE p_record_id IS NOT NULL
    UNION ALL
    SELECT '](recalias:' || a.id::text || ')' FROM public.ext_record_alias_tags a WHERE a.record_id = p_record_id
  ),
  notes AS (
    SELECT n.id, 'character'::text AS about_type, n.character_id AS about_id, n.author_id, n.author_character_name,
           n.body, n.visibility, n.in_game_day, n.created_at, n.updated_at
    FROM public.ext_character_notes n
    WHERE n.channel_id = p_channel_id AND n.character_id IS DISTINCT FROM p_character_id
    UNION ALL
    SELECT n.id, 'record', n.record_id, n.author_id, n.author_character_name,
           n.body, n.visibility, n.in_game_day, n.created_at, n.updated_at
    FROM public.ext_record_notes n
    WHERE n.channel_id = p_channel_id AND n.record_id IS DISTINCT FROM p_record_id
  )
  SELECT n.id, n.about_type, n.about_id, l.name, l.kind, n.author_id, n.author_character_name,
         n.body, n.visibility, n.in_game_day, n.created_at, n.updated_at
  FROM notes n
  LEFT JOIN LATERAL public.ext_visible_end_label(
    CASE WHEN n.about_type = 'character' THEN n.about_id END,
    CASE WHEN n.about_type = 'record' THEN n.about_id END
  ) l ON true
  WHERE num_nonnulls(p_character_id, p_record_id) = 1
    AND EXISTS (SELECT 1 FROM links WHERE strpos(n.body, links.link) > 0)
  ORDER BY n.created_at DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.ext_tagged_notes(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_tagged_notes(UUID, UUID, UUID) TO authenticated, service_role;
