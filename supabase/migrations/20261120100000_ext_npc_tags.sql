-- Phase 2a step 5c: inline NPC tags (DECISIONS.md #36).
--
-- Posts can contain NPC tags, stored as Markdown links
-- `[Dr Hale](npc:<character id>)`. In a GM post a tag at the start of a line
-- makes that line the NPC's speech; anywhere else it is a name chip.
--
-- 1. ext_npc_tag_labels: the current name and portrait of tagged NPCs, so
--    every campaign member can draw the tags in posts they can read. A hidden
--    NPC's profile stays hidden: only its name and portrait are returned, and
--    only for ids the caller asks about. Character ids are random and players
--    learn them only from posts the GM tagged, which already show the name.
-- 2. ext_character_posts (Activity, step 5b) also finds tagged posts: a GM
--    speaker line counts as the NPC speaking, any other tag as a mention.
--    Only the body changes; the signature and grants stay the same.

CREATE FUNCTION public.ext_npc_tag_labels(p_channel_id UUID, p_ids UUID[])
RETURNS TABLE (id UUID, name TEXT, portrait_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.portrait_url
  FROM public.ext_characters c
  WHERE c.channel_id = p_channel_id
    AND c.kind = 'npc'
    AND c.id = ANY ((COALESCE(p_ids, '{}'::uuid[]))[1:200])
    AND (is_channel_gm(p_channel_id) OR is_channel_member(p_channel_id));
$$;

REVOKE ALL ON FUNCTION public.ext_npc_tag_labels(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_npc_tag_labels(UUID, UUID[]) TO authenticated, service_role;

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
      '](npc:' || p_character_id::text || ')' AS link,
      '(^|\n)[ \t]*\[[^]\n]*\]\(npc:' || p_character_id::text || '\)' AS line_start,
      (SELECT ch.gm_id FROM public.channels ch WHERE ch.id = p_channel_id) AS gm_id
  ),
  found AS (
    SELECT m.*,
      CASE
        WHEN m.type = 'npc' AND p_npc_name IS NOT NULL AND lower(m.npc_name) = lower(btrim(p_npc_name)) THEN 'spoke'
        WHEN m.type IN ('regular', 'scene', 'npc') AND m.sender_id = tag.gm_id
             AND m.content ~ tag.line_start THEN 'spoke'
        WHEN m.type IN ('regular', 'scene', 'dice_roll') AND EXISTS (
          SELECT 1 FROM public.ext_posting_periods pp
          WHERE pp.channel_id = m.channel_id AND pp.character_id = p_character_id
            AND pp.user_id = m.sender_id AND m.created_at >= pp.started_at
            AND (pp.ended_at IS NULL OR m.created_at < pp.ended_at)
        ) THEN 'posted'
        WHEN m.type IN ('regular', 'scene', 'npc') AND strpos(m.content, tag.link) > 0 THEN 'mentioned'
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
