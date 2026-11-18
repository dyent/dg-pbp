-- Phase 2a step 4c follow-up: Reserve characters and player-set statuses.
--
-- PC roles as the app now labels them (no new column: Reserve follows from
-- the status):
--   PC - active    in play, status 'active'      counts toward the limit of 3,
--                                                 can be posted as
--   PC - reserve   in play, any other status     backup, wounded, on hiatus:
--                                                 the player keeps control and
--                                                 privacy, cannot post as it
--   PC - retired   out of play (unchanged)        dead, insane, left the story
--
-- Changes:
--   * new status 'backup' (a character waiting in the wings);
--   * the limit of 3 now counts *active* in-play PCs only, enforced by a
--     trigger so every route (role change, status change) is covered;
--   * a player can switch their own in-play PC between the temporary
--     statuses (active, backup, unavailable, incapacitated) with
--     ext_set_my_status; Missing, Insane, Retired and Deceased stay GM-only;
--   * when a PC stops being active, a player posting as it switches to
--     another active PC of theirs (if they have one); when a PC becomes
--     active and its player isn't posting as anyone, they start posting as it;
--   * ext_set_role takes an optional status, so the GM can move a PC to
--     Active or Reserve in one step.

ALTER TABLE public.ext_characters
  DROP CONSTRAINT ext_characters_status_check,
  ADD CONSTRAINT ext_characters_status_check CHECK (status IN (
    'active', 'backup', 'unavailable', 'incapacitated', 'missing', 'insane', 'retired', 'deceased'
  ));

-- Statuses a player may set on their own PC (and move between).
CREATE FUNCTION public.ext_is_temporary_status(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_status IN ('active', 'backup', 'unavailable', 'incapacitated'), false);
$$;

-- ---------------------------------------------------------------------------
-- Limit of 3 active PCs, and posting hand-over on status changes
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_characters_active_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active BOOLEAN := NEW.kind = 'pc' AND NEW.in_play AND NEW.owner_id IS NOT NULL AND NEW.status = 'active';
  v_was_active BOOLEAN := TG_OP = 'UPDATE' AND OLD.kind = 'pc' AND OLD.in_play
                          AND OLD.owner_id IS NOT NULL AND OLD.status = 'active';
  v_next UUID;
BEGIN
  IF v_is_active THEN
    -- Lock the player's membership row so concurrent changes cannot exceed the cap.
    PERFORM 1 FROM public.channel_members
    WHERE channel_id = NEW.channel_id AND user_id = NEW.owner_id
    FOR UPDATE;
    IF (
      SELECT count(*) FROM public.ext_characters
      WHERE channel_id = NEW.channel_id AND kind = 'pc' AND in_play
        AND owner_id = NEW.owner_id AND status = 'active'
    ) > 3 THEN
      RAISE EXCEPTION 'A player can have at most 3 active characters at once; move one to Reserve first'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Status-only changes: role changes hand over posting in ext_set_role.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.kind = 'pc' AND NEW.in_play AND NEW.owner_id IS NOT NULL
     AND NEW.kind = OLD.kind AND NEW.in_play = OLD.in_play
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN

    IF v_was_active AND NOT v_is_active AND EXISTS (
      SELECT 1 FROM public.ext_posting_periods
      WHERE channel_id = NEW.channel_id AND user_id = NEW.owner_id
        AND character_id = NEW.id AND ended_at IS NULL
    ) THEN
      SELECT c.id INTO v_next
      FROM public.ext_characters c
      WHERE c.channel_id = NEW.channel_id AND c.kind = 'pc' AND c.in_play
        AND c.owner_id = NEW.owner_id AND c.status = 'active' AND c.id <> NEW.id
      ORDER BY c.updated_at DESC
      LIMIT 1;
      -- With no other active PC the player keeps posting as this one until
      -- the GM or the player sorts it out (better than losing the name).
      IF v_next IS NOT NULL THEN
        PERFORM public.ext__set_posting(NEW.channel_id, NEW.owner_id, v_next);
      END IF;
    ELSIF v_is_active AND NOT v_was_active AND NOT EXISTS (
      SELECT 1 FROM public.ext_posting_periods
      WHERE channel_id = NEW.channel_id AND user_id = NEW.owner_id AND ended_at IS NULL
    ) THEN
      PERFORM public.ext__set_posting(NEW.channel_id, NEW.owner_id, NEW.id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_characters_active_rules
  AFTER INSERT OR UPDATE OF status, kind, in_play, owner_id ON public.ext_characters
  FOR EACH ROW EXECUTE FUNCTION public.ext_characters_active_rules();

REVOKE ALL ON FUNCTION public.ext_characters_active_rules() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Player sets their own PC's temporary status
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_set_my_status(p_character_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.ext_characters%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.ext_characters WHERE id = p_character_id FOR UPDATE;
  IF c.id IS NULL OR c.kind <> 'pc' OR NOT c.in_play OR c.owner_id IS DISTINCT FROM auth.uid()
     OR NOT is_channel_member(c.channel_id) THEN
    RAISE EXCEPTION 'You can only change the status of a character you play' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = c.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.ext_is_temporary_status(c.status) OR NOT public.ext_is_temporary_status(p_status) THEN
    RAISE EXCEPTION 'Only the GM can set or change this status' USING ERRCODE = '42501';
  END IF;
  IF p_status = c.status THEN
    RETURN;
  END IF;
  UPDATE public.ext_characters SET status = p_status WHERE id = c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_set_my_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_set_my_status(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_is_temporary_status(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_is_temporary_status(TEXT) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- ext_set_role: optional status; the limit check moves to the trigger
-- ---------------------------------------------------------------------------

DROP FUNCTION public.ext_set_role(UUID, TEXT, BOOLEAN, UUID, TEXT);

-- GM sets a character's role and player in one go:
--   p_kind 'pc' + p_in_play true   PC in play for p_owner_id (may be NULL = unassigned)
--   p_kind 'pc' + p_in_play false  PC out of play (p_owner_id = former owner)
--   p_kind 'npc'                   NPC (owner cleared; Owner fields become GM-only;
--                                  an NPC posting identity is linked)
--   p_status (optional)            new status in the same step, e.g. 'active' or
--                                  'backup' to move a PC between Active and Reserve
CREATE FUNCTION public.ext_set_role(
  p_character_id UUID,
  p_kind TEXT,
  p_in_play BOOLEAN,
  p_owner_id UUID,
  p_note TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.ext_characters%ROWTYPE;
  v_member public.channel_members%ROWTYPE;
  v_owner UUID := p_owner_id;
  v_in_play BOOLEAN := COALESCE(p_in_play, true);
  v_status TEXT;
  v_npc_id UUID;
  v_npc_name TEXT;
  v_start TIMESTAMPTZ;
BEGIN
  SELECT * INTO c FROM public.ext_characters WHERE id = p_character_id FOR UPDATE;
  IF c.id IS NULL OR NOT is_channel_gm(c.channel_id) THEN
    RAISE EXCEPTION 'Only the GM can change a character''s role' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = c.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('pc', 'npc') THEN
    RAISE EXCEPTION 'Role must be a player character or an NPC' USING ERRCODE = 'P0001';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 500 THEN
    RAISE EXCEPTION 'Note is too long (500 characters maximum)' USING ERRCODE = 'P0001';
  END IF;
  v_status := COALESCE(p_status, c.status);

  IF p_kind = 'npc' THEN
    v_owner := NULL;
    v_in_play := true;
  END IF;

  IF v_owner IS NOT NULL THEN
    SELECT * INTO v_member FROM public.channel_members
    WHERE channel_id = c.channel_id AND user_id = v_owner;
    IF v_member.id IS NULL OR v_member.is_blocked THEN
      RAISE EXCEPTION 'That player is not an active member of this campaign' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_kind = 'npc' AND c.kind = 'pc' THEN
    v_npc_id := c.npc_id;
    IF v_npc_id IS NULL THEN
      v_npc_name := LEFT(c.name, 40);
      SELECT n.id INTO v_npc_id FROM public.channel_npcs n
      WHERE n.channel_id = c.channel_id AND n.name = v_npc_name
        AND NOT EXISTS (SELECT 1 FROM public.ext_characters o WHERE o.npc_id = n.id);
      IF v_npc_id IS NULL THEN
        INSERT INTO public.channel_npcs (channel_id, name, avatar_url)
        VALUES (c.channel_id, v_npc_name, public.ext__npc_avatar(c.portrait_url))
        ON CONFLICT (channel_id, name) DO NOTHING
        RETURNING id INTO v_npc_id;
      END IF;
    END IF;
    -- A former PC's Owner fields become GM-only: an NPC has no owner.
    UPDATE public.ext_character_fields
    SET visibility = 'gm'
    WHERE character_id = c.id AND visibility = 'owner';
  ELSE
    v_npc_id := c.npc_id;
  END IF;

  -- The limit of 3 active PCs is checked by ext_characters_active_rules.
  PERFORM set_config('ext.allow_role_change', 'on', true);
  UPDATE public.ext_characters
  SET kind = p_kind,
      in_play = v_in_play,
      owner_id = v_owner,
      status = v_status,
      npc_id = v_npc_id,
      converted_to_npc_at = CASE WHEN p_kind = 'npc' AND c.kind = 'pc' THEN NOW() ELSE converted_to_npc_at END
  WHERE id = c.id;
  PERFORM set_config('ext.allow_role_change', 'off', true);

  IF p_kind <> c.kind OR v_in_play IS DISTINCT FROM c.in_play OR v_owner IS DISTINCT FROM c.owner_id THEN
    PERFORM public.ext__log_event(c.id, 'role_changed', jsonb_build_object(
      'from', jsonb_build_object('kind', c.kind, 'in_play', c.in_play, 'owner_id', c.owner_id),
      'to', jsonb_build_object('kind', p_kind, 'in_play', v_in_play, 'owner_id', v_owner)
    ), NULLIF(btrim(p_note), ''));
  ELSIF NULLIF(btrim(p_note), '') IS NOT NULL THEN
    PERFORM public.ext__log_event(c.id, 'note', '{}'::jsonb, btrim(p_note));
  END IF;

  -- The previous owner may have been posting as this character.
  IF c.owner_id IS NOT NULL THEN
    PERFORM public.ext__refresh_posting(c.channel_id, c.owner_id);
  END IF;

  -- A new in-play owner who is not posting as anyone starts posting as this
  -- character (if active). Their very first period starts when they joined.
  IF p_kind = 'pc' AND v_in_play AND v_owner IS NOT NULL AND v_status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM public.ext_posting_periods
       WHERE channel_id = c.channel_id AND user_id = v_owner AND ended_at IS NULL
     ) THEN
    IF EXISTS (SELECT 1 FROM public.ext_posting_periods
               WHERE channel_id = c.channel_id AND user_id = v_owner) THEN
      v_start := NOW();
    ELSE
      v_start := v_member.joined_at;
    END IF;
    PERFORM public.ext__set_posting(c.channel_id, v_owner, c.id, v_start);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_set_role(UUID, TEXT, BOOLEAN, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_set_role(UUID, TEXT, BOOLEAN, UUID, TEXT, TEXT) TO authenticated, service_role;
