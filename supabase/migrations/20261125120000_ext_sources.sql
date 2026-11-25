-- Source library (Phase 3 step 1, DECISIONS.md #46).
--
-- The published adventures a campaign is built from, kept for the GM only.
--   * Only the campaign's GM can see, add, rename or delete a source, or open
--     the stored PDF. Players and outsiders get nothing, not even the titles:
--     source text is copyrighted and full of spoilers (00-repository-
--     assessment.md §3.7). There is deliberately no sharing setting.
--   * PDFs live in their own private bucket, 'ext-sources' (50 MB, PDF only),
--     never in campaign files, so they can't be shared by mistake. Object
--     path: '<channel_id>/<random uuid>.pdf'. The browser uploads straight to
--     Storage (the insert policy checks GM-of-campaign), then registers the
--     object with ext_add_source, which reads the type and size from Storage.
--   * Not in archived campaigns (except reading).
--
-- Known limit: deleting a whole campaign removes the source rows (cascade) but
-- not the stored objects; only that campaign's GM could still read them.

-- ---------------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ext-sources', 'ext-sources', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 120),
  object_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ext_sources_channel_idx ON public.ext_sources (channel_id, title);

ALTER TABLE public.ext_sources ENABLE ROW LEVEL SECURITY;

-- Reads only; every write goes through the functions below.
CREATE POLICY "GM reads the campaign's sources"
  ON public.ext_sources FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

REVOKE ALL ON public.ext_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ext_sources TO authenticated;
GRANT ALL ON public.ext_sources TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Storage: the campaign's GM only (reading also in archived campaigns)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext_can_write_source_object(p_name TEXT)
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

-- Storage policies run as the caller, so this needs EXECUTE (hence one underscore).
REVOKE ALL ON FUNCTION public.ext_can_write_source_object(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_can_write_source_object(TEXT) TO authenticated, service_role;

CREATE POLICY "ext_sources_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ext-sources'
         AND COALESCE(is_channel_gm(public.ext_campaign_file_path_channel(name)), false));

CREATE POLICY "ext_sources_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ext-sources' AND public.ext_can_write_source_object(name));

CREATE POLICY "ext_sources_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ext-sources' AND public.ext_can_write_source_object(name));

-- ---------------------------------------------------------------------------
-- 4. GM functions
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.ext__require_sources_gm(p_channel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_channel_id IS NULL OR NOT COALESCE(is_channel_gm(p_channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can manage sources' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ext__require_sources_gm(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Register an uploaded PDF as a source; returns its id.
CREATE FUNCTION public.ext_add_source(p_channel_id UUID, p_title TEXT, p_object_path TEXT, p_file_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mime TEXT;
  v_size BIGINT;
  v_id UUID;
BEGIN
  PERFORM public.ext__require_sources_gm(p_channel_id);
  IF public.ext_campaign_file_path_channel(p_object_path) IS DISTINCT FROM p_channel_id THEN
    RAISE EXCEPTION 'The uploaded file is not in this campaign''s storage' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(o.metadata->>'mimetype', ''), COALESCE((o.metadata->>'size')::bigint, 0)
    INTO v_mime, v_size
    FROM storage.objects o
    WHERE o.bucket_id = 'ext-sources' AND o.name = p_object_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The uploaded file could not be found' USING ERRCODE = 'P0001';
  END IF;
  IF v_mime <> 'application/pdf' THEN
    RAISE EXCEPTION 'Sources must be PDF files' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ext_sources WHERE object_path = p_object_path) THEN
    RAISE EXCEPTION 'That upload is already in use' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ext_sources (channel_id, title, object_path, file_name, size_bytes, created_by)
  VALUES (p_channel_id, btrim(p_title), p_object_path, left(btrim(p_file_name), 200), v_size, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.ext_rename_source(p_source_id UUID, p_title TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ext__require_sources_gm((SELECT channel_id FROM public.ext_sources WHERE id = p_source_id));
  UPDATE public.ext_sources SET title = btrim(p_title), updated_at = NOW() WHERE id = p_source_id;
END;
$$;

-- Removes the source and returns its object path; the app then removes the
-- stored PDF (the delete policy above allows the GM).
CREATE FUNCTION public.ext_delete_source(p_source_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path TEXT;
BEGIN
  PERFORM public.ext__require_sources_gm((SELECT channel_id FROM public.ext_sources WHERE id = p_source_id));
  DELETE FROM public.ext_sources WHERE id = p_source_id RETURNING object_path INTO v_path;
  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_add_source(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_rename_source(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ext_delete_source(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_add_source(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_rename_source(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ext_delete_source(UUID) TO authenticated, service_role;
