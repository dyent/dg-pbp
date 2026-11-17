-- DG Phase 2a, step 2: agent stables, posting periods, and the give / take /
-- post-as / convert-to-NPC functions. Design: docs/delta-green/02-phase2a-plan.md.
--
--   dg_agent_controllers  which player controls which agent, from/to
--                         (max 3 open per player per campaign; one per agent)
--   dg_posting_periods    which agent a player is posting as, from/to
--                         (one open per player per campaign). Step 3 matches
--                         each post's timestamp to a period to label its author.
--
-- Both tables are written only by the functions below (no client write
-- policies). Upstream's channel_members row is kept in step with the current
-- posting agent (name truncated to 20 characters by upstream's own trigger) so
-- upstream screens show the current agent without code changes.

-- ---------------------------------------------------------------------------
-- History event types for this step
-- ---------------------------------------------------------------------------

ALTER TABLE public.dg_character_events
  DROP CONSTRAINT dg_character_events_event_type_check,
  ADD CONSTRAINT dg_character_events_event_type_check CHECK (event_type IN (
    'created', 'renamed', 'status_changed', 'revealed', 'hidden',
    'field_visibility_changed', 'note',
    'given', 'taken', 'posting_started', 'posting_ended', 'converted_to_npc'
  ));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.dg_agent_controllers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.dg_characters(id) ON DELETE CASCADE,
  -- Nullable so an account deletion keeps the campaign's history.
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  end_note TEXT CHECK (end_note IS NULL OR char_length(end_note) <= 500),
  CONSTRAINT dg_agent_controllers_period CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- An agent has at most one controlling player at a time.
CREATE UNIQUE INDEX dg_agent_controllers_one_open_per_agent_idx
  ON public.dg_agent_controllers (character_id)
  WHERE ended_at IS NULL;
CREATE INDEX dg_agent_controllers_channel_user_idx
  ON public.dg_agent_controllers (channel_id, user_id);

CREATE TABLE public.dg_posting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  character_id UUID NOT NULL REFERENCES public.dg_characters(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  CONSTRAINT dg_posting_periods_period CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- A player posts as at most one agent at a time.
CREATE UNIQUE INDEX dg_posting_periods_one_open_per_player_idx
  ON public.dg_posting_periods (channel_id, user_id)
  WHERE ended_at IS NULL;
CREATE INDEX dg_posting_periods_channel_user_started_idx
  ON public.dg_posting_periods (channel_id, user_id, started_at);

ALTER TABLE public.dg_agent_controllers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_posting_periods ENABLE ROW LEVEL SECURITY;

-- Readable by the campaign's members and GM (needed to label posts and to
-- show each player their stable). No client write policies: functions only.
CREATE POLICY "Members read agent controllers"
  ON public.dg_agent_controllers FOR SELECT
  USING (is_channel_member(channel_id) OR is_channel_gm(channel_id));

CREATE POLICY "Members read posting periods"
  ON public.dg_posting_periods FOR SELECT
  USING (is_channel_member(channel_id) OR is_channel_gm(channel_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dg_agent_controllers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dg_posting_periods TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by API roles)
-- ---------------------------------------------------------------------------

-- Log a history event; shared with the agents when the character is revealed.
CREATE FUNCTION public.dg__log_event(
  p_character_id UUID,
  p_event_type TEXT,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dg_character_events (character_id, channel_id, event_type, details, note, visibility, actor_id)
  SELECT c.id, c.channel_id, p_event_type, p_details, p_note,
         CASE WHEN c.revealed THEN 'agents' ELSE 'handler' END, auth.uid()
  FROM public.dg_characters c
  WHERE c.id = p_character_id;
END;
$$;

-- Switch a player's posting identity. Closes the open period (if any) and, when
-- p_character_id is given, opens a new one and copies the agent's name and
-- portrait onto the player's membership. With NULL the player goes back to
-- their account name. p_started_at lets the very first period be backdated.
CREATE FUNCTION public.dg__set_posting(
  p_channel_id UUID,
  p_user_id UUID,
  p_character_id UUID,
  p_started_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed_character UUID;
  v_character public.dg_characters%ROWTYPE;
BEGIN
  UPDATE public.dg_posting_periods
  SET ended_at = NOW()
  WHERE channel_id = p_channel_id AND user_id = p_user_id AND ended_at IS NULL
  RETURNING character_id INTO v_closed_character;

  IF v_closed_character IS NOT NULL THEN
    PERFORM public.dg__log_event(v_closed_character, 'posting_ended',
                                 jsonb_build_object('user_id', p_user_id));
  END IF;

  IF p_character_id IS NULL THEN
    UPDATE public.channel_members cm
    SET character_name = LEFT(COALESCE(p.display_name, 'Player'), 20),
        character_avatar_url = NULL
    FROM public.profiles p
    WHERE cm.channel_id = p_channel_id AND cm.user_id = p_user_id AND p.id = p_user_id;
    RETURN;
  END IF;

  SELECT * INTO v_character FROM public.dg_characters WHERE id = p_character_id;

  INSERT INTO public.dg_posting_periods (channel_id, user_id, character_id, started_at)
  VALUES (p_channel_id, p_user_id, p_character_id, LEAST(p_started_at, NOW()));

  UPDATE public.channel_members
  SET character_name = LEFT(v_character.name, 20),
      character_avatar_url = NULLIF(v_character.portrait_url, '')
  WHERE channel_id = p_channel_id AND user_id = p_user_id;

  PERFORM public.dg__log_event(p_character_id, 'posting_started',
                               jsonb_build_object('user_id', p_user_id));
END;
$$;

-- End an agent's control (and posting, if they are the current identity). The
-- player is switched to another active agent they control, if any; otherwise
-- back to their account name. Returns the player who lost the agent (or NULL).
CREATE FUNCTION public.dg__release_agent(p_character_id UUID, p_note TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_controller public.dg_agent_controllers%ROWTYPE;
  v_next UUID;
BEGIN
  UPDATE public.dg_agent_controllers
  SET ended_at = NOW(), end_note = p_note
  WHERE character_id = p_character_id AND ended_at IS NULL
  RETURNING * INTO v_controller;

  IF v_controller.id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.dg__log_event(p_character_id, 'taken',
                               jsonb_build_object('user_id', v_controller.user_id), p_note);

  IF EXISTS (
    SELECT 1 FROM public.dg_posting_periods
    WHERE channel_id = v_controller.channel_id AND user_id = v_controller.user_id
      AND character_id = p_character_id AND ended_at IS NULL
  ) THEN
    SELECT ac.character_id INTO v_next
    FROM public.dg_agent_controllers ac
    JOIN public.dg_characters c ON c.id = ac.character_id
    WHERE ac.channel_id = v_controller.channel_id AND ac.user_id = v_controller.user_id
      AND ac.ended_at IS NULL AND c.status = 'active'
    ORDER BY ac.started_at DESC
    LIMIT 1;

    PERFORM public.dg__set_posting(v_controller.channel_id, v_controller.user_id, v_next);
  END IF;

  RETURN v_controller.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dg__log_event(UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dg__set_posting(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dg__release_agent(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Client-facing functions
-- ---------------------------------------------------------------------------

-- Handler gives an agent to a player (max 3 at once). If the player is not
-- posting as anyone and the agent is active, they start posting as it. The
-- player's very first posting period starts when they joined, so posts made
-- before the agent existed are attributed to it as well.
CREATE FUNCTION public.dg_give_agent(p_character_id UUID, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_character public.dg_characters%ROWTYPE;
  v_member public.channel_members%ROWTYPE;
  v_controller_id UUID;
  v_start TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_character FROM public.dg_characters WHERE id = p_character_id;
  IF v_character.id IS NULL OR NOT is_channel_gm(v_character.channel_id) THEN
    RAISE EXCEPTION 'Only the Handler can give agents to players' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = v_character.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF v_character.kind <> 'agent' THEN
    RAISE EXCEPTION 'Only agents can be given to players' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the player's membership row so concurrent gives cannot exceed the cap.
  SELECT * INTO v_member FROM public.channel_members
  WHERE channel_id = v_character.channel_id AND user_id = p_user_id
  FOR UPDATE;
  IF v_member.id IS NULL OR v_member.is_blocked THEN
    RAISE EXCEPTION 'That player is not an active member of this campaign' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dg_agent_controllers
             WHERE character_id = p_character_id AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'This agent already belongs to a player' USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT count(*) FROM public.dg_agent_controllers
      WHERE channel_id = v_character.channel_id AND user_id = p_user_id AND ended_at IS NULL) >= 3 THEN
    RAISE EXCEPTION 'A player can control at most 3 agents at once' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.dg_agent_controllers (channel_id, character_id, user_id)
  VALUES (v_character.channel_id, p_character_id, p_user_id)
  RETURNING id INTO v_controller_id;

  PERFORM public.dg__log_event(p_character_id, 'given', jsonb_build_object('user_id', p_user_id));

  IF v_character.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.dg_posting_periods
    WHERE channel_id = v_character.channel_id AND user_id = p_user_id AND ended_at IS NULL
  ) THEN
    IF EXISTS (SELECT 1 FROM public.dg_posting_periods
               WHERE channel_id = v_character.channel_id AND user_id = p_user_id) THEN
      v_start := NOW();
    ELSE
      v_start := v_member.joined_at;
    END IF;
    PERFORM public.dg__set_posting(v_character.channel_id, p_user_id, p_character_id, v_start);
  END IF;

  RETURN v_controller_id;
END;
$$;

-- Handler takes an agent back from its player (e.g. the agent died or retired).
CREATE FUNCTION public.dg_take_agent(p_character_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_character public.dg_characters%ROWTYPE;
BEGIN
  SELECT * INTO v_character FROM public.dg_characters WHERE id = p_character_id;
  IF v_character.id IS NULL OR NOT is_channel_gm(v_character.channel_id) THEN
    RAISE EXCEPTION 'Only the Handler can take agents back' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = v_character.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 500 THEN
    RAISE EXCEPTION 'Note is too long (500 characters maximum)' USING ERRCODE = 'P0001';
  END IF;
  IF public.dg__release_agent(p_character_id, NULLIF(btrim(p_note), '')) IS NULL THEN
    RAISE EXCEPTION 'This agent does not belong to a player' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Switch which agent a player posts as. Callable by the controlling player or
-- the Handler. Only agents with status 'active' can be switched to.
CREATE FUNCTION public.dg_post_as(p_character_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_character public.dg_characters%ROWTYPE;
  v_controller public.dg_agent_controllers%ROWTYPE;
BEGIN
  SELECT * INTO v_character FROM public.dg_characters WHERE id = p_character_id;
  SELECT * INTO v_controller FROM public.dg_agent_controllers
  WHERE character_id = p_character_id AND ended_at IS NULL;

  IF v_character.id IS NULL OR v_controller.id IS NULL
     OR NOT (
       (v_controller.user_id = auth.uid() AND is_channel_member(v_character.channel_id))
       OR is_channel_gm(v_character.channel_id)
     ) THEN
    RAISE EXCEPTION 'You can only post as an agent you control' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = v_character.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF v_character.status <> 'active' THEN
    RAISE EXCEPTION 'This agent is not currently active' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dg_posting_periods
             WHERE channel_id = v_character.channel_id AND user_id = v_controller.user_id
               AND character_id = p_character_id AND ended_at IS NULL) THEN
    RETURN; -- already posting as this agent
  END IF;

  PERFORM public.dg__set_posting(v_character.channel_id, v_controller.user_id, p_character_id);
END;
$$;

-- Handler turns a former agent into an NPC. Everything is kept (profile,
-- history, past posts); the agent leaves any player's stable, and an NPC
-- posting identity with the same name and portrait is linked (reused if the
-- roster already has that name) so the Handler can speak as them.
CREATE FUNCTION public.dg_convert_to_npc(p_character_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_character public.dg_characters%ROWTYPE;
  v_npc_id UUID;
  v_npc_name TEXT;
BEGIN
  SELECT * INTO v_character FROM public.dg_characters WHERE id = p_character_id FOR UPDATE;
  IF v_character.id IS NULL OR NOT is_channel_gm(v_character.channel_id) THEN
    RAISE EXCEPTION 'Only the Handler can convert agents' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = v_character.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF v_character.kind <> 'agent' THEN
    RAISE EXCEPTION 'Only agents can be converted to NPCs' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.dg__release_agent(p_character_id, 'Converted to NPC');

  v_npc_id := v_character.npc_id;
  IF v_npc_id IS NULL THEN
    v_npc_name := LEFT(v_character.name, 40);
    SELECT id INTO v_npc_id FROM public.channel_npcs
    WHERE channel_id = v_character.channel_id AND name = v_npc_name;
    IF v_npc_id IS NULL THEN
      INSERT INTO public.channel_npcs (channel_id, name, avatar_url)
      VALUES (v_character.channel_id, v_npc_name, COALESCE(v_character.portrait_url, ''))
      RETURNING id INTO v_npc_id;
    END IF;
  END IF;

  PERFORM set_config('dg.allow_kind_change', 'on', true);
  UPDATE public.dg_characters
  SET kind = 'npc', converted_to_npc_at = NOW(), npc_id = v_npc_id
  WHERE id = p_character_id;
  PERFORM set_config('dg.allow_kind_change', 'off', true);

  PERFORM public.dg__log_event(p_character_id, 'converted_to_npc', jsonb_build_object('npc_id', v_npc_id));

  RETURN v_npc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dg_give_agent(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dg_take_agent(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dg_post_as(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dg_convert_to_npc(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dg_give_agent(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dg_take_agent(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dg_post_as(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dg_convert_to_npc(UUID) TO authenticated, service_role;
