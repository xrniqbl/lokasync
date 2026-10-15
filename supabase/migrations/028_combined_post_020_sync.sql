-- ═══════════════════════════════════════════════════════════════════════════════
-- 028_combined_post_020_sync.sql
-- For FRESH deploys that apply only 020 + this file: replays the content of
-- 021-027 so new databases get the same schema/RLS/storage fixes.
-- Incremental deploys (021, 022, ... applied in order) can skip this file —
-- every statement below is idempotent (IF NOT EXISTS / DROP IF EXISTS /
-- ON CONFLICT / OR REPLACE), so double-apply is harmless.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 021: seed test subscription (dev only — no-op when user missing) ─────────
WITH target_user AS (
  SELECT id FROM auth.users WHERE email = 'phase5.test@loka.dev'
)
INSERT INTO subscriptions (
  user_id, plan_id, price, status, interval, order_id,
  started_at, current_period_end, expires_at, next_billing, created_at, updated_at
)
SELECT
  id, 'business', 2990000, 'active', 'yearly',
  'manual-seed-' || gen_random_uuid(),
  now(), now() + interval '1 year', now() + interval '1 year',
  (now() + interval '1 year')::text, now(), now()
FROM target_user
ON CONFLICT (user_id) DO UPDATE SET
  plan_id = EXCLUDED.plan_id, price = EXCLUDED.price,
  status = EXCLUDED.status, interval = EXCLUDED.interval,
  order_id = EXCLUDED.order_id, started_at = EXCLUDED.started_at,
  current_period_end = EXCLUDED.current_period_end,
  expires_at = EXCLUDED.expires_at, next_billing = EXCLUDED.next_billing,
  updated_at = now();

-- ── 022: columns the backend reads/writes ────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS interval TEXT,
  ADD COLUMN IF NOT EXISTS order_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS plan_name TEXT,
  ADD COLUMN IF NOT EXISTS interval TEXT,
  ADD COLUMN IF NOT EXISTS base INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS midtrans JSONB DEFAULT '{}';

-- ── 023: profiles columns the backend reads/writes ───────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
UPDATE profiles
SET full_name = NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
WHERE full_name IS NULL
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);
UPDATE profiles
SET created_at = COALESCE(created_at, updated_at, now())
WHERE created_at IS NULL;

-- ── 024: non-recursive workspace_members policies ────────────────────────────
-- NOTE: the helper-function form (CREATE FUNCTION public.is_workspace_member
-- + policies calling it) is intentionally NOT replayed here. Production
-- carries a legacy is_workspace_member(uuid, text) overload with dozens of
-- dependent dashboard-era policies, so a bare helper name is ambiguous
-- (SQLSTATE 42725) and CREATE OR REPLACE FUNCTION cannot resolve it either.
-- These EXISTS-subquery policies are semantically identical to 024 (they
-- avoid the self-referencing EXISTS that caused infinite recursion in 002:
-- the outer reference is qualified to the policy's own row, and the inner
-- scan is a plain membership lookup, not a recursive policy invocation —
-- the same shape already proven in production by the dashboard-era policies).
DROP POLICY IF EXISTS workspace_members_select ON workspace_members;
CREATE POLICY workspace_members_select ON workspace_members
  FOR SELECT TO authenticated
  USING (
    workspace_members.user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM workspace_members AS self
      WHERE self.workspace_id = workspace_members.workspace_id
        AND self.user_id = (select auth.uid())
    )
  );
DROP POLICY IF EXISTS workspace_members_insert ON workspace_members;
CREATE POLICY workspace_members_insert ON workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members AS owner_check
      WHERE owner_check.workspace_id = workspace_members.workspace_id
        AND owner_check.user_id = (select auth.uid())
        AND owner_check.role = 'owner'
    )
  );
DROP POLICY IF EXISTS workspace_members_delete ON workspace_members;
CREATE POLICY workspace_members_delete ON workspace_members
  FOR DELETE TO authenticated
  USING (
    workspace_members.user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM workspace_members AS owner_check
      WHERE owner_check.workspace_id = workspace_members.workspace_id
        AND owner_check.user_id = (select auth.uid())
        AND owner_check.role = 'owner'
    )
  );
DROP POLICY IF EXISTS workspaces_select ON workspaces;
CREATE POLICY workspaces_select ON workspaces
  FOR SELECT TO authenticated
  USING (
    workspaces.owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspaces.id
        AND m.user_id = (select auth.uid())
    )
  );

-- ── 025: avatars bucket (private) + owner policies ───────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS avatars_owner_read ON storage.objects;
CREATE POLICY avatars_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS avatars_owner_write ON storage.objects;
CREATE POLICY avatars_owner_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── 026: files shared/archived flags ─────────────────────────────────────────
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_files_archived ON files(workspace_id, archived);

-- ── 027: audit fixes ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('pending', 'paid', 'success', 'failed', 'refunded', 'cancelled'));
  END IF;
END $$;
ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace_invitations') THEN
    ALTER TABLE workspace_invitations
      ALTER COLUMN invited_by TYPE TEXT USING invited_by::text;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kv_store_827698a1') THEN
    ALTER TABLE kv_store_827698a1 ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kv_allow_all ON kv_store_827698a1;
    DROP POLICY IF EXISTS kv_select ON kv_store_827698a1;
    DROP POLICY IF EXISTS kv_insert ON kv_store_827698a1;
    DROP POLICY IF EXISTS kv_update ON kv_store_827698a1;
    DROP POLICY IF EXISTS kv_delete ON kv_store_827698a1;
  END IF;
END $$;
DROP POLICY IF EXISTS subscriptions_insert ON subscriptions;
DROP POLICY IF EXISTS subscriptions_update ON subscriptions;
DROP POLICY IF EXISTS subscriptions_delete ON subscriptions;
DROP POLICY IF EXISTS transactions_insert ON transactions;
DROP POLICY IF EXISTS transactions_update ON transactions;
DROP POLICY IF EXISTS vouchers_select ON vouchers;
DROP POLICY IF EXISTS system_config_select ON system_config;
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update ON notifications;
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-files', 'workspace-files', false)
ON CONFLICT (id) DO NOTHING;
-- NOTE: storage policies use a direct EXISTS subquery on workspace_members
-- instead of the public.is_workspace_member()/is_workspace_owner() helpers:
-- production carries a legacy is_workspace_member(uuid, text) overload whose
-- policies depend on it, so a bare helper name is ambiguous there (SQLSTATE
-- 42725). The subquery is equivalent and unambiguous on all environments.
DROP POLICY IF EXISTS workspace_files_select ON storage.objects;
CREATE POLICY workspace_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'workspace-files'
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = ((string_to_array(storage.objects.name, '/'))[1])::uuid
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS workspace_files_insert ON storage.objects;
CREATE POLICY workspace_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-files'
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = ((string_to_array(storage.objects.name, '/'))[1])::uuid
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS workspace_files_delete ON storage.objects;
CREATE POLICY workspace_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'workspace-files'
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = ((string_to_array(storage.objects.name, '/'))[1])::uuid
        AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  );

CREATE OR REPLACE FUNCTION public.consume_voucher(p_code TEXT)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE updated int;
BEGIN
  UPDATE vouchers
  SET used_count = COALESCE(used_count, 0) + 1, updated_at = now()
  WHERE code = p_code AND active = true
    AND (valid_until IS NULL OR valid_until >= now())
    AND (max_uses IS NULL OR COALESCE(used_count, 0) < max_uses);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$;
