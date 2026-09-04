-- Fix role escalation vulnerability in workspace_members UPDATE policy.
-- The original policy lacked a WITH CHECK clause, allowing admins to set
-- any member's role (including their own) to 'owner' via direct Supabase
-- client access, bypassing the edge function's transfer-ownership logic.
--
-- The new WITH CHECK clause prevents any UPDATE from setting role = 'owner'.
-- Legitimate ownership transfers go through POST /workspace/transfer-ownership
-- which uses the service-role key and bypasses RLS.

DROP POLICY IF EXISTS "owner admin update members" ON public.workspace_members;

CREATE POLICY "owner admin update members"
  ON public.workspace_members
  FOR UPDATE
  USING (public.is_workspace_member(workspace_id, 'admin'))
  WITH CHECK (role <> 'owner');
