-- Durable, distributed daily cap for paid Apollo.io API calls.
--
-- Previously the cap lived in a per-Worker-isolate in-memory counter, so on
-- Cloudflare Workers (many isolates, frequent eviction) the effective cap was
-- N x cap and reset on every redeploy. This table + atomic RPC make the cap a
-- single source of truth that survives isolate churn and deploys.

CREATE TABLE IF NOT EXISTS public.apollo_usage (
  day   date PRIMARY KEY,
  count integer NOT NULL DEFAULT 0
);

-- Only the service role (which bypasses RLS) ever touches this table; enabling
-- RLS with no policies denies all anon/authenticated access by default.
ALTER TABLE public.apollo_usage ENABLE ROW LEVEL SECURITY;

-- Atomically record one Apollo call against today's counter, enforcing p_cap.
-- Returns TRUE when the call is within the cap (and was counted), FALSE when the
-- cap is already reached (nothing counted).
CREATE OR REPLACE FUNCTION public.consume_apollo_call(p_cap integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.apollo_usage (day, count)
  VALUES (current_date, 1)
  ON CONFLICT (day) DO UPDATE
    SET count = public.apollo_usage.count + 1
    WHERE public.apollo_usage.count < p_cap
  RETURNING count INTO v_count;

  -- When the ON CONFLICT UPDATE is skipped because count >= cap, no row is
  -- returned and v_count is NULL -> the call is denied.
  RETURN v_count IS NOT NULL;
END;
$$;
