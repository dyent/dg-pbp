-- Fix: hidden PCs with no owner were readable by players (found 2026-11-23).
--
-- In ext_can_read_entry, "is the caller the owner?" was
-- `c.kind = 'pc' AND c.owner_id = auth.uid()`, which is NULL (not false) when a
-- PC has no owner. `IF NOT (c.revealed OR NULL)` is then NULL, so the "hidden"
-- check was skipped: any member could read the Everyone fields and history of
-- an unrevealed, unowned PC, and its sheet once it was out of play. The fix
-- treats "no owner" as "not the owner". Same signature; grants are kept.

CREATE OR REPLACE FUNCTION public.ext_can_read_entry(p_character_id UUID, p_visibility TEXT, p_private BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.ext_characters%ROWTYPE;
  v_is_owner BOOLEAN;
BEGIN
  SELECT * INTO c FROM public.ext_characters WHERE id = p_character_id;
  IF c.id IS NULL THEN
    RETURN false;
  END IF;
  IF is_channel_gm(c.channel_id) THEN
    RETURN true;
  END IF;
  IF NOT is_channel_member(c.channel_id) THEN
    RETURN false;
  END IF;

  v_is_owner := c.kind = 'pc' AND COALESCE(c.owner_id = auth.uid(), false);
  IF NOT (c.revealed OR v_is_owner) THEN
    RETURN false;
  END IF;

  IF p_visibility = 'players' THEN
    RETURN true;
  ELSIF p_visibility = 'owner' THEN
    RETURN v_is_owner
      OR (c.kind = 'pc' AND NOT c.in_play AND NOT COALESCE(p_private, false));
  END IF;
  RETURN false;
END;
$$;
