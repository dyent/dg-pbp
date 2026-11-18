-- Phase 2a step 4c follow-up: quick changes to current HP, WP and SAN.
--
-- The sheet's view mode has - / + buttons and a number box for the current
-- HP, WP and SAN. dg_set_pool changes just that one value, so it can't
-- overwrite other edits made to the sheet in the meantime. It runs with the
-- caller's rights: the sheet's access rules, validation (0-999) and change
-- log all apply exactly as for a full save.

CREATE FUNCTION public.dg_set_pool(p_character_id UUID, p_pool TEXT, p_value INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_pool IS NULL OR p_pool NOT IN ('hp', 'wp', 'san') THEN
    RAISE EXCEPTION 'Only HP, WP and SAN can be changed this way' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.dg_character_sheets
  SET data = data || jsonb_build_object(
        p_pool,
        CASE WHEN jsonb_typeof(data -> p_pool) = 'object' THEN data -> p_pool ELSE '{}'::jsonb END
          || jsonb_build_object('current', p_value)
      )
  WHERE character_id = p_character_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can''t change this sheet' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dg_set_pool(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dg_set_pool(UUID, TEXT, INTEGER) TO authenticated, service_role;
