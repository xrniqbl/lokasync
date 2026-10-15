-- ═══════════════════════════════════════════════════════════════════════════════
-- 027_security_and_schema_fixes.sql
-- Audit remediation (2026-10-15): fixes P0 schema/RLS/storage issues.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. transactions status CHECK must allow 'paid' (server writes paid) ──────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('pending', 'paid', 'success', 'failed', 'refunded', 'cancelled'));
  END IF;
END $$;

-- ── 2. workspace_members needs email/name (server inserts them) ───────────────
ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT;

-- ── 3. workspace_invitations.invited_by stores display name (TEXT) ────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace_invitations') THEN
    ALTER TABLE workspace_invitations
      ALTER COLUMN invited_by TYPE TEXT USING invited_by::text;
  END IF;
END $$;

-- ── 4. Lock down kv_store (2FA/OTP secrets) to service_role only ──────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kv_store_827698a1') THEN
    ALTER TABLE kv_store_827698a1 ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kv_allow_all ON kv_store_827698a1;
    DROP POLICY IF EXISTS kv_select ON kv_store_827698a1;
    DROP POLICY IF EXISTS kv_insert ON kv_store_827698a1;
    DROP POLICY IF EXISTS kv_update ON kv_store_827698a1;
    DROP POLICY IF EXISTS kv_delete ON kv_store_827698a1;
    -- No public policies recreated: only service_role bypasses RLS.
  END IF;
END $$;

-- ── 5. Subscriptions/transactions: SELECT-own only, writes via edge only ──────
DROP POLICY IF EXISTS subscriptions_insert ON subscriptions;
DROP POLICY IF EXISTS subscriptions_update ON subscriptions;
DROP POLICY IF EXISTS subscriptions_delete ON subscriptions;
DROP POLICY IF EXISTS transactions_insert ON transactions;
DROP POLICY IF EXISTS transactions_update ON transactions;
-- NOTE: no public INSERT/UPDATE/DELETE recreated → direct PostgREST writes denied.
-- Edge function uses service_role and is unaffected.

-- ── 6. Vouchers + system_config: service_role-only reads ──────────────────────
DROP POLICY IF EXISTS vouchers_select ON vouchers;
DROP POLICY IF EXISTS system_config_select ON system_config;
-- No replacement: voucher validation + config go through the edge function.

-- ── 7. Notifications: keep SELECT for all, writes service_role only ───────────
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update ON notifications;
-- SELECT policy (USING true) intentionally kept: broadcasts are public to members.

-- ── 8. workspace-files bucket (private) + member-scoped storage policies ──────
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-files', 'workspace-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS workspace_files_select ON storage.objects;
CREATE POLICY workspace_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'workspace-files'
    AND public.is_workspace_member(((string_to_array(name, '/'))[1])::uuid)
  );

DROP POLICY IF EXISTS workspace_files_insert ON storage.objects;
CREATE POLICY workspace_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-files'
    AND public.is_workspace_member(((string_to_array(name, '/'))[1])::uuid)
  );

DROP POLICY IF EXISTS workspace_files_delete ON storage.objects;
CREATE POLICY workspace_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'workspace-files'
    AND public.is_workspace_owner(((string_to_array(name, '/'))[1])::uuid)
  );

-- ── 9. Prune sensitive tables from realtime publication ───────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'vouchers') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE vouchers;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'subscriptions') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE subscriptions;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE transactions;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'system_config') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE system_config;
    END IF;
  END IF;
END $$;

-- ── 10. Atomic voucher consumption RPC (prevents double-spend race) ───────────
CREATE OR REPLACE FUNCTION public.consume_voucher(p_code TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated int;
BEGIN
  UPDATE vouchers
  SET used_count = COALESCE(used_count, 0) + 1, updated_at = now()
  WHERE code = p_code
    AND active = true
    AND (valid_until IS NULL OR valid_until >= now())
    AND (max_uses IS NULL OR COALESCE(used_count, 0) < max_uses);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$;
