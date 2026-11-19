-- Phase 2a step 5a follow-up: one active character per player (DECISIONS.md #33).
--
-- Refines the Reserve rules of 20261118100838_ext_character_reserve.sql:
--   * a player has at most ONE active PC per campaign (was 3). Making another
--     PC active moves the previous one to Backup automatically;
--   * at most THREE reserve PCs per player. Reserve = in play with status
--     Backup, Temporarily unavailable, Incapacitated (e.g. in hospital or an
--     institution) or Missing. Insane, Retired and Deceased count toward
--     nothing;
--   * a player posts as their active PC. With no active PC they post as
--     themselves (account name) until one is made active again; the app shows
--     them a reminder. Posting follows every role and status change.
--
-- Existing data: a player with several active PCs keeps the one they are
-- posting as (else the most recently changed) active; the others become Backup.

CREATE FUNCTION public.ext_is_reserve_status(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_status IN ('backup', 'unavailable', 'incapacitated', 'missing'), false);
$$;

REVOKE ALL ON FUNCTION public.ext_is_reserve_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ext_is_reserve_status(TEXT) TO authenticated, service_role;

-- Post as the player's active in-play PC, or as the player when there is none.
-- The very first posting period is backdated to when the player joined, so
-- their earlier posts are labelled too.
CREATE OR REPLACE FUNCTION public.ext__refresh_posting(p_channel_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current UUID;
  v_next UUID;
  v_start TIMESTAMPTZ := NOW();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  SELECT pp.character_id INTO v_current
  FROM public.ext_posting_periods pp
  WHERE pp.channel_id = p_channel_id AND pp.user_id = p_user_id AND pp.ended_at IS NULL;

  SELECT c.id INTO v_next
  FROM public.ext_characters c
  WHERE c.channel_id = p_channel_id AND c.kind = 'pc' AND c.in_play
    AND c.owner_id = p_user_id AND c.status = 'active'
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF v_current IS NOT DISTINCT FROM v_next THEN
    RETURN; -- already right (including "posting as the player")
  END IF;

  IF v_next IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ext_posting_periods
    WHERE channel_id = p_channel_id AND user_id = p_user_id
  ) THEN
    SELECT LEAST(joined_at, NOW()) INTO v_start FROM public.channel_members
    WHERE channel_id = p_channel_id AND user_id = p_user_id;
  END IF;

  PERFORM public.ext__set_posting(p_channel_id, p_user_id, v_next, COALESCE(v_start, NOW()));
END;
$$;

REVOKE ALL ON FUNCTION public.ext__refresh_posting(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Replaces the step 4c rules (limit of 3 active).
CREATE OR REPLACE FUNCTION public.ext_characters_active_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owned BOOLEAN := NEW.kind = 'pc' AND NEW.in_play AND NEW.owner_id IS NOT NULL;
BEGIN
  IF v_owned THEN
    -- Lock the player's membership row so concurrent changes cannot break the limits.
    PERFORM 1 FROM public.channel_members
    WHERE channel_id = NEW.channel_id AND user_id = NEW.owner_id
    FOR UPDATE;

    -- One active PC: the previous one steps back to Backup.
    IF NEW.status = 'active' THEN
      UPDATE public.ext_characters
      SET status = 'backup'
      WHERE channel_id = NEW.channel_id AND kind = 'pc' AND in_play
        AND owner_id = NEW.owner_id AND status = 'active' AND id <> NEW.id;
    END IF;

    IF public.ext_is_reserve_status(NEW.status) AND (
      SELECT count(*) FROM public.ext_characters
      WHERE channel_id = NEW.channel_id AND kind = 'pc' AND in_play
        AND owner_id = NEW.owner_id AND public.ext_is_reserve_status(status)
    ) > 3 THEN
      RAISE EXCEPTION 'A player can have at most 3 reserve characters; retire one first'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.ext__refresh_posting(NEW.channel_id, NEW.owner_id);
  END IF;

  -- The previous player may have been posting as this character.
  IF TG_OP = 'UPDATE' AND OLD.owner_id IS NOT NULL
     AND (OLD.owner_id IS DISTINCT FROM NEW.owner_id OR NOT v_owned) THEN
    PERFORM public.ext__refresh_posting(OLD.channel_id, OLD.owner_id);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ext_characters_active_rules() FROM PUBLIC, anon, authenticated, service_role;

-- Existing data: keep one active PC per player.
WITH ranked AS (
  SELECT c.id,
         row_number() OVER (
           PARTITION BY c.channel_id, c.owner_id
           ORDER BY (pp.id IS NOT NULL) DESC, c.updated_at DESC
         ) AS rn
  FROM public.ext_characters c
  LEFT JOIN public.ext_posting_periods pp
    ON pp.character_id = c.id AND pp.user_id = c.owner_id AND pp.ended_at IS NULL
  WHERE c.kind = 'pc' AND c.in_play AND c.owner_id IS NOT NULL AND c.status = 'active'
)
UPDATE public.ext_characters c
SET status = 'backup'
FROM ranked r
WHERE r.id = c.id AND r.rn > 1;
