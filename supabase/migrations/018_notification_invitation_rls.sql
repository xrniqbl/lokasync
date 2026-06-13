-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Notification + Invitation RLS (018)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Notifications ─────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
  USING (true);

-- ── Notification Reads ────────────────────────────────────────────────────────
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_reads_select ON notification_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notification_reads_insert ON notification_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notification_reads_update ON notification_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notification_reads_delete ON notification_reads FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Workspace Invitations ─────────────────────────────────────────────────────
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_select ON workspace_invitations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_invitations.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY invitations_insert ON workspace_invitations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_invitations.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY invitations_update ON workspace_invitations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_invitations.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY invitations_delete ON workspace_invitations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_invitations.workspace_id AND m.user_id = auth.uid()
  ));
