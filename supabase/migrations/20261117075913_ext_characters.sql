-- Fork Phase 2a, step 1: characters (PCs + NPCs), profile fields with
-- per-field visibility, and an automatic character history.
-- Design: docs/delta-green/02-phase2a-plan.md. All objects are new (ext_ prefix);
-- no upstream table is altered.
--
-- Visibility model
--   * ext_characters is readable by the channel GM only. Row-level
--     security cannot hide single columns, and status/aliases can be secret, so
--     players read characters through ext_list_revealed_characters(), a safe
--     projection: revealed characters only, status only when status_visible,
--     never aliases.
--   * ext_character_fields / ext_character_events rows are readable by players
--     when visibility = 'players' AND the character is revealed.
--   * All writes are GM-only and rejected on archived channels.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pc', 'npc')),
  name TEXT NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  -- Alternative names used to find mentions in posts (activity log, step 6).
  -- GM-only: an alias can give a secret away.
  aliases TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(aliases) <= 10),
  portrait_url TEXT CHECK (portrait_url IS NULL OR char_length(portrait_url) <= 500),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'unavailable', 'retired', 'incapacitated', 'deceased', 'insane', 'missing'
  )),
  -- Whether players may see the status of a revealed character.
  status_visible BOOLEAN NOT NULL DEFAULT true,
  -- Whether the character exists as far as the players are concerned.
  revealed BOOLEAN NOT NULL DEFAULT false,
  -- NPC posting identity (upstream roster), linked on PC->NPC conversion (step 2).
  npc_id UUID REFERENCES public.channel_npcs(id) ON DELETE SET NULL,
  converted_to_npc_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ext_characters_channel_kind_name_idx
  ON public.ext_characters (channel_id, kind, name);

CREATE TABLE public.ext_character_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.ext_characters(id) ON DELETE CASCADE,
  -- Copied from the character by trigger (never trusted from the client); kept
  -- here so policies can check membership without a join.
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  -- Standard fields carry a key; custom fields have NULL.
  field_key TEXT CHECK (field_key IS NULL OR field_key IN (
    'occupation', 'appearance', 'personality', 'background', 'speech',
    'whereabouts', 'motivations', 'secrets', 'gm_notes'
  )),
  label TEXT NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 60),
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 8000),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('players', 'gm')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- "GM notes" can never be shown to players.
  CONSTRAINT ext_character_fields_gm_notes_locked
    CHECK (field_key IS DISTINCT FROM 'gm_notes' OR visibility = 'gm')
);

CREATE UNIQUE INDEX ext_character_fields_standard_key_idx
  ON public.ext_character_fields (character_id, field_key)
  WHERE field_key IS NOT NULL;
CREATE INDEX ext_character_fields_character_order_idx
  ON public.ext_character_fields (character_id, sort_order);

CREATE TABLE public.ext_character_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.ext_characters(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  -- Step 2 extends this list (given/taken/posting/conversion events).
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'renamed', 'status_changed', 'revealed', 'hidden',
    'field_visibility_changed', 'note'
  )),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('players', 'gm')),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_character_events_note_has_text
    CHECK (event_type <> 'note' OR (note IS NOT NULL AND note ~ '[^[:space:]]'))
);

CREATE INDEX ext_character_events_character_created_idx
  ON public.ext_character_events (character_id, created_at DESC);

ALTER TABLE public.ext_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_character_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_character_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policy helper
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because players cannot read ext_characters directly; it only
-- answers "is this character revealed?" for a known id.
CREATE FUNCTION public.ext_character_revealed(p_character_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ext_characters
    WHERE id = p_character_id AND revealed
  );
$$;

REVOKE ALL ON FUNCTION public.ext_character_revealed(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_character_revealed(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies: ext_characters (GM only)
-- ---------------------------------------------------------------------------

CREATE POLICY "GM reads characters"
  ON public.ext_characters FOR SELECT
  USING (is_channel_gm(channel_id));

CREATE POLICY "GM creates characters"
  ON public.ext_characters FOR INSERT
  WITH CHECK (
    is_channel_gm(channel_id)
    AND created_by = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_characters.channel_id AND c.is_archived
    )
  );

CREATE POLICY "GM updates characters"
  ON public.ext_characters FOR UPDATE
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_characters.channel_id AND c.is_archived
    )
  )
  WITH CHECK (is_channel_gm(channel_id));

CREATE POLICY "GM deletes characters"
  ON public.ext_characters FOR DELETE
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_characters.channel_id AND c.is_archived
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: ext_character_fields
-- ---------------------------------------------------------------------------

CREATE POLICY "GM reads all fields; members read player-visible fields of revealed characters"
  ON public.ext_character_fields FOR SELECT
  USING (
    is_channel_gm(channel_id)
    OR (
      visibility = 'players'
      AND is_channel_member(channel_id)
      AND ext_character_revealed(character_id)
    )
  );

CREATE POLICY "GM writes fields"
  ON public.ext_character_fields FOR INSERT
  WITH CHECK (
    is_channel_gm(channel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_character_fields.channel_id AND c.is_archived
    )
  );

CREATE POLICY "GM updates fields"
  ON public.ext_character_fields FOR UPDATE
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_character_fields.channel_id AND c.is_archived
    )
  )
  WITH CHECK (is_channel_gm(channel_id));

CREATE POLICY "GM deletes fields"
  ON public.ext_character_fields FOR DELETE
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_character_fields.channel_id AND c.is_archived
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: ext_character_events
-- Automatic events are written by SECURITY DEFINER triggers; the GM may add,
-- edit and delete only 'note' entries, and change any entry's visibility.
-- ---------------------------------------------------------------------------

CREATE POLICY "GM reads all events; members read player-visible events of revealed characters"
  ON public.ext_character_events FOR SELECT
  USING (
    is_channel_gm(channel_id)
    OR (
      visibility = 'players'
      AND is_channel_member(channel_id)
      AND ext_character_revealed(character_id)
    )
  );

CREATE POLICY "GM adds log notes"
  ON public.ext_character_events FOR INSERT
  WITH CHECK (
    is_channel_gm(channel_id)
    AND event_type = 'note'
    AND actor_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_character_events.channel_id AND c.is_archived
    )
  );

CREATE POLICY "GM updates events"
  ON public.ext_character_events FOR UPDATE
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_character_events.channel_id AND c.is_archived
    )
  )
  WITH CHECK (is_channel_gm(channel_id));

CREATE POLICY "GM deletes log notes"
  ON public.ext_character_events FOR DELETE
  USING (
    is_channel_gm(channel_id)
    AND event_type = 'note'
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = ext_character_events.channel_id AND c.is_archived
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers: ext_characters
-- ---------------------------------------------------------------------------

-- Row guard: validation and immutable columns. SECURITY DEFINER because
-- url_scheme_allowed() is owner-only (same reason as enforce_npc_url_scheme).
CREATE FUNCTION public.ext_characters_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alias TEXT;
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

  IF TG_OP = 'UPDATE' THEN
    IF NEW.channel_id IS DISTINCT FROM OLD.channel_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'A character cannot change campaign, creator or creation time'
        USING ERRCODE = 'P0001';
    END IF;
    -- Kind changes only through ext_convert_to_npc (step 2), which sets this
    -- transaction-local flag.
    IF NEW.kind IS DISTINCT FROM OLD.kind
       AND COALESCE(current_setting('ext.allow_kind_change', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Use the conversion action to turn a player character into an NPC'
        USING ERRCODE = 'P0001';
    END IF;
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ext_characters_guard
  BEFORE INSERT OR UPDATE ON public.ext_characters
  FOR EACH ROW EXECUTE FUNCTION public.ext_characters_guard();

-- After insert: create the standard profile fields and log 'created'.
-- PCs start with the descriptive fields visible to the players; NPCs start
-- with everything GM-only.
CREATE FUNCTION public.ext_characters_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open TEXT := CASE WHEN NEW.kind = 'pc' THEN 'players' ELSE 'gm' END;
BEGIN
  INSERT INTO public.ext_character_fields (character_id, channel_id, field_key, label, visibility, sort_order)
  VALUES
    (NEW.id, NEW.channel_id, 'occupation',    'Occupation',          v_open,    10),
    (NEW.id, NEW.channel_id, 'appearance',    'Appearance',          v_open,    20),
    (NEW.id, NEW.channel_id, 'personality',   'Personality',         v_open,    30),
    (NEW.id, NEW.channel_id, 'background',    'Background',          v_open,    40),
    (NEW.id, NEW.channel_id, 'speech',        'Speech & mannerisms', v_open,    50),
    (NEW.id, NEW.channel_id, 'whereabouts',   'Current whereabouts', v_open,    60),
    (NEW.id, NEW.channel_id, 'motivations',   'Motivations',         'gm', 70),
    (NEW.id, NEW.channel_id, 'secrets',       'Secrets',             'gm', 80),
    (NEW.id, NEW.channel_id, 'gm_notes', 'GM notes',       'gm', 90);

  INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
  VALUES (NEW.id, NEW.channel_id, 'created', jsonb_build_object('kind', NEW.kind, 'name', NEW.name),
          'gm', auth.uid());
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_characters_after_insert
  AFTER INSERT ON public.ext_characters
  FOR EACH ROW EXECUTE FUNCTION public.ext_characters_after_insert();

-- After update: log renames, status changes and reveal/hide. A status change is
-- shown to the players only if the character is revealed and its status is
-- visible to them; renames only if revealed. Reveal/hide is GM-only.
CREATE FUNCTION public.ext_characters_after_update()
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
            CASE WHEN NEW.revealed THEN 'players' ELSE 'gm' END, auth.uid());
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (NEW.id, NEW.channel_id, 'status_changed',
            jsonb_build_object('from', OLD.status, 'to', NEW.status),
            CASE WHEN NEW.revealed AND NEW.status_visible THEN 'players' ELSE 'gm' END, auth.uid());
  END IF;

  IF NEW.revealed IS DISTINCT FROM OLD.revealed THEN
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (NEW.id, NEW.channel_id, CASE WHEN NEW.revealed THEN 'revealed' ELSE 'hidden' END,
            '{}'::jsonb, 'gm', auth.uid());
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_characters_after_update
  AFTER UPDATE ON public.ext_characters
  FOR EACH ROW EXECUTE FUNCTION public.ext_characters_after_update();

-- ---------------------------------------------------------------------------
-- Triggers: ext_character_fields
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_character_fields_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Never trust a client-supplied channel: copy it from the character.
    SELECT c.channel_id INTO NEW.channel_id
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
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ext_character_fields_guard
  BEFORE INSERT OR UPDATE ON public.ext_character_fields
  FOR EACH ROW EXECUTE FUNCTION public.ext_character_fields_guard();

CREATE FUNCTION public.ext_character_fields_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (NEW.character_id, NEW.channel_id, 'field_visibility_changed',
            jsonb_build_object('field_id', NEW.id, 'label', NEW.label,
                               'from', OLD.visibility, 'to', NEW.visibility),
            'gm', auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_character_fields_after_update
  AFTER UPDATE ON public.ext_character_fields
  FOR EACH ROW EXECUTE FUNCTION public.ext_character_fields_after_update();

-- ---------------------------------------------------------------------------
-- Triggers: ext_character_events
-- ---------------------------------------------------------------------------

-- History is append-only: only the visibility of any entry, and the text of a
-- GM note, may change. Inserts by the GM (notes) get the channel copied
-- from the character.
CREATE FUNCTION public.ext_character_events_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.channel_id INTO NEW.channel_id
    FROM public.ext_characters c WHERE c.id = NEW.character_id;
    IF NEW.channel_id IS NULL THEN
      RAISE EXCEPTION 'Unknown character' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.character_id IS DISTINCT FROM OLD.character_id
     OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.event_type <> 'note' AND NEW.note IS DISTINCT FROM OLD.note) THEN
    RAISE EXCEPTION 'History entries are permanent; only visibility (and note text) can change'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ext_character_events_guard
  BEFORE INSERT OR UPDATE ON public.ext_character_events
  FOR EACH ROW EXECUTE FUNCTION public.ext_character_events_guard();

-- Trigger functions are never called directly (house rule, SEC-1 sweep).
REVOKE ALL ON FUNCTION public.ext_characters_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_characters_after_insert() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_characters_after_update() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_character_fields_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_character_fields_after_update() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_character_events_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Player-facing projection
-- ---------------------------------------------------------------------------

-- Revealed characters of a campaign, for its members (and GM). Status is NULL
-- when the GM keeps it hidden; aliases and GM data are never returned.
CREATE FUNCTION public.ext_list_revealed_characters(p_channel_id UUID)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  name TEXT,
  portrait_url TEXT,
  status TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.kind, c.name, c.portrait_url,
         CASE WHEN c.status_visible THEN c.status END,
         c.updated_at
  FROM public.ext_characters c
  WHERE c.channel_id = p_channel_id
    AND c.revealed
    AND (is_channel_member(p_channel_id) OR is_channel_gm(p_channel_id))
  ORDER BY c.kind, c.name;
$$;

REVOKE ALL ON FUNCTION public.ext_list_revealed_characters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_list_revealed_characters(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Data API grants (new public tables are not auto-exposed). No anon access.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ext_characters TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ext_character_fields TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ext_character_events TO authenticated, service_role;
