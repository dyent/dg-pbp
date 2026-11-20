-- Phase 2a step 5c follow-up: tag NPCs by a GM-only alias (DECISIONS.md #37).
--
-- `@The Stranger` is stored in the post as `[The Stranger](npcalias:<alias tag id>)`.
-- The alias tag id is a random id of its own, so a player who reads the post
-- cannot tell which character it is: only the GM can read this table. Players
-- see the alias exactly as written.
--
-- ext_character_posts (Activity): speaker lines were dropped (owner, 2026-11-20),
-- so every tag now counts as a mention; it also finds alias tags. It runs with the
-- caller's rights, so only the GM's search can see this table and find them.

CREATE TABLE public.ext_npc_alias_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels (id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.ext_characters (id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ext_npc_alias_tags_alias_idx ON public.ext_npc_alias_tags (character_id, lower(alias));
CREATE INDEX ext_npc_alias_tags_channel_idx ON public.ext_npc_alias_tags (channel_id);

ALTER TABLE public.ext_npc_alias_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM reads alias tags"
  ON public.ext_npc_alias_tags
  FOR SELECT
  TO authenticated
  USING (is_channel_gm(channel_id));

REVOKE ALL ON public.ext_npc_alias_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ext_npc_alias_tags TO authenticated;
GRANT ALL ON public.ext_npc_alias_tags TO service_role;

-- The alias tag id for one of an NPC's aliases (created the first time). GM only.
CREATE FUNCTION public.ext_npc_alias_tag(p_character_id UUID, p_alias TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.ext_characters%ROWTYPE;
  v_alias TEXT := btrim(COALESCE(p_alias, ''));
  v_id UUID;
BEGIN
  SELECT * INTO c FROM public.ext_characters WHERE id = p_character_id;
  IF c.id IS NULL OR NOT is_channel_gm(c.channel_id) THEN
    RAISE EXCEPTION 'Only the GM can tag by alias' USING ERRCODE = '42501';
  END IF;
  IF c.kind <> 'npc' OR NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(c.aliases, '{}'::text[])) a WHERE lower(btrim(a)) = lower(v_alias)
  ) THEN
    RAISE EXCEPTION 'That is not one of this NPC''s aliases' USING ERRCODE = '22023';
  END IF;

  SELECT t.id INTO v_id FROM public.ext_npc_alias_tags t
  WHERE t.character_id = c.id AND lower(t.alias) = lower(v_alias);
  IF v_id IS NULL THEN
    INSERT INTO public.ext_npc_alias_tags (channel_id, character_id, alias)
    VALUES (c.channel_id, c.id, v_alias)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT t.id INTO v_id FROM public.ext_npc_alias_tags t
      WHERE t.character_id = c.id AND lower(t.alias) = lower(v_alias);
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_npc_alias_tag(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_npc_alias_tag(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ext_character_posts(
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
  tag AS (
    SELECT
      '](npc:' || p_character_id::text || ')' AS link
  ),
  -- Alias tags: only rows the caller can read (the GM's).
  alias_links AS (
    SELECT '](npcalias:' || a.id::text || ')' AS link
    FROM public.ext_npc_alias_tags a
    WHERE a.character_id = p_character_id
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
        WHEN m.type IN ('regular', 'scene', 'npc') AND strpos(m.content, tag.link) > 0 THEN 'mentioned'
        WHEN m.type IN ('regular', 'scene', 'npc')
             AND EXISTS (SELECT 1 FROM alias_links al WHERE strpos(m.content, al.link) > 0) THEN 'mentioned'
        WHEN m.type IN ('regular', 'scene', 'npc')
             AND EXISTS (SELECT 1 FROM terms WHERE m.content ~* terms.pattern) THEN 'mentioned'
      END AS found_kind
    FROM public.messages m CROSS JOIN tag
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
