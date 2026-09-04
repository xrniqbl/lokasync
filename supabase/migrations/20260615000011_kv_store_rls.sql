-- Enable Row Level Security on the KV store table.
-- All access goes through the edge function (service-role key), so
-- direct client access via the anon key is blocked.

ALTER TABLE public.kv_store_827698a1 ENABLE ROW LEVEL SECURITY;

-- Only service_role may read/write — the anon role gets zero access.
CREATE POLICY "service_role only"
  ON public.kv_store_827698a1
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );
