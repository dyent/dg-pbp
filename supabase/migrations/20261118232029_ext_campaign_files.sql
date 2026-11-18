-- Campaign files (Phase 2a step 4d, DECISIONS.md #29).
--
-- A per-campaign library of PDFs and images (handouts, case files, maps).
--   * Only the campaign's GM adds, replaces, edits and deletes files.
--   * Each file is visible to: the GM only ('gm'), every player ('players'),
--     or chosen players ('selected', listed in ext_campaign_file_shares).
--     Sharing is per player, not per character (owner decision 2026-11-19).
--   * Replacing a file keeps the earlier versions.
--   * Every add / replace / edit is logged in a GM-only history.
--
-- Files live in their own private bucket, 'ext-campaign-files', so upstream's
-- image rules and image clean-up never touch them. Object path:
-- '<channel_id>/<random uuid>.<ext>'. The browser uploads straight to Storage
-- (the insert policy checks GM-of-campaign), then registers the object with
-- ext_add_campaign_file / ext_replace_campaign_file, which read the type and
-- size from Storage's own metadata.
--
-- Known limit: deleting a whole campaign removes the file records (cascade) but
-- not the stored objects; nobody can read them afterwards (reads need a record).

-- ---------------------------------------------------------------------------
-- 1. Bucket (private; Storage itself enforces the size cap and the types)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ext-campaign-files',
  'ext-campaign-files',
  false,
  20971520, -- 20 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_campaign_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (title ~ '[^[:space:]]' AND char_length(title) <= 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  folder TEXT NOT NULL DEFAULT '' CHECK (char_length(folder) <= 60),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm', 'players', 'selected')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ext_campaign_files_channel_idx ON public.ext_campaign_files (channel_id, folder, title);

CREATE TABLE public.ext_campaign_file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.ext_campaign_files(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL CHECK (version_no >= 1),
  object_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, version_no)
);

CREATE TABLE public.ext_campaign_file_shares (
  file_id UUID NOT NULL REFERENCES public.ext_campaign_files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (file_id, user_id)
);

CREATE INDEX ext_campaign_file_shares_user_idx ON public.ext_campaign_file_shares (user_id);

CREATE TABLE public.ext_campaign_file_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.ext_campaign_files(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('added', 'replaced', 'edited')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ext_campaign_file_events_file_idx ON public.ext_campaign_file_events (file_id, created_at DESC);

ALTER TABLE public.ext_campaign_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_campaign_file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_campaign_file_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_campaign_file_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Access helpers (used by the policies below, so callers need EXECUTE)
-- ---------------------------------------------------------------------------

-- May the caller see this file (its record, versions and stored objects)?
CREATE FUNCTION public.ext_can_read_campaign_file(p_file_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT is_channel_gm(f.channel_id)
        OR (is_channel_member(f.channel_id) AND (
              f.visibility = 'players'
              OR (f.visibility = 'selected' AND EXISTS (
                    SELECT 1 FROM public.ext_campaign_file_shares s
                    WHERE s.file_id = f.id AND s.user_id = auth.uid()))))
    FROM public.ext_campaign_files f
    WHERE f.id = p_file_id
  ), false);
$$;

-- Campaign id from an object path '<channel uuid>/<name>', or NULL when the
-- path has another shape (never raises, unlike a bare ::uuid cast).
CREATE FUNCTION public.ext_campaign_file_path_channel(p_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    THEN split_part(p_name, '/', 1)::uuid
  END;
$$;

-- Stored object: readable by the campaign's GM (also before it is registered)
-- or by anyone who may read the file it belongs to.
CREATE FUNCTION public.ext_can_read_campaign_file_object(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(is_channel_gm(public.ext_campaign_file_path_channel(p_name)), false)
      OR EXISTS (
           SELECT 1 FROM public.ext_campaign_file_versions v
           WHERE v.object_path = p_name AND public.ext_can_read_campaign_file(v.file_id));
$$;

-- Stored object: uploadable / removable by the GM of a campaign that isn't archived.
CREATE FUNCTION public.ext_can_write_campaign_file_object(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels ch
    WHERE ch.id = public.ext_campaign_file_path_channel(p_name)
      AND NOT ch.is_archived
      AND is_channel_gm(ch.id)
  );
$$;

REVOKE ALL ON FUNCTION public.ext_can_read_campaign_file(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_campaign_file_path_channel(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_can_read_campaign_file_object(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_can_write_campaign_file_object(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_can_read_campaign_file(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_campaign_file_path_channel(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_can_read_campaign_file_object(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_can_write_campaign_file_object(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Row-level security: reads only (all writes go through the functions below)
-- ---------------------------------------------------------------------------

CREATE POLICY "Campaign files are readable per their visibility"
  ON public.ext_campaign_files FOR SELECT TO authenticated
  USING (public.ext_can_read_campaign_file(id));

CREATE POLICY "File versions are readable with their file"
  ON public.ext_campaign_file_versions FOR SELECT TO authenticated
  USING (public.ext_can_read_campaign_file(file_id));

CREATE POLICY "File shares are readable by the GM"
  ON public.ext_campaign_file_shares FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ext_campaign_files f
    WHERE f.id = file_id AND is_channel_gm(f.channel_id)));

CREATE POLICY "File history is readable by the GM"
  ON public.ext_campaign_file_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ext_campaign_files f
    WHERE f.id = file_id AND is_channel_gm(f.channel_id)));

REVOKE ALL ON public.ext_campaign_files, public.ext_campaign_file_versions,
  public.ext_campaign_file_shares, public.ext_campaign_file_events FROM anon;
GRANT SELECT ON public.ext_campaign_files, public.ext_campaign_file_versions,
  public.ext_campaign_file_shares, public.ext_campaign_file_events TO authenticated;
GRANT ALL ON public.ext_campaign_files, public.ext_campaign_file_versions,
  public.ext_campaign_file_shares, public.ext_campaign_file_events TO service_role;

-- Storage policies for the new bucket (no UPDATE policy: objects are never
-- overwritten; a replacement is a new object).
CREATE POLICY "ext_campaign_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ext-campaign-files' AND public.ext_can_read_campaign_file_object(name));

CREATE POLICY "ext_campaign_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ext-campaign-files' AND public.ext_can_write_campaign_file_object(name));

CREATE POLICY "ext_campaign_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ext-campaign-files' AND public.ext_can_write_campaign_file_object(name));

-- ---------------------------------------------------------------------------
-- 5. Internal helpers (no API grants)
-- ---------------------------------------------------------------------------

-- Raise unless the caller is the GM of this campaign and it isn't archived.
CREATE FUNCTION public.ext__require_files_gm(p_channel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(is_channel_gm(p_channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can manage campaign files' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Check an uploaded object before it is registered; returns its type and size
-- as Storage recorded them.
CREATE FUNCTION public.ext__check_campaign_file_object(p_channel_id UUID, p_path TEXT, OUT mime_type TEXT, OUT size_bytes BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ext_campaign_file_path_channel(p_path) IS DISTINCT FROM p_channel_id THEN
    RAISE EXCEPTION 'The uploaded file is not in this campaign''s storage' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(o.metadata->>'mimetype', ''), COALESCE((o.metadata->>'size')::bigint, 0)
    INTO mime_type, size_bytes
    FROM storage.objects o
    WHERE o.bucket_id = 'ext-campaign-files' AND o.name = p_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The uploaded file could not be found' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ext_campaign_file_versions WHERE object_path = p_path) THEN
    RAISE EXCEPTION 'That upload is already in use' USING ERRCODE = 'P0001';
  END IF;
  IF mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif') THEN
    RAISE EXCEPTION 'Only PDF and image files (JPG, PNG, WebP, GIF) can be added' USING ERRCODE = 'P0001';
  END IF;
  IF size_bytes > 20971520 THEN
    RAISE EXCEPTION 'Files can be at most 20 MB' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Validate the players a 'selected' file is shared with: current, unblocked
-- players of the campaign (not the GM). Returns the de-duplicated list.
CREATE FUNCTION public.ext__check_file_players(p_channel_id UUID, p_visibility TEXT, p_player_ids UUID[])
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  IF p_visibility <> 'selected' THEN
    RETURN '{}'::uuid[];
  END IF;
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(COALESCE(p_player_ids, '{}')) x;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one player to share the file with' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.channel_members m
      JOIN public.channels ch ON ch.id = m.channel_id
      WHERE m.channel_id = p_channel_id AND m.user_id = x
        AND NOT m.is_blocked AND m.user_id IS DISTINCT FROM ch.gm_id)
  ) THEN
    RAISE EXCEPTION 'Files can only be shared with players in this campaign' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.ext__require_files_gm(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__check_campaign_file_object(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ext__check_file_players(UUID, TEXT, UUID[]) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. GM functions
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_add_campaign_file(
  p_channel_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_folder TEXT,
  p_visibility TEXT,
  p_player_ids UUID[],
  p_object_path TEXT,
  p_file_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obj RECORD;
  v_players UUID[];
  v_file_id UUID;
BEGIN
  PERFORM public.ext__require_files_gm(p_channel_id);
  SELECT * INTO v_obj FROM public.ext__check_campaign_file_object(p_channel_id, p_object_path);
  v_players := public.ext__check_file_players(p_channel_id, p_visibility, p_player_ids);

  INSERT INTO public.ext_campaign_files (channel_id, title, description, folder, visibility, created_by)
  VALUES (p_channel_id, btrim(p_title), COALESCE(btrim(p_description), ''), COALESCE(btrim(p_folder), ''),
          p_visibility, auth.uid())
  RETURNING id INTO v_file_id;

  INSERT INTO public.ext_campaign_file_versions (file_id, version_no, object_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (v_file_id, 1, p_object_path, left(btrim(p_file_name), 200), v_obj.mime_type, v_obj.size_bytes, auth.uid());

  INSERT INTO public.ext_campaign_file_shares (file_id, user_id)
  SELECT v_file_id, x FROM unnest(v_players) x;

  INSERT INTO public.ext_campaign_file_events (file_id, actor_id, kind, details)
  VALUES (v_file_id, auth.uid(), 'added', jsonb_build_object(
    'file_name', left(btrim(p_file_name), 200),
    'visibility', p_visibility,
    'players', to_jsonb(v_players)));

  RETURN v_file_id;
END;
$$;

CREATE FUNCTION public.ext_replace_campaign_file(p_file_id UUID, p_object_path TEXT, p_file_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id UUID;
  v_obj RECORD;
  v_version INTEGER;
BEGIN
  SELECT channel_id INTO v_channel_id FROM public.ext_campaign_files WHERE id = p_file_id FOR UPDATE;
  IF v_channel_id IS NULL THEN
    RAISE EXCEPTION 'Only the GM can manage campaign files' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ext__require_files_gm(v_channel_id);
  SELECT * INTO v_obj FROM public.ext__check_campaign_file_object(v_channel_id, p_object_path);

  SELECT COALESCE(max(version_no), 0) + 1 INTO v_version
    FROM public.ext_campaign_file_versions WHERE file_id = p_file_id;

  INSERT INTO public.ext_campaign_file_versions (file_id, version_no, object_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (p_file_id, v_version, p_object_path, left(btrim(p_file_name), 200), v_obj.mime_type, v_obj.size_bytes, auth.uid());

  UPDATE public.ext_campaign_files SET updated_at = NOW() WHERE id = p_file_id;

  INSERT INTO public.ext_campaign_file_events (file_id, actor_id, kind, details)
  VALUES (p_file_id, auth.uid(), 'replaced', jsonb_build_object(
    'file_name', left(btrim(p_file_name), 200), 'version', v_version));

  RETURN v_version;
END;
$$;

-- Change title, description, folder, visibility and the chosen players. Logs
-- one 'edited' event listing what changed (nothing is logged if nothing did).
CREATE FUNCTION public.ext_update_campaign_file(
  p_file_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_folder TEXT,
  p_visibility TEXT,
  p_player_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.ext_campaign_files%ROWTYPE;
  v_players UUID[];
  v_old_players UUID[];
  v_changes JSONB := '[]'::jsonb;
  v_added UUID[];
  v_removed UUID[];
  v_title TEXT := btrim(p_title);
  v_description TEXT := COALESCE(btrim(p_description), '');
  v_folder TEXT := COALESCE(btrim(p_folder), '');
BEGIN
  SELECT * INTO f FROM public.ext_campaign_files WHERE id = p_file_id FOR UPDATE;
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'Only the GM can manage campaign files' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ext__require_files_gm(f.channel_id);
  v_players := public.ext__check_file_players(f.channel_id, p_visibility, p_player_ids);

  SELECT COALESCE(array_agg(user_id), '{}') INTO v_old_players
    FROM public.ext_campaign_file_shares WHERE file_id = p_file_id;

  IF v_title IS DISTINCT FROM f.title THEN
    v_changes := v_changes || jsonb_build_object('field', 'title', 'from', f.title, 'to', v_title);
  END IF;
  IF v_description IS DISTINCT FROM f.description THEN
    v_changes := v_changes || jsonb_build_object('field', 'description', 'from', f.description, 'to', v_description);
  END IF;
  IF v_folder IS DISTINCT FROM f.folder THEN
    v_changes := v_changes || jsonb_build_object('field', 'folder', 'from', f.folder, 'to', v_folder);
  END IF;
  IF p_visibility IS DISTINCT FROM f.visibility THEN
    v_changes := v_changes || jsonb_build_object('field', 'visibility', 'from', f.visibility, 'to', p_visibility);
  END IF;

  SELECT COALESCE(array_agg(x), '{}') INTO v_added FROM unnest(v_players) x WHERE x <> ALL (v_old_players);
  SELECT COALESCE(array_agg(x), '{}') INTO v_removed FROM unnest(v_old_players) x WHERE x <> ALL (v_players);

  IF jsonb_array_length(v_changes) = 0 AND cardinality(v_added) = 0 AND cardinality(v_removed) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.ext_campaign_files
     SET title = v_title, description = v_description, folder = v_folder,
         visibility = p_visibility, updated_at = NOW()
   WHERE id = p_file_id;

  DELETE FROM public.ext_campaign_file_shares WHERE file_id = p_file_id AND user_id = ANY (v_removed);
  INSERT INTO public.ext_campaign_file_shares (file_id, user_id)
  SELECT p_file_id, x FROM unnest(v_added) x;

  INSERT INTO public.ext_campaign_file_events (file_id, actor_id, kind, details)
  VALUES (p_file_id, auth.uid(), 'edited', jsonb_build_object(
    'changes', v_changes, 'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)));
END;
$$;

-- Delete a file with all its versions and history. Returns the stored object
-- paths so the app can remove them from Storage (direct deletes from the
-- storage tables aren't allowed; the delete policy above lets the GM do it).
CREATE FUNCTION public.ext_delete_campaign_file(p_file_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id UUID;
  v_paths TEXT[];
BEGIN
  SELECT channel_id INTO v_channel_id FROM public.ext_campaign_files WHERE id = p_file_id FOR UPDATE;
  IF v_channel_id IS NULL THEN
    RAISE EXCEPTION 'Only the GM can manage campaign files' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ext__require_files_gm(v_channel_id);

  SELECT COALESCE(array_agg(object_path), '{}') INTO v_paths
    FROM public.ext_campaign_file_versions WHERE file_id = p_file_id;
  DELETE FROM public.ext_campaign_files WHERE id = p_file_id;
  RETURN v_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_add_campaign_file(UUID, TEXT, TEXT, TEXT, TEXT, UUID[], TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_replace_campaign_file(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_update_campaign_file(UUID, TEXT, TEXT, TEXT, TEXT, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_delete_campaign_file(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_add_campaign_file(UUID, TEXT, TEXT, TEXT, TEXT, UUID[], TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_replace_campaign_file(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_update_campaign_file(UUID, TEXT, TEXT, TEXT, TEXT, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_delete_campaign_file(UUID) TO authenticated, service_role;
