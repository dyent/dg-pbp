-- AI plumbing (Phase 3 step 2, DECISIONS.md #47): who may use AI, the monthly
-- spending cap and the usage log.
--
--   * AI costs the server owner money, so only the **server admin** (upstream's
--     profiles.server_admin) may use it, and only in campaigns they GM. Other
--     GMs on the same server never trigger a paid call.
--   * One monthly cap for the whole server (default $5, in US dollars), set by
--     the server admin. The server function checks it before every call.
--   * Every call is logged by the server function (service role): feature,
--     model, tokens, estimated cost, outcome. Only the server admin reads it.
--   * The Anthropic API key is never in the database; it is a server secret.

-- ---------------------------------------------------------------------------
-- 1. Settings (one row)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_ai_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  monthly_cap_usd NUMERIC(8, 2) NOT NULL DEFAULT 5 CHECK (monthly_cap_usd BETWEEN 0 AND 1000),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ext_ai_settings (id) VALUES (true);

ALTER TABLE public.ext_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server admin reads AI settings"
  ON public.ext_ai_settings FOR SELECT TO authenticated
  USING (public.is_server_admin());

REVOKE ALL ON public.ext_ai_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ext_ai_settings TO authenticated;
GRANT ALL ON public.ext_ai_settings TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Usage log
-- ---------------------------------------------------------------------------

CREATE TABLE public.ext_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  feature TEXT NOT NULL CHECK (feature IN ('connection_test', 'import')),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 100),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'error', 'refused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ext_ai_usage_created_idx ON public.ext_ai_usage (created_at DESC);

ALTER TABLE public.ext_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server admin reads AI usage"
  ON public.ext_ai_usage FOR SELECT TO authenticated
  USING (public.is_server_admin());

-- Written only by the server function (service role).
REVOKE ALL ON public.ext_ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ext_ai_usage TO authenticated;
GRANT ALL ON public.ext_ai_usage TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------------------------

-- Spending this calendar month (UTC), in US dollars.
CREATE FUNCTION public.ext__ai_month_spent()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(cost_usd), 0)
  FROM public.ext_ai_usage
  WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
$$;

REVOKE ALL ON FUNCTION public.ext__ai_month_spent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ext__ai_month_spent() TO service_role;

-- For the app: may the caller use AI in this campaign, and how much has been
-- spent this month against the cap. Non-admins learn only "not allowed".
CREATE FUNCTION public.ext_ai_status(p_channel_id UUID)
RETURNS TABLE (allowed BOOLEAN, is_server_admin BOOLEAN, month_spent_usd NUMERIC, monthly_cap_usd NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_admin BOOLEAN := public.is_server_admin();
BEGIN
  IF NOT v_admin THEN
    RETURN QUERY SELECT false, false, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT COALESCE(is_channel_gm(p_channel_id), false), true, public.ext__ai_month_spent(), s.monthly_cap_usd
  FROM public.ext_ai_settings s;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_ai_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_ai_status(UUID) TO authenticated, service_role;

-- Server admin only: change the monthly cap.
CREATE FUNCTION public.ext_set_ai_cap(p_cap_usd NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_server_admin() THEN
    RAISE EXCEPTION 'Only the server admin can change the AI spending cap' USING ERRCODE = '42501';
  END IF;
  IF p_cap_usd IS NULL OR p_cap_usd < 0 OR p_cap_usd > 1000 THEN
    RAISE EXCEPTION 'The cap must be between $0 and $1,000 a month' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.ext_ai_settings SET monthly_cap_usd = round(p_cap_usd, 2), updated_by = auth.uid(), updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.ext_set_ai_cap(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_set_ai_cap(NUMERIC) TO authenticated, service_role;
