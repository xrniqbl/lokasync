-- ═══════════════════════════════════════════════════════════════════════════════
-- 024_fix_rls_recursion.sql
-- The workspace_members RLS policies in 002 self-reference the same table, which
-- triggers Postgres "infinite recursion detected in policy for relation
-- workspace_members". This replaces them with SECURITY DEFINER helpers that read
-- the table without re-triggering RLS. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Helpers (bypass RLS internally, but only expose a boolean) ─────────────────
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(ws uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- ── workspace_members: non-recursive policies ─────────────────────────────────
DROP POLICY IF EXISTS workspace_members_select ON workspace_members;
CREATE POLICY workspace_members_select ON workspace_members
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS workspace_members_insert ON workspace_members;
CREATE POLICY workspace_members_insert ON workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_owner(workspace_id));

DROP POLICY IF EXISTS workspace_members_delete ON workspace_members;
CREATE POLICY workspace_members_delete ON workspace_members
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_workspace_owner(workspace_id));

-- ── workspaces select can now use the helper too (optional but cleaner) ────────
DROP POLICY IF EXISTS workspaces_select ON workspaces;
CREATE POLICY workspaces_select ON workspaces
  FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()) OR public.is_workspace_member(id));
