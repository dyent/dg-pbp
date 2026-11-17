-- Fork Phase 2a, step 3: post authorship. The client labels each post and dice
-- roll with the character its author was posting as at that moment, by matching
-- the post's timestamp to a posting period.
--
-- Players cannot read ext_characters directly (GM-only, step 1), so this safe
-- projection returns each posting period with the character's name and portrait.
-- Exposing these is no new disclosure: the same name and portrait were already
-- shown on the player's posts and membership while they posted as that character.

CREATE FUNCTION public.ext_posting_identities(p_channel_id UUID)
RETURNS TABLE (
  user_id UUID,
  character_id UUID,
  name TEXT,
  portrait_url TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.user_id, pp.character_id, c.name, NULLIF(c.portrait_url, ''),
         pp.started_at, pp.ended_at
  FROM public.ext_posting_periods pp
  JOIN public.ext_characters c ON c.id = pp.character_id
  WHERE pp.channel_id = p_channel_id
    AND pp.user_id IS NOT NULL
    AND (is_channel_member(p_channel_id) OR is_channel_gm(p_channel_id))
  ORDER BY pp.user_id, pp.started_at;
$$;

REVOKE ALL ON FUNCTION public.ext_posting_identities(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_posting_identities(UUID) TO authenticated, service_role;

-- Live updates: clients refetch identities when someone switches character.
-- Realtime applies the table's RLS (members and GM may read).
ALTER PUBLICATION supabase_realtime ADD TABLE public.ext_posting_periods;
