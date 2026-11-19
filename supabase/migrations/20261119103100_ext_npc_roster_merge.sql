-- Phase 2a step 5a follow-up: one NPC list (DECISIONS.md #34).
--
-- Upstream keeps a "Speak as NPC" roster (channel_npcs: name + portrait). Since
-- 20261118100834 every NPC character gets a roster entry. Now the other way
-- round too, so the Characters panel is the single NPC list:
--   * a roster entry created anywhere else (upstream's NPC window, or a new
--     name typed in the message box's "Speak as NPC") becomes an NPC
--     character, hidden from the players until the GM reveals it;
--   * existing roster entries without a character get one below;
--   * deleting an NPC character also removes its roster entry, so it leaves
--     "Speak as" (past posts keep their name: upstream copies it onto each post).
--
-- The roster trigger is DEFERRED (runs at commit): when our own functions
-- create a roster entry for a character, the link (ext_characters.npc_id) is
-- in place by then and no second character is made.
-- FORK-EXT: adds a trigger to upstream's channel_npcs table (no column or
-- policy change). Listed in UPSTREAM-TOUCHPOINTS.md.

CREATE FUNCTION public.ext__npc_from_roster(p_npc_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.channel_npcs%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT * INTO n FROM public.channel_npcs WHERE id = p_npc_id;
  IF n.id IS NULL OR EXISTS (SELECT 1 FROM public.ext_characters WHERE npc_id = n.id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.ext_characters (channel_id, kind, name, portrait_url, npc_id, created_by)
  VALUES (
    n.channel_id, 'npc', btrim(n.name),
    CASE WHEN n.avatar_url IS NULL OR n.avatar_url = '' OR char_length(n.avatar_url) > 500
              OR NOT public.url_scheme_allowed(n.avatar_url) THEN NULL
         ELSE n.avatar_url END,
    n.id,
    COALESCE(auth.uid(), (SELECT gm_id FROM public.channels WHERE id = n.channel_id))
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.ext_channel_npcs_to_character()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ext__npc_from_roster(NEW.id);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ext_channel_npcs_to_character
  AFTER INSERT ON public.channel_npcs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ext_channel_npcs_to_character();

-- Deleting an NPC character removes its "Speak as" entry.
CREATE FUNCTION public.ext_characters_remove_npc_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.channel_npcs WHERE id = OLD.npc_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_characters_remove_npc_identity
  AFTER DELETE ON public.ext_characters
  FOR EACH ROW
  WHEN (OLD.kind = 'npc' AND OLD.npc_id IS NOT NULL)
  EXECUTE FUNCTION public.ext_characters_remove_npc_identity();

REVOKE ALL ON FUNCTION public.ext__npc_from_roster(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_channel_npcs_to_character() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_characters_remove_npc_identity() FROM PUBLIC, anon, authenticated, service_role;

-- Existing roster entries without a character (e.g. made in upstream's NPC window).
SELECT public.ext__npc_from_roster(n.id)
FROM public.channel_npcs n
WHERE NOT EXISTS (SELECT 1 FROM public.ext_characters c WHERE c.npc_id = n.id);
