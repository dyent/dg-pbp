-- Phase 2a step 4c follow-up: every NPC can be used with "Speak as NPC".
--
-- Upstream's "Speak as NPC" lists the campaign's NPC roster (channel_npcs:
-- name + portrait). Until now our characters were only linked to that roster
-- when a PC was turned into an NPC, so NPCs created directly in the
-- Characters panel never appeared there.
--
-- Now:
--   * creating an NPC links (or creates) its roster entry;
--   * renaming an NPC or changing its portrait updates the roster entry
--     (past posts keep the name they were sent with: upstream snapshots it);
--   * existing NPCs without a roster entry are linked once, below.
-- A roster entry with the same name that no other character uses is reused.
-- Upstream tables are written as data only: no schema change to them.

-- One character per roster entry.
CREATE UNIQUE INDEX ext_characters_npc_id_idx
  ON public.ext_characters (npc_id)
  WHERE npc_id IS NOT NULL;

-- Roster portrait: the character portrait if the roster accepts it, else none.
CREATE FUNCTION public.ext__npc_avatar(p_portrait_url TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_portrait_url IS NULL OR p_portrait_url = '' THEN ''
    WHEN char_length(p_portrait_url) > 500 THEN ''
    WHEN NOT public.url_scheme_allowed(p_portrait_url) THEN ''
    ELSE p_portrait_url
  END;
$$;

-- Link an NPC to a roster entry: reuse a free entry with the same name or
-- create one. Returns the entry id, or NULL when the name is already used by
-- another character's entry (the NPC then simply has no "Speak as" entry).
CREATE FUNCTION public.ext__link_npc_identity(p_character_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.ext_characters%ROWTYPE;
  v_name TEXT;
  v_id UUID;
BEGIN
  SELECT * INTO c FROM public.ext_characters WHERE id = p_character_id;
  IF c.id IS NULL OR c.kind <> 'npc' THEN
    RETURN NULL;
  END IF;
  IF c.npc_id IS NOT NULL THEN
    RETURN c.npc_id;
  END IF;

  v_name := LEFT(btrim(c.name), 40);
  SELECT n.id INTO v_id
  FROM public.channel_npcs n
  WHERE n.channel_id = c.channel_id AND n.name = v_name
    AND NOT EXISTS (SELECT 1 FROM public.ext_characters o WHERE o.npc_id = n.id);

  IF v_id IS NULL THEN
    INSERT INTO public.channel_npcs (channel_id, name, avatar_url)
    VALUES (c.channel_id, v_name, public.ext__npc_avatar(c.portrait_url))
    ON CONFLICT (channel_id, name) DO NOTHING
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.ext_characters SET npc_id = v_id WHERE id = c.id;
  END IF;
  RETURN v_id;
END;
$$;

-- After insert: new NPCs get their roster entry.
CREATE FUNCTION public.ext_characters_npc_identity_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ext__link_npc_identity(NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_characters_npc_identity_insert
  AFTER INSERT ON public.ext_characters
  FOR EACH ROW
  WHEN (NEW.kind = 'npc')
  EXECUTE FUNCTION public.ext_characters_npc_identity_insert();

-- After a rename or new portrait: keep the roster entry in step. If the new
-- name is taken by another roster entry, only the portrait is updated.
CREATE FUNCTION public.ext_characters_npc_identity_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public.channel_npcs
    SET name = LEFT(btrim(NEW.name), 40),
        avatar_url = public.ext__npc_avatar(NEW.portrait_url)
    WHERE id = NEW.npc_id;
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.channel_npcs
    SET avatar_url = public.ext__npc_avatar(NEW.portrait_url)
    WHERE id = NEW.npc_id;
  END;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_characters_npc_identity_sync
  AFTER UPDATE OF name, portrait_url ON public.ext_characters
  FOR EACH ROW
  WHEN (NEW.kind = 'npc' AND NEW.npc_id IS NOT NULL
        AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.portrait_url IS DISTINCT FROM OLD.portrait_url))
  EXECUTE FUNCTION public.ext_characters_npc_identity_sync();

REVOKE ALL ON FUNCTION public.ext__npc_avatar(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__link_npc_identity(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_characters_npc_identity_insert() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_characters_npc_identity_sync() FROM PUBLIC, anon, authenticated, service_role;

-- Existing NPCs without a roster entry (e.g. Dr Hale in the demo).
SELECT public.ext__link_npc_identity(id)
FROM public.ext_characters
WHERE kind = 'npc' AND npc_id IS NULL;
