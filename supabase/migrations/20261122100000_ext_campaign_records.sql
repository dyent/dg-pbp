-- Campaign records and the Case file (Phase 2b step 1, DECISIONS.md #38, #39).
--
-- Locations, organisations, clues and operations: one shared design, like
-- character profiles.
--   * Only the campaign's GM creates, edits and deletes records.
--   * Each record is visible to the GM only ('gm', the default), every player
--     ('players'), or chosen players ('selected', in ext_record_shares).
--     Sharing is per player, not per character (as for campaign files, #29).
--   * Profile fields and headings are 'players' (whoever can see the record)
--     or 'gm' (GM only). GM notes are always GM only.
--   * Tags reuse the campaign tag list (ext_tags) and are GM-only, as for NPCs.
--   * Every change is logged in a GM-only history.
--   * provenance: 'canon' for everything the GM writes; 'source' is reserved
--     for adventure import (Phase 3). AI suggestions never become records
--     directly; they will wait in a proposals table (Phase 4).
-- Aliases, notes, Activity and @tags come in step 2, links in step 3, clue
-- status and checklist in step 4.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('location', 'organisation', 'clue', 'operation')),
  name TEXT NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  picture_url TEXT CHECK (picture_url IS NULL OR char_length(picture_url) <= 500),
  provenance TEXT NOT NULL DEFAULT 'canon' CHECK (provenance IN ('canon', 'source')),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm', 'players', 'selected')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ext_records_channel_idx ON public.ext_records (channel_id, kind, name);

CREATE TABLE public.ext_record_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  -- Copied from the record by the guard trigger (for policies and indexes).
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'field' CHECK (item_type IN ('field', 'heading')),
  -- Standard fields created with the record; NULL for the GM's own ones.
  field_key TEXT CHECK (field_key IS NULL OR field_key IN (
    'description', 'address', 'occupants', 'goals', 'resources', 'secrets',
    'suggests', 'briefing', 'summary', 'outcome', 'gm_notes'
  )),
  label TEXT NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 60),
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 8000),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('players', 'gm')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_record_fields_gm_notes_gm_only
    CHECK (field_key IS DISTINCT FROM 'gm_notes' OR visibility = 'gm'),
  CONSTRAINT ext_record_fields_heading_shape
    CHECK (item_type = 'field' OR (body = '' AND field_key IS NULL))
);

CREATE INDEX ext_record_fields_record_idx ON public.ext_record_fields (record_id, sort_order);

CREATE TABLE public.ext_record_shares (
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_id, user_id)
);

CREATE INDEX ext_record_shares_user_idx ON public.ext_record_shares (user_id);

CREATE TABLE public.ext_record_tags (
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.ext_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_id, tag_id)
);

CREATE INDEX ext_record_tags_tag_idx ON public.ext_record_tags (tag_id);

CREATE TABLE public.ext_record_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.ext_records(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'renamed', 'visibility_changed', 'field_edited', 'field_visibility_changed'
  )),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ext_record_events_record_idx ON public.ext_record_events (record_id, created_at DESC);

ALTER TABLE public.ext_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_record_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_record_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_record_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_record_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Access helper (used by the policies, so callers need EXECUTE)
-- ---------------------------------------------------------------------------

-- May the caller see this record (its name and its 'players' fields)?
-- SECURITY DEFINER so it can read the shares, which only the GM may list.
CREATE FUNCTION public.ext_can_read_record(p_record_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT is_channel_gm(r.channel_id)
        OR (is_channel_member(r.channel_id) AND (
              r.visibility = 'players'
              OR (r.visibility = 'selected' AND EXISTS (
                    SELECT 1 FROM public.ext_record_shares s
                    WHERE s.record_id = r.id AND s.user_id = auth.uid()))))
    FROM public.ext_records r
    WHERE r.id = p_record_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.ext_can_read_record(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_can_read_record(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Row-level security
-- ---------------------------------------------------------------------------

-- Records: read per visibility; the GM writes (visibility only via
-- ext_set_record_visibility, enforced by the guard trigger). The GM check comes
-- first so INSERT ... RETURNING works: the helper can't see a row that is
-- still being inserted.
CREATE POLICY "Records are readable per their visibility"
  ON public.ext_records FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id) OR public.ext_can_read_record(id));

CREATE POLICY "GM creates records"
  ON public.ext_records FOR INSERT TO authenticated
  WITH CHECK (
    is_channel_gm(channel_id)
    AND created_by = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_records.channel_id AND c.is_archived)
  );

CREATE POLICY "GM updates records"
  ON public.ext_records FOR UPDATE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_records.channel_id AND c.is_archived)
  )
  WITH CHECK (is_channel_gm(channel_id));

CREATE POLICY "GM deletes records"
  ON public.ext_records FOR DELETE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_records.channel_id AND c.is_archived)
  );

-- Fields: the GM reads all; others read 'players' fields of records they can see.
CREATE POLICY "GM reads all record fields; viewers read shown fields"
  ON public.ext_record_fields FOR SELECT TO authenticated
  USING (
    is_channel_gm(channel_id)
    OR (visibility = 'players' AND public.ext_can_read_record(record_id))
  );

CREATE POLICY "GM adds record fields"
  ON public.ext_record_fields FOR INSERT TO authenticated
  WITH CHECK (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_record_fields.channel_id AND c.is_archived)
  );

CREATE POLICY "GM updates record fields"
  ON public.ext_record_fields FOR UPDATE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_record_fields.channel_id AND c.is_archived)
  )
  WITH CHECK (is_channel_gm(channel_id));

CREATE POLICY "GM deletes record fields"
  ON public.ext_record_fields FOR DELETE TO authenticated
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ext_record_fields.channel_id AND c.is_archived)
  );

-- Shares: GM reads; written only by ext_set_record_visibility.
CREATE POLICY "GM reads record shares"
  ON public.ext_record_shares FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ext_records r WHERE r.id = record_id AND is_channel_gm(r.channel_id)));

-- Tags: GM only (a tag can only be attached to a record of the same campaign).
CREATE POLICY "GM reads record tags"
  ON public.ext_record_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ext_tags t WHERE t.id = tag_id AND is_channel_gm(t.channel_id)));

CREATE POLICY "GM manages record tags"
  ON public.ext_record_tags FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ext_tags t
    JOIN public.channels ch ON ch.id = t.channel_id
    WHERE t.id = tag_id AND is_channel_gm(t.channel_id) AND NOT ch.is_archived))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ext_tags t
    JOIN public.ext_records r ON r.id = record_id AND r.channel_id = t.channel_id
    JOIN public.channels ch ON ch.id = t.channel_id
    WHERE t.id = tag_id AND is_channel_gm(t.channel_id) AND NOT ch.is_archived));

-- History: GM reads; written only by the triggers and functions below.
CREATE POLICY "GM reads record history"
  ON public.ext_record_events FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

REVOKE ALL ON public.ext_records, public.ext_record_fields, public.ext_record_shares,
  public.ext_record_tags, public.ext_record_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ext_records, public.ext_record_fields,
  public.ext_record_tags TO authenticated;
GRANT SELECT ON public.ext_record_shares, public.ext_record_events TO authenticated;
GRANT ALL ON public.ext_records, public.ext_record_fields, public.ext_record_shares,
  public.ext_record_tags, public.ext_record_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Triggers: records
-- ---------------------------------------------------------------------------

-- Row guard: picture URL scheme, immutable columns, visibility only through
-- ext_set_record_visibility (which sets a transaction-local flag).
CREATE FUNCTION public.ext_records_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.picture_url = '' THEN
    NEW.picture_url := NULL;
  END IF;
  IF NEW.picture_url IS NOT NULL AND NOT public.url_scheme_allowed(NEW.picture_url) THEN
    RAISE EXCEPTION 'URLs must start with http:// or https://' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.visibility <> 'gm' THEN
      RAISE EXCEPTION 'New records start as GM only; share them afterwards' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A record cannot change campaign, kind, creator or creation time'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.visibility IS DISTINCT FROM OLD.visibility
     AND COALESCE(current_setting('ext.allow_record_visibility', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Use the sharing settings to change who can see a record' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ext_records_guard
  BEFORE INSERT OR UPDATE ON public.ext_records
  FOR EACH ROW EXECUTE FUNCTION public.ext_records_guard();

-- After insert: the kind's standard fields, and the 'created' entry.
CREATE FUNCTION public.ext_records_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ext_record_fields (record_id, channel_id, field_key, label, visibility, sort_order)
  SELECT NEW.id, NEW.channel_id, f.key, f.label, f.visibility, f.sort_order
  FROM (VALUES
    ('location',     'description', 'Description',       'players', 10),
    ('location',     'address',     'Address / where',   'players', 20),
    ('location',     'occupants',   'Who''s there',      'gm',      10),
    ('organisation', 'description', 'Description',       'players', 10),
    ('organisation', 'goals',       'Goals',             'gm',      10),
    ('organisation', 'resources',   'Resources',         'gm',      20),
    ('organisation', 'secrets',     'Secrets',           'gm',      30),
    ('clue',         'description', 'Description',       'players', 10),
    ('clue',         'suggests',    'What it suggests',  'gm',      10),
    ('operation',    'briefing',    'Briefing',          'players', 10),
    ('operation',    'summary',     'Summary',           'players', 20),
    ('operation',    'outcome',     'Outcome',           'players', 30)
  ) AS f(kind, key, label, visibility, sort_order)
  WHERE f.kind = NEW.kind
  UNION ALL
  SELECT NEW.id, NEW.channel_id, 'gm_notes', 'GM notes', 'gm', 90;

  INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
  VALUES (NEW.id, NEW.channel_id, 'created', jsonb_build_object('kind', NEW.kind, 'name', NEW.name), auth.uid());
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_records_after_insert
  AFTER INSERT ON public.ext_records
  FOR EACH ROW EXECUTE FUNCTION public.ext_records_after_insert();

CREATE FUNCTION public.ext_records_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
    VALUES (NEW.id, NEW.channel_id, 'renamed', jsonb_build_object('from', OLD.name, 'to', NEW.name), auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_records_after_update
  AFTER UPDATE ON public.ext_records
  FOR EACH ROW EXECUTE FUNCTION public.ext_records_after_update();

-- ---------------------------------------------------------------------------
-- 5. Triggers: fields
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_record_fields_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT r.channel_id INTO NEW.channel_id FROM public.ext_records r WHERE r.id = NEW.record_id;
    IF NEW.channel_id IS NULL THEN
      RAISE EXCEPTION 'Unknown record' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NEW.record_id IS DISTINCT FROM OLD.record_id
       OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
       OR NEW.field_key IS DISTINCT FROM OLD.field_key
       OR NEW.item_type IS DISTINCT FROM OLD.item_type THEN
      RAISE EXCEPTION 'A field cannot move to another record or change its kind' USING ERRCODE = 'P0001';
    END IF;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ext_record_fields_guard
  BEFORE INSERT OR UPDATE ON public.ext_record_fields
  FOR EACH ROW EXECUTE FUNCTION public.ext_record_fields_guard();

-- Log every field change (old and new text, truncated), except the standard
-- fields created with a record and removals caused by deleting the record.
CREATE FUNCTION public.ext_record_fields_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.record_id ELSE NEW.record_id END;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ext_records WHERE id = v_record_id) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.field_key IS NOT NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
    VALUES (NEW.record_id, NEW.channel_id, 'field_edited',
            jsonb_build_object('action', 'added', 'field_id', NEW.id, 'label', NEW.label,
                               'item_type', NEW.item_type, 'new_body', LEFT(NEW.body, 1000)),
            auth.uid());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
    VALUES (OLD.record_id, OLD.channel_id, 'field_edited',
            jsonb_build_object('action', 'removed', 'field_id', OLD.id, 'label', OLD.label,
                               'item_type', OLD.item_type, 'old_body', LEFT(OLD.body, 1000)),
            auth.uid());
  ELSE
    IF NEW.label IS DISTINCT FROM OLD.label OR NEW.body IS DISTINCT FROM OLD.body THEN
      INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
      VALUES (NEW.record_id, NEW.channel_id, 'field_edited',
              jsonb_build_object('action', 'edited', 'field_id', NEW.id,
                                 'old_label', OLD.label, 'label', NEW.label,
                                 'old_body', LEFT(OLD.body, 1000), 'new_body', LEFT(NEW.body, 1000)),
              auth.uid());
    END IF;
    IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
      INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
      VALUES (NEW.record_id, NEW.channel_id, 'field_visibility_changed',
              jsonb_build_object('field_id', NEW.id, 'label', NEW.label,
                                 'from', OLD.visibility, 'to', NEW.visibility),
              auth.uid());
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ext_record_fields_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.ext_record_fields
  FOR EACH ROW EXECUTE FUNCTION public.ext_record_fields_after_change();

REVOKE ALL ON FUNCTION public.ext_records_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_records_after_insert() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_records_after_update() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_record_fields_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext_record_fields_after_change() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Sharing
-- ---------------------------------------------------------------------------

-- Set who can see a record: 'gm', 'players', or 'selected' with the chosen
-- players (current, unblocked players of the campaign, not the GM). Logs one
-- 'visibility_changed' entry (nothing if nothing changed).
CREATE FUNCTION public.ext_set_record_visibility(p_record_id UUID, p_visibility TEXT, p_player_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.ext_records%ROWTYPE;
  v_players UUID[] := '{}';
  v_old_players UUID[];
  v_added UUID[];
  v_removed UUID[];
BEGIN
  SELECT * INTO r FROM public.ext_records WHERE id = p_record_id FOR UPDATE;
  IF r.id IS NULL OR NOT COALESCE(is_channel_gm(r.channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can share records' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = r.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF p_visibility IS NULL OR p_visibility NOT IN ('gm', 'players', 'selected') THEN
    RAISE EXCEPTION 'Unknown sharing setting' USING ERRCODE = '22023';
  END IF;

  IF p_visibility = 'selected' THEN
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_players FROM unnest(COALESCE(p_player_ids, '{}')) x;
    IF cardinality(v_players) = 0 THEN
      RAISE EXCEPTION 'Choose at least one player to share the record with' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_players) x
      WHERE NOT EXISTS (
        SELECT 1 FROM public.channel_members m
        JOIN public.channels ch ON ch.id = m.channel_id
        WHERE m.channel_id = r.channel_id AND m.user_id = x
          AND NOT m.is_blocked AND m.user_id IS DISTINCT FROM ch.gm_id)
    ) THEN
      RAISE EXCEPTION 'Records can only be shared with players in this campaign' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(user_id), '{}') INTO v_old_players
    FROM public.ext_record_shares WHERE record_id = p_record_id;
  SELECT COALESCE(array_agg(x), '{}') INTO v_added FROM unnest(v_players) x WHERE x <> ALL (v_old_players);
  SELECT COALESCE(array_agg(x), '{}') INTO v_removed FROM unnest(v_old_players) x WHERE x <> ALL (v_players);

  IF p_visibility = r.visibility AND cardinality(v_added) = 0 AND cardinality(v_removed) = 0 THEN
    RETURN;
  END IF;

  PERFORM set_config('ext.allow_record_visibility', 'on', true);
  UPDATE public.ext_records SET visibility = p_visibility WHERE id = p_record_id;
  PERFORM set_config('ext.allow_record_visibility', '', true);

  DELETE FROM public.ext_record_shares WHERE record_id = p_record_id AND user_id = ANY (v_removed);
  INSERT INTO public.ext_record_shares (record_id, user_id) SELECT p_record_id, x FROM unnest(v_added) x;

  INSERT INTO public.ext_record_events (record_id, channel_id, event_type, details, actor_id)
  VALUES (p_record_id, r.channel_id, 'visibility_changed', jsonb_build_object(
    'from', r.visibility, 'to', p_visibility, 'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)),
    auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.ext_set_record_visibility(UUID, TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_set_record_visibility(UUID, TEXT, UUID[]) TO authenticated, service_role;
