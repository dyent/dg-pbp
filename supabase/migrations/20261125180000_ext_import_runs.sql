-- Import runs and suggestions (Phase 3 step 3, DECISIONS.md #48).
--
-- One run = one page range of one source, read by Claude. Its suggestions
-- (NPCs, records, links, handouts) wait here for the GM's review (step 3-4);
-- nothing touches the campaign itself.
--   * GM only, like sources. Runs and suggestions are written by the server
--     function (service role); the GM can only read them and delete a run.
--   * The pages the browser cut out of the PDF for a run are uploaded to the
--     'ext-sources' bucket as '<channel>/slice-<uuid>.pdf' and removed by the
--     server function when the run ends.

CREATE TABLE public.ext_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.ext_sources(id) ON DELETE CASCADE,
  first_page INTEGER NOT NULL CHECK (first_page >= 1),
  last_page INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  error TEXT CHECK (error IS NULL OR char_length(error) <= 500),
  model TEXT,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT ext_import_runs_range CHECK (last_page >= first_page AND last_page - first_page < 10)
);

CREATE INDEX ext_import_runs_source_idx ON public.ext_import_runs (source_id, created_at DESC);
CREATE INDEX ext_import_runs_running_idx ON public.ext_import_runs (channel_id) WHERE status = 'running';

CREATE TABLE public.ext_import_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ext_import_runs(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('npc', 'location', 'organisation', 'clue', 'operation', 'link', 'handout')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  page INTEGER CHECK (page IS NULL OR page >= 1),
  -- Description, fields, link ends, handout pages, possible duplicate (see logic.ts).
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ext_import_suggestions_run_idx ON public.ext_import_suggestions (run_id, sort_order);

ALTER TABLE public.ext_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_import_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GM reads import runs"
  ON public.ext_import_runs FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

CREATE POLICY "GM reads import suggestions"
  ON public.ext_import_suggestions FOR SELECT TO authenticated
  USING (is_channel_gm(channel_id));

REVOKE ALL ON public.ext_import_runs, public.ext_import_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ext_import_runs, public.ext_import_suggestions TO authenticated;
GRANT ALL ON public.ext_import_runs, public.ext_import_suggestions TO service_role;

-- GM: remove a run and its suggestions (not while it is still running, unless
-- it has been "running" for over 15 minutes, i.e. it stopped without saying so).
CREATE FUNCTION public.ext_delete_import_run(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.ext_import_runs%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.ext_import_runs WHERE id = p_run_id;
  IF r.id IS NULL OR NOT COALESCE(is_channel_gm(r.channel_id), false) THEN
    RAISE EXCEPTION 'Only the GM can manage imports' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = r.channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This campaign is archived' USING ERRCODE = 'P0001';
  END IF;
  IF r.status = 'running' AND r.created_at > NOW() - interval '15 minutes' THEN
    RAISE EXCEPTION 'This import is still running' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.ext_import_runs WHERE id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_delete_import_run(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_delete_import_run(UUID) TO authenticated, service_role;
