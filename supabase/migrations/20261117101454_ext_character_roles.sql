-- Fork Phase 2a, step 4a: character roles, owner visibility, profile headings,
-- player editing with change logging, NPC tags.
-- Design: docs/delta-green/03-step4-characters-design.md (DECISIONS.md #17-#22).
--
-- Role model (GM-only, via ext_set_role):
--   kind 'pc' + in_play            PC in play: owner controls it, edits their
--                                  Everyone/Owner fields, counts toward the
--                                  3-PC limit, posts as it while status Active
--   kind 'pc' + NOT in_play        PC out of play: former owner reads only; all
--                                  players read its non-Private Owner fields
--   kind 'npc'                     GM-controlled; no owner
-- Ownership lives on ext_characters.owner_id; history is in ext_character_events
-- (the step-2 stable table and its give/take/convert functions are retired).
--
-- Visibility levels for fields and events: 'players' (Everyone), 'owner' (the
-- PC's player + GM), 'gm'. Owner fields may be marked private ("stays private
-- after the character leaves play").

-- ---------------------------------------------------------------------------
-- 1. Owner and in-play on characters
-- ---------------------------------------------------------------------------

ALTER TABLE public.ext_characters
  ADD COLUMN owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN in_play BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.ext_characters
  ADD CONSTRAINT ext_characters_npc_has_no_owner
    CHECK (kind = 'pc' OR (owner_id IS NULL AND in_play));

CREATE INDEX ext_characters_channel_owner_idx
  ON public.ext_characters (channel_id, owner_id)
  WHERE owner_id IS NOT NULL;

-- Carry over current owners from the retired stable table.
UPDATE public.ext_characters c
SET owner_id = ac.user_id
FROM public.ext_character_controllers ac
WHERE ac.character_id = c.id AND ac.ended_at IS NULL AND c.kind = 'pc';

-- ---------------------------------------------------------------------------
-- 2. Retire the step-2 stable table and functions
-- ---------------------------------------------------------------------------

DROP FUNCTION public.ext_give_character(UUID, UUID);
DROP FUNCTION public.ext_take_character(UUID, TEXT);
DROP FUNCTION public.ext_convert_to_npc(UUID);
DROP FUNCTION public.ext__release_character(UUID, TEXT);
DROP TABLE public.ext_character_controllers;

-- ---------------------------------------------------------------------------
-- 3. Fields: owner visibility, private marker, headings
-- ---------------------------------------------------------------------------

ALTER TABLE public.ext_character_fields
  DROP CONSTRAINT ext_character_fields_visibility_check,
  ADD CONSTRAINT ext_character_fields_visibility_check
    CHECK (visibility IN ('players', 'owner', 'gm')),
  ADD COLUMN private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_type TEXT NOT NULL DEFAULT 'field'
    CHECK (item_type IN ('field', 'heading')),
  ADD CONSTRAINT ext_character_fields_heading_shape
    CHECK (item_type = 'field' OR (body = '' AND field_key IS NULL));

ALTER TABLE public.ext_character_events
  DROP CONSTRAINT ext_character_events_visibility_check,
  ADD CONSTRAINT ext_character_events_visibility_check
    CHECK (visibility IN ('players', 'owner', 'gm')),
  DROP CONSTRAINT ext_character_events_event_type_check,
  ADD CONSTRAINT ext_character_events_event_type_check CHECK (event_type IN (
    'created', 'renamed', 'status_changed', 'revealed', 'hidden',
    'field_visibility_changed', 'note',
    'given', 'taken', 'posting_started', 'posting_ended', 'converted_to_npc',
    'role_changed', 'field_edited'
  ));

-- ---------------------------------------------------------------------------
-- 4. Access helpers (SECURITY DEFINER: players cannot read ext_characters)
-- ---------------------------------------------------------------------------

-- Is the caller this PC's owner (and still a member of the campaign)?
CREATE FUNCTION public.ext_is_character_owner(p_character_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ext_characters c
    WHERE c.id = p_character_id
      AND c.kind = 'pc'
      AND c.owner_id = auth.uid()
      AND is_channel_member(c.channel_id)
  );
$$;

-- May the caller read a field / history entry of this character with the given
-- visibility? GM: always. Others must be members, and the character must be
-- revealed (or theirs).
CREATE FUNCTION public.ext_can_read_entry(p_character_id UUID, p_visibility TEXT, p_private BOOLEAN)
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

  v_is_owner := c.kind = 'pc' AND c.owner_id = auth.uid();
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

-- May the caller edit this character's Everyone/Owner content? GM, or the owner
-- of an in-play PC. Never on an archived campaign.
CREATE FUNCTION public.ext_can_edit_character(p_character_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ext_characters c
    JOIN public.channels ch ON ch.id = c.channel_id
    WHERE c.id = p_character_id
      AND NOT ch.is_archived
      AND (
        is_channel_gm(c.channel_id)
        OR (c.kind = 'pc' AND c.in_play AND c.owner_id = auth.uid() AND is_channel_member(c.channel_id))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.ext_is_character_owner(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_can_read_entry(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_can_edit_character(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_is_character_owner(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_can_read_entry(UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_can_edit_character(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Policies: fields and events (replacing the step-1 versions)
-- ---------------------------------------------------------------------------

DROP POLICY "GM reads all fields; members read player-visible fields of revealed characters" ON public.ext_character_fields;
DROP POLICY "GM writes fields" ON public.ext_character_fields;
DROP POLICY "GM updates fields" ON public.ext_character_fields;
DROP POLICY "GM deletes fields" ON public.ext_character_fields;
DROP POLICY "GM reads all events; members read player-visible events of revealed characters" ON public.ext_character_events;
DROP FUNCTION public.ext_character_revealed(UUID);

CREATE POLICY "Fields are readable per their visibility"
  ON public.ext_character_fields FOR SELECT
  USING (ext_can_read_entry(character_id, visibility, private));

-- GM: any field. Owner of an in-play PC: custom Everyone/Owner fields only
-- (standard fields are created by the system).
CREATE POLICY "GM or owner adds fields"
  ON public.ext_character_fields FOR INSERT
  WITH CHECK (
    ext_can_edit_character(character_id)
    AND (
      is_channel_gm(channel_id)
      OR (visibility IN ('players', 'owner') AND field_key IS NULL)
    )
  );

CREATE POLICY "GM or owner edits fields"
  ON public.ext_character_fields FOR UPDATE
  USING (
    ext_can_edit_character(character_id)
    AND (is_channel_gm(channel_id) OR visibility IN ('players', 'owner'))
  )
  WITH CHECK (
    ext_can_edit_character(character_id)
    AND (is_channel_gm(channel_id) OR visibility IN ('players', 'owner'))
  );

CREATE POLICY "GM or owner removes fields"
  ON public.ext_character_fields FOR DELETE
  USING (
    ext_can_edit_character(character_id)
    AND (
      is_channel_gm(channel_id)
      OR (visibility IN ('players', 'owner') AND field_key IS NULL)
    )
  );

CREATE POLICY "Events are readable per their visibility"
  ON public.ext_character_events FOR SELECT
  USING (ext_can_read_entry(character_id, visibility, false));

-- ---------------------------------------------------------------------------
-- 6. Triggers: characters
-- ---------------------------------------------------------------------------

-- Guard: kind, owner and in-play change only through ext_set_role (which sets
-- a transaction-local flag). The FK may still clear owner_id on account
-- deletion (no signed-in user then).
CREATE OR REPLACE FUNCTION public.ext_characters_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alias TEXT;
  v_role_change BOOLEAN := COALESCE(current_setting('ext.allow_role_change', true), '') = 'on';
BEGIN
  IF NEW.portrait_url IS NOT NULL AND NEW.portrait_url <> ''
     AND NOT public.url_scheme_allowed(NEW.portrait_url) THEN
    RAISE EXCEPTION 'URLs must start with http:// or https://' USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_alias IN ARRAY NEW.aliases LOOP
    IF v_alias IS NULL OR v_alias <> btrim(v_alias)
       OR char_length(v_alias) NOT BETWEEN 1 AND 40 THEN
      RAISE EXCEPTION 'Aliases must be 1-40 characters with no surrounding spaces'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    -- New characters start without an owner; ext_set_role assigns one.
    IF (NEW.owner_id IS NOT NULL OR NOT NEW.in_play) AND NOT v_role_change THEN
      RAISE EXCEPTION 'Use the role setting to assign a player' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A character cannot change campaign, creator or creation time'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_role_change AND (
       NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.in_play IS DISTINCT FROM OLD.in_play
       OR (NEW.owner_id IS DISTINCT FROM OLD.owner_id
           AND NOT (NEW.owner_id IS NULL AND auth.uid() IS NULL))
     ) THEN
    RAISE EXCEPTION 'Use the role setting to change a character''s role or player'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Standard fields: PCs get descriptive fields for Everyone, Motivations for the
-- owner, Secrets for the owner (Private); NPCs start all GM-only.
CREATE OR REPLACE FUNCTION public.ext_characters_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open TEXT := CASE WHEN NEW.kind = 'pc' THEN 'players' ELSE 'gm' END;
  v_own TEXT := CASE WHEN NEW.kind = 'pc' THEN 'owner' ELSE 'gm' END;
BEGIN
  INSERT INTO public.ext_character_fields (character_id, channel_id, field_key, label, visibility, private, sort_order)
  VALUES
    (NEW.id, NEW.channel_id, 'occupation',  'Occupation',          v_open, false, 10),
    (NEW.id, NEW.channel_id, 'appearance',  'Appearance',          v_open, false, 20),
    (NEW.id, NEW.channel_id, 'personality', 'Personality',         v_open, false, 30),
    (NEW.id, NEW.channel_id, 'background',  'Background',          v_open, false, 40),
    (NEW.id, NEW.channel_id, 'speech',      'Speech & mannerisms', v_open, false, 50),
    (NEW.id, NEW.channel_id, 'whereabouts', 'Current whereabouts', v_open, false, 60),
    (NEW.id, NEW.channel_id, 'motivations', 'Motivations',         v_own,  false, 70),
    (NEW.id, NEW.channel_id, 'secrets',     'Secrets',             v_own,  NEW.kind = 'pc', 80),
    (NEW.id, NEW.channel_id, 'gm_notes',    'GM notes',            'gm',   false, 90);

  INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
  VALUES (NEW.id, NEW.channel_id, 'created', jsonb_build_object('kind', NEW.kind, 'name', NEW.name),
          'gm', auth.uid());
  RETURN NULL;
END;
$$;

-- Visibility of an automatic event about this character: shared with all
-- players when revealed, with the owner when it is their PC, else GM-only.
CREATE FUNCTION public.ext__event_visibility(p_revealed BOOLEAN, p_kind TEXT, p_owner_id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_revealed THEN 'players'
    WHEN p_kind = 'pc' AND p_owner_id IS NOT NULL THEN 'owner'
    ELSE 'gm'
  END;
$$;

REVOKE ALL ON FUNCTION public.ext__event_visibility(BOOLEAN, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;

-- After update: log renames, status and reveal changes, and keep the membership
-- name/portrait of whoever is currently posting as this character in step.
CREATE OR REPLACE FUNCTION public.ext_characters_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (NEW.id, NEW.channel_id, 'renamed',
            jsonb_build_object('from', OLD.name, 'to', NEW.name),
            public.ext__event_visibility(NEW.revealed, NEW.kind, NEW.owner_id), auth.uid());
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (NEW.id, NEW.channel_id, 'status_changed',
            jsonb_build_object('from', OLD.status, 'to', NEW.status),
            public.ext__event_visibility(NEW.revealed AND NEW.status_visible, NEW.kind, NEW.owner_id),
            auth.uid());
  END IF;

  IF NEW.revealed IS DISTINCT FROM OLD.revealed THEN
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (NEW.id, NEW.channel_id, CASE WHEN NEW.revealed THEN 'revealed' ELSE 'hidden' END,
            '{}'::jsonb, 'gm', auth.uid());
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.portrait_url IS DISTINCT FROM OLD.portrait_url THEN
    UPDATE public.channel_members cm
    SET character_name = LEFT(NEW.name, 20),
        character_avatar_url = NULLIF(NEW.portrait_url, '')
    FROM public.ext_posting_periods pp
    WHERE pp.character_id = NEW.id AND pp.ended_at IS NULL
      AND cm.channel_id = pp.channel_id AND cm.user_id = pp.user_id;
  END IF;

  RETURN NULL;
END;
$$;

-- Characters with posting history are retired through their status or role,
-- never deleted, so the campaign record and post labels stay intact. (A whole
-- campaign deletion still cascades: its channel row is already gone.)
CREATE FUNCTION public.ext_characters_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = OLD.channel_id)
     AND EXISTS (SELECT 1 FROM public.ext_posting_periods WHERE character_id = OLD.id) THEN
    RAISE EXCEPTION 'This character has posted in the campaign; change its status or role instead of deleting it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER ext_characters_before_delete
  BEFORE DELETE ON public.ext_characters
  FOR EACH ROW EXECUTE FUNCTION public.ext_characters_before_delete();

-- ---------------------------------------------------------------------------
-- 7. Triggers: fields
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ext_character_fields_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.channel_id, c.kind INTO NEW.channel_id, v_kind
    FROM public.ext_characters c WHERE c.id = NEW.character_id;
    IF NEW.channel_id IS NULL THEN
      RAISE EXCEPTION 'Unknown character' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NEW.character_id IS DISTINCT FROM OLD.character_id
       OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
       OR NEW.field_key IS DISTINCT FROM OLD.field_key THEN
      RAISE EXCEPTION 'A field cannot move to another character or change its kind'
        USING ERRCODE = 'P0001';
    END IF;
    SELECT c.kind INTO v_kind FROM public.ext_characters c WHERE c.id = NEW.character_id;
    NEW.updated_at := NOW();
  END IF;

  IF v_kind = 'npc' AND NEW.visibility = 'owner' THEN
    RAISE EXCEPTION 'NPCs have no owner: use Everyone or GM only' USING ERRCODE = 'P0001';
  END IF;
  -- "Private" only means something for Owner fields.
  IF NEW.visibility <> 'owner' THEN
    NEW.private := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Log every field change for the GM (old and new text, truncated), except the
-- standard fields the system creates with a new character, and changes that
-- happen because the whole character is being deleted.
CREATE FUNCTION public.ext_character_fields_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_character_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_character_id := OLD.character_id;
  ELSE
    v_character_id := NEW.character_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ext_characters WHERE id = v_character_id) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.field_key IS NOT NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (NEW.character_id, NEW.channel_id, 'field_edited',
            jsonb_build_object('action', 'added', 'field_id', NEW.id, 'label', NEW.label,
                               'item_type', NEW.item_type, 'new_body', LEFT(NEW.body, 1000)),
            'gm', auth.uid());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (OLD.character_id, OLD.channel_id, 'field_edited',
            jsonb_build_object('action', 'removed', 'field_id', OLD.id, 'label', OLD.label,
                               'item_type', OLD.item_type, 'old_body', LEFT(OLD.body, 1000)),
            'gm', auth.uid());
  ELSE
    IF NEW.label IS DISTINCT FROM OLD.label OR NEW.body IS DISTINCT FROM OLD.body THEN
      INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
      VALUES (NEW.character_id, NEW.channel_id, 'field_edited',
              jsonb_build_object('action', 'edited', 'field_id', NEW.id,
                                 'old_label', OLD.label, 'label', NEW.label,
                                 'old_body', LEFT(OLD.body, 1000), 'new_body', LEFT(NEW.body, 1000)),
              'gm', auth.uid());
    END IF;
    IF NEW.visibility IS DISTINCT FROM OLD.visibility OR NEW.private IS DISTINCT FROM OLD.private THEN
      INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
      VALUES (NEW.character_id, NEW.channel_id, 'field_visibility_changed',
              jsonb_build_object('field_id', NEW.id, 'label', NEW.label,
                                 'from', OLD.visibility, 'to', NEW.visibility,
                                 'private_from', OLD.private, 'private_to', NEW.private),
              'gm', auth.uid());
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER ext_character_fields_after_update ON public.ext_character_fields;
DROP FUNCTION public.ext_character_fields_after_update();

CREATE TRIGGER ext_character_fields_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.ext_character_fields
  FOR EACH ROW EXECUTE FUNCTION public.ext_character_fields_after_change();

REVOKE ALL ON FUNCTION public.ext_characters_before_delete() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_character_fields_after_change() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Event logging helper: owner-aware visibility
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ext__log_event(
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
  INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, note, visibility, actor_id)
  SELECT c.id, c.channel_id, p_event_type, p_details, p_note,
         public.ext__event_visibility(c.revealed, c.kind, c.owner_id), auth.uid()
  FROM public.ext_characters c
  WHERE c.id = p_character_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Posting: re-home a player whose current character is no longer theirs
-- ---------------------------------------------------------------------------

-- If the player's open posting period is for a character they no longer
-- control in play, switch them to another active in-play PC of theirs (most
-- recently updated), or back to their account name.
CREATE FUNCTION public.ext__refresh_posting(p_channel_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current UUID;
  v_next UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  SELECT pp.character_id INTO v_current
  FROM public.ext_posting_periods pp
  WHERE pp.channel_id = p_channel_id AND pp.user_id = p_user_id AND pp.ended_at IS NULL;

  IF v_current IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ext_characters c
    WHERE c.id = v_current AND c.kind = 'pc' AND c.in_play AND c.owner_id = p_user_id
  ) THEN
    RETURN; -- still theirs
  END IF;

  SELECT c.id INTO v_next
  FROM public.ext_characters c
  WHERE c.channel_id = p_channel_id AND c.kind = 'pc' AND c.in_play
    AND c.owner_id = p_user_id AND c.status = 'active'
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF v_current IS NULL AND v_next IS NULL THEN
    RETURN; -- never posted as anyone, nothing to change
  END IF;
  PERFORM public.ext__set_posting(p_channel_id, p_user_id, v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.ext__refresh_posting(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Client functions
-- ---------------------------------------------------------------------------

-- GM sets a character's role and player in one go:
--   p_kind 'pc' + p_in_play true   PC in play for p_owner_id (may be NULL = unassigned)
--   p_kind 'pc' + p_in_play false  PC out of play (p_owner_id = former owner)
--   p_kind 'npc'                   NPC (owner cleared; Owner fields become GM-only;
--                                  an NPC posting identity is linked)
CREATE FUNCTION public.ext_set_role(
  p_character_id UUID,
  p_kind TEXT,
  p_in_play BOOLEAN,
  p_owner_id UUID,
  p_note TEXT DEFAULT NULL
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

  IF p_kind = 'npc' THEN
    v_owner := NULL;
    v_in_play := true;
  END IF;

  IF v_owner IS NOT NULL THEN
    -- Lock the player's membership row so concurrent changes cannot exceed the cap.
    SELECT * INTO v_member FROM public.channel_members
    WHERE channel_id = c.channel_id AND user_id = v_owner
    FOR UPDATE;
    IF v_member.id IS NULL OR v_member.is_blocked THEN
      RAISE EXCEPTION 'That player is not an active member of this campaign' USING ERRCODE = 'P0001';
    END IF;
    IF v_in_play AND (
      SELECT count(*) FROM public.ext_characters
      WHERE channel_id = c.channel_id AND kind = 'pc' AND in_play
        AND owner_id = v_owner AND id <> c.id
    ) >= 3 THEN
      RAISE EXCEPTION 'A player can have at most 3 characters in play at once' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_kind = 'npc' AND c.kind = 'pc' THEN
    v_npc_id := c.npc_id;
    IF v_npc_id IS NULL THEN
      v_npc_name := LEFT(c.name, 40);
      SELECT id INTO v_npc_id FROM public.channel_npcs
      WHERE channel_id = c.channel_id AND name = v_npc_name;
      IF v_npc_id IS NULL THEN
        INSERT INTO public.channel_npcs (channel_id, name, avatar_url)
        VALUES (c.channel_id, v_npc_name, COALESCE(c.portrait_url, ''))
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

  PERFORM set_config('ext.allow_role_change', 'on', true);
  UPDATE public.ext_characters
  SET kind = p_kind,
      in_play = v_in_play,
      owner_id = v_owner,
      npc_id = v_npc_id,
      converted_to_npc_at = CASE WHEN p_kind = 'npc' AND c.kind = 'pc' THEN NOW() ELSE converted_to_npc_at END
  WHERE id = c.id;
  PERFORM set_config('ext.allow_role_change', 'off', true);

  PERFORM public.ext__log_event(c.id, 'role_changed', jsonb_build_object(
    'from', jsonb_build_object('kind', c.kind, 'in_play', c.in_play, 'owner_id', c.owner_id),
    'to', jsonb_build_object('kind', p_kind, 'in_play', v_in_play, 'owner_id', v_owner)
  ), NULLIF(btrim(p_note), ''));

  -- The previous owner may have been posting as this character.
  IF c.owner_id IS NOT NULL THEN
    PERFORM public.ext__refresh_posting(c.channel_id, c.owner_id);
  END IF;

  -- A new in-play owner who is not posting as anyone starts posting as this
  -- character (if active). Their very first period starts when they joined.
  IF p_kind = 'pc' AND v_in_play AND v_owner IS NOT NULL AND c.status = 'active'
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

-- Switch which PC a player posts as: the owner (or GM) of an in-play, active PC.
CREATE OR REPLACE FUNCTION public.ext_post_as(p_character_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.ext_characters%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.ext_characters WHERE id = p_character_id;
  IF c.id IS NULL OR c.kind <> 'pc' OR c.owner_id IS NULL
     OR NOT (
       (c.owner_id = auth.uid() AND is_channel_member(c.channel_id))
       OR is_channel_gm(c.channel_id)
     ) THEN
    RAISE EXCEPTION 'You can only post as a character you control' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = c.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF NOT c.in_play THEN
    RAISE EXCEPTION 'This character is out of play' USING ERRCODE = 'P0001';
  END IF;
  IF c.status <> 'active' THEN
    RAISE EXCEPTION 'This character is not currently active' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ext_posting_periods
             WHERE channel_id = c.channel_id AND user_id = c.owner_id
               AND character_id = c.id AND ended_at IS NULL) THEN
    RETURN;
  END IF;

  PERFORM public.ext__set_posting(c.channel_id, c.owner_id, c.id);
END;
$$;

-- Owner (in play) or GM renames a PC or changes its portrait. Other core
-- settings (status, reveal, aliases, role) stay with the GM.
CREATE FUNCTION public.ext_update_my_character(p_character_id UUID, p_name TEXT, p_portrait_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.ext_can_edit_character(p_character_id) THEN
    RAISE EXCEPTION 'You can only edit a character you play' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ext_characters
  SET name = btrim(p_name),
      portrait_url = NULLIF(btrim(COALESCE(p_portrait_url, '')), '')
  WHERE id = p_character_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_set_role(UUID, TEXT, BOOLEAN, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_update_my_character(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_set_role(UUID, TEXT, BOOLEAN, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_update_my_character(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Player-facing character list (replaces the step-1 projection)
-- ---------------------------------------------------------------------------

-- Characters a member may see: revealed ones and their own PCs. Status is
-- shown to the owner always, to others only when status_visible. Aliases,
-- tags and other GM data are never returned.
DROP FUNCTION public.ext_list_revealed_characters(UUID);

CREATE FUNCTION public.ext_list_revealed_characters(p_channel_id UUID)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  in_play BOOLEAN,
  name TEXT,
  portrait_url TEXT,
  status TEXT,
  owner_id UUID,
  is_mine BOOLEAN,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.kind, c.in_play, c.name, c.portrait_url,
         CASE WHEN c.status_visible OR c.owner_id = auth.uid() THEN c.status END,
         c.owner_id,
         c.kind = 'pc' AND c.owner_id = auth.uid(),
         c.updated_at
  FROM public.ext_characters c
  WHERE c.channel_id = p_channel_id
    AND (c.revealed OR (c.kind = 'pc' AND c.owner_id = auth.uid()))
    AND (is_channel_member(p_channel_id) OR is_channel_gm(p_channel_id))
  ORDER BY c.kind, c.name;
$$;

REVOKE ALL ON FUNCTION public.ext_list_revealed_characters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_list_revealed_characters(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. NPC tags (GM-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ext_tags_channel_name_idx ON public.ext_tags (channel_id, lower(name));

CREATE TABLE public.ext_character_tags (
  character_id UUID NOT NULL REFERENCES public.ext_characters(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.ext_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, tag_id)
);

CREATE INDEX ext_character_tags_tag_idx ON public.ext_character_tags (tag_id);

ALTER TABLE public.ext_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_character_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM reads tags"
  ON public.ext_tags FOR SELECT
  USING (is_channel_gm(channel_id));

CREATE POLICY "GM manages tags"
  ON public.ext_tags FOR ALL
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels ch WHERE ch.id = ext_tags.channel_id AND ch.is_archived)
  )
  WITH CHECK (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels ch WHERE ch.id = ext_tags.channel_id AND ch.is_archived)
  );

-- A tag can only be attached to a character of the same campaign.
CREATE POLICY "GM reads character tags"
  ON public.ext_character_tags FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.ext_tags t WHERE t.id = tag_id AND is_channel_gm(t.channel_id)
  ));

CREATE POLICY "GM manages character tags"
  ON public.ext_character_tags FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.ext_tags t
    JOIN public.channels ch ON ch.id = t.channel_id
    WHERE t.id = tag_id AND is_channel_gm(t.channel_id) AND NOT ch.is_archived
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ext_tags t
    JOIN public.ext_characters c ON c.id = character_id AND c.channel_id = t.channel_id
    JOIN public.channels ch ON ch.id = t.channel_id
    WHERE t.id = tag_id AND is_channel_gm(t.channel_id) AND NOT ch.is_archived
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ext_tags TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ext_character_tags TO authenticated, service_role;
