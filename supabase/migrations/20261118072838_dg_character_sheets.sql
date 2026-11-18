-- Phase 2a step 4c: Delta Green character sheets (PCs) and stat blocks (NPCs).
--
-- One sheet per character, stored as JSON (the shape is defined by the app in
-- src/features/dg/sheet/sheetModel.ts). The database:
--   * enforces who may read and write (a PC's sheet is Owner-level: the player
--     and the GM, and the whole table once the PC is out of play; an NPC's stat
--     block is GM-only);
--   * validates the document (size, numbers 0-999, text lengths);
--   * calculates the derived attributes (dg_derived_attributes, exposed through
--     the dg_get_sheet read function): rules maths is code, never AI;
--   * logs every change for the GM as one history entry listing what changed.
-- See docs/delta-green/05-dg-sheet.md and PERMISSIONS.md.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.dg_character_sheets (
  character_id UUID PRIMARY KEY REFERENCES public.ext_characters(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  -- Room for other game systems later; only Delta Green today.
  system TEXT NOT NULL DEFAULT 'delta_green' CHECK (system = 'delta_green'),
  data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX dg_character_sheets_channel_idx ON public.dg_character_sheets (channel_id);

ALTER TABLE public.dg_character_sheets ENABLE ROW LEVEL SECURITY;

-- Sheet changes are logged in the character history.
ALTER TABLE public.ext_character_events
  DROP CONSTRAINT ext_character_events_event_type_check,
  ADD CONSTRAINT ext_character_events_event_type_check CHECK (event_type IN (
    'created', 'renamed', 'status_changed', 'revealed', 'hidden',
    'field_visibility_changed', 'note',
    'given', 'taken', 'posting_started', 'posting_ended', 'converted_to_npc',
    'role_changed', 'field_edited', 'sheet_edited'
  ));

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (no API access)
-- ---------------------------------------------------------------------------

-- Every scalar in a JSON document with its dotted path ("stats.pow.score",
-- "bonds.0.name"). Used for validation and for the change log.
CREATE FUNCTION public.dg__flatten(p_doc JSONB)
RETURNS TABLE (path TEXT, kind TEXT, value TEXT)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH RECURSIVE t(path, v) AS (
    SELECT ''::text, p_doc
    UNION ALL
    SELECT CASE WHEN t.path = '' THEN e.key ELSE t.path || '.' || e.key END, e.value
    FROM t
    CROSS JOIN LATERAL (
      SELECT o.key, o.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(t.v) = 'object' THEN t.v ELSE '{}'::jsonb END) AS o(key, value)
      UNION ALL
      SELECT (a.ord - 1)::text, a.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.v) = 'array' THEN t.v ELSE '[]'::jsonb END)
           WITH ORDINALITY AS a(value, ord)
    ) AS e
  )
  SELECT t.path, jsonb_typeof(t.v), t.v #>> '{}'
  FROM t
  WHERE jsonb_typeof(t.v) NOT IN ('object', 'array');
$$;

-- A JSON number as an integer (rounded down), or NULL for anything else.
CREATE FUNCTION public.dg_json_int(p_value JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'number' AND abs((p_value #>> '{}')::numeric) < 100000
              THEN floor((p_value #>> '{}')::numeric)::integer END;
$$;

REVOKE ALL ON FUNCTION public.dg__flatten(JSONB) FROM PUBLIC, anon, authenticated, service_role;
-- Pure helper used by dg_get_sheet (runs as the caller), so it is callable.
REVOKE ALL ON FUNCTION public.dg_json_int(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dg_json_int(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Rules maths (Delta Green Agent's Handbook): public, pure functions
-- ---------------------------------------------------------------------------

-- Derived attributes from the statistics. NULL where an input is missing.
--   HP max = (STR + CON) / 2, rounded up
--   WP max = POW
--   SAN at creation = POW x 5; SAN max = 99 - Unnatural skill
--   Breaking Point at creation = SAN - POW (= POW x 4)
CREATE FUNCTION public.dg_derived_attributes(p_str INTEGER, p_con INTEGER, p_pow INTEGER, p_unnatural INTEGER)
RETURNS TABLE (hp_max INTEGER, wp_max INTEGER, san_start INTEGER, san_max INTEGER, breaking_point_start INTEGER)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE WHEN p_str IS NOT NULL AND p_con IS NOT NULL THEN ceil((p_str + p_con) / 2.0)::integer END,
    p_pow,
    p_pow * 5,
    99 - COALESCE(p_unnatural, 0),
    p_pow * 4;
$$;

-- New Breaking Point once the current one is reached: current SAN - POW.
CREATE FUNCTION public.dg_breaking_point(p_san INTEGER, p_pow INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(p_san - p_pow, 0);
$$;

REVOKE ALL ON FUNCTION public.dg_derived_attributes(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dg_breaking_point(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dg_derived_attributes(INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dg_breaking_point(INTEGER, INTEGER) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Access helpers (SECURITY DEFINER: players cannot read ext_characters)
-- ---------------------------------------------------------------------------

-- PC sheet: Owner-level (see ext_can_read_entry). NPC stat block: GM only.
CREATE FUNCTION public.dg_can_read_sheet(p_character_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN c.kind = 'pc'
                THEN public.ext_can_read_entry(c.id, 'owner', false)
                ELSE is_channel_gm(c.channel_id) END
    FROM public.ext_characters c
    WHERE c.id = p_character_id
  ), false);
$$;

-- PC sheet: the GM, or the owner while the PC is in play. NPC: GM only.
-- Never in an archived campaign.
CREATE FUNCTION public.dg_can_edit_sheet(p_character_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN c.kind = 'pc'
                THEN public.ext_can_edit_character(c.id)
                ELSE is_channel_gm(c.channel_id) AND NOT ch.is_archived END
    FROM public.ext_characters c
    JOIN public.channels ch ON ch.id = c.channel_id
    WHERE c.id = p_character_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.dg_can_read_sheet(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dg_can_edit_sheet(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dg_can_read_sheet(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dg_can_edit_sheet(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Policies and grants
-- ---------------------------------------------------------------------------

CREATE POLICY "Sheets are readable per character access"
  ON public.dg_character_sheets FOR SELECT
  USING (dg_can_read_sheet(character_id));

CREATE POLICY "Editors create sheets"
  ON public.dg_character_sheets FOR INSERT
  WITH CHECK (dg_can_edit_sheet(character_id));

CREATE POLICY "Editors update sheets"
  ON public.dg_character_sheets FOR UPDATE
  USING (dg_can_edit_sheet(character_id))
  WITH CHECK (dg_can_edit_sheet(character_id));

CREATE POLICY "GM removes sheets"
  ON public.dg_character_sheets FOR DELETE
  USING (
    is_channel_gm(channel_id)
    AND NOT EXISTS (SELECT 1 FROM public.channels ch WHERE ch.id = channel_id AND ch.is_archived)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dg_character_sheets TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Triggers: validation, bookkeeping, change log
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.dg_character_sheets_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bad TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.channel_id INTO NEW.channel_id FROM public.ext_characters c WHERE c.id = NEW.character_id;
    IF NEW.channel_id IS NULL THEN
      RAISE EXCEPTION 'Unknown character' USING ERRCODE = 'P0001';
    END IF;
    NEW.created_at := NOW();
  ELSE
    IF NEW.character_id IS DISTINCT FROM OLD.character_id OR NEW.channel_id IS DISTINCT FROM OLD.channel_id THEN
      RAISE EXCEPTION 'A sheet cannot move to another character' USING ERRCODE = 'P0001';
    END IF;
    NEW.created_at := OLD.created_at;
  END IF;

  IF octet_length(NEW.data::text) > 100000 THEN
    RAISE EXCEPTION 'The sheet is too large' USING ERRCODE = 'P0001';
  END IF;

  SELECT f.path INTO v_bad FROM public.dg__flatten(NEW.data) f
  WHERE f.kind = 'number' AND (f.value::numeric < 0 OR f.value::numeric > 999)
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Numbers on the sheet must be between 0 and 999 (%)', v_bad USING ERRCODE = 'P0001';
  END IF;

  SELECT f.path INTO v_bad FROM public.dg__flatten(NEW.data) f
  WHERE f.kind = 'string' AND char_length(f.value) > 4000
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Text on the sheet is too long (%; 4000 characters maximum)', v_bad USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER dg_character_sheets_guard
  BEFORE INSERT OR UPDATE ON public.dg_character_sheets
  FOR EACH ROW EXECUTE FUNCTION public.dg_character_sheets_guard();

-- One GM-only history entry per save: created / removed, or the list of
-- changed values (path, from, to), at most 60 of them.
CREATE FUNCTION public.dg_character_sheets_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes JSONB;
  v_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.ext_characters WHERE id = OLD.character_id) THEN
      INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
      VALUES (OLD.character_id, OLD.channel_id, 'sheet_edited', jsonb_build_object('action', 'removed'), 'gm', auth.uid());
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
    VALUES (NEW.character_id, NEW.channel_id, 'sheet_edited', jsonb_build_object('action', 'created'), 'gm', auth.uid());
    RETURN NULL;
  END IF;

  IF NEW.data = OLD.data THEN
    RETURN NULL;
  END IF;

  WITH a AS (SELECT path, value FROM public.dg__flatten(OLD.data)),
       b AS (SELECT path, value FROM public.dg__flatten(NEW.data)),
       d AS (
         SELECT COALESCE(a.path, b.path) AS path, a.value AS old_value, b.value AS new_value
         FROM a FULL OUTER JOIN b ON a.path = b.path
         WHERE a.value IS DISTINCT FROM b.value
       )
  SELECT count(*),
         COALESCE(jsonb_agg(jsonb_build_object('path', path, 'from', LEFT(old_value, 300), 'to', LEFT(new_value, 300))
                            ORDER BY path) FILTER (WHERE rn <= 60), '[]'::jsonb)
  INTO v_count, v_changes
  FROM (SELECT d.*, row_number() OVER (ORDER BY d.path) AS rn FROM d) numbered;

  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ext_character_events (character_id, channel_id, event_type, details, visibility, actor_id)
  VALUES (NEW.character_id, NEW.channel_id, 'sheet_edited',
          jsonb_build_object('action', 'edited', 'changes', v_changes, 'total', v_count),
          'gm', auth.uid());
  RETURN NULL;
END;
$$;

CREATE TRIGGER dg_character_sheets_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.dg_character_sheets
  FOR EACH ROW EXECUTE FUNCTION public.dg_character_sheets_after_change();

REVOKE ALL ON FUNCTION public.dg_character_sheets_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dg_character_sheets_after_change() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Read function with the calculated values
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER (the default): the caller's row-level security on the table
-- applies, so this returns no row for a sheet the caller may not read. (A
-- function rather than a view: a view would change the generated client types
-- that upstream's tests rely on.)
CREATE FUNCTION public.dg_get_sheet(p_character_id UUID)
RETURNS TABLE (
  character_id UUID,
  data JSONB,
  updated_at TIMESTAMPTZ,
  updated_by UUID,
  hp_max_calc INTEGER,
  wp_max_calc INTEGER,
  san_start_calc INTEGER,
  san_max_calc INTEGER,
  breaking_point_start_calc INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.character_id, s.data, s.updated_at, s.updated_by,
         d.hp_max, d.wp_max, d.san_start, d.san_max, d.breaking_point_start
  FROM public.dg_character_sheets s
  CROSS JOIN LATERAL public.dg_derived_attributes(
    public.dg_json_int(s.data #> '{stats,str,score}'),
    public.dg_json_int(s.data #> '{stats,con,score}'),
    public.dg_json_int(s.data #> '{stats,pow,score}'),
    public.dg_json_int(s.data #> '{skills,unnatural,value}')
  ) AS d
  WHERE s.character_id = p_character_id;
$$;

REVOKE ALL ON FUNCTION public.dg_get_sheet(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dg_get_sheet(UUID) TO authenticated, service_role;
