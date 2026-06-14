-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Minor Endpoints RLS Policies (008)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Teams ─────────────────────────────────────────────────────────────────────
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_select ON teams;
CREATE POLICY teams_select ON teams FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS teams_insert ON teams;
CREATE POLICY teams_insert ON teams FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS teams_update ON teams;
CREATE POLICY teams_update ON teams FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS teams_delete ON teams;
CREATE POLICY teams_delete ON teams FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Team Members ──────────────────────────────────────────────────────────────
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_members_select ON team_members;
CREATE POLICY team_members_select ON team_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM teams t JOIN workspace_members m ON m.workspace_id = t.workspace_id
    WHERE t.id = team_members.team_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS team_members_insert ON team_members;
CREATE POLICY team_members_insert ON team_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM teams t JOIN workspace_members m ON m.workspace_id = t.workspace_id
    WHERE t.id = team_members.team_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS team_members_update ON team_members;
CREATE POLICY team_members_update ON team_members FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM teams t JOIN workspace_members m ON m.workspace_id = t.workspace_id
    WHERE t.id = team_members.team_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS team_members_delete ON team_members;
CREATE POLICY team_members_delete ON team_members FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM teams t JOIN workspace_members m ON m.workspace_id = t.workspace_id
    WHERE t.id = team_members.team_id AND m.user_id = auth.uid()
  ));

-- ── Settings ──────────────────────────────────────────────────────────────────
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_select ON workspace_settings;
CREATE POLICY settings_select ON workspace_settings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_settings.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS settings_insert ON workspace_settings;
CREATE POLICY settings_insert ON workspace_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_settings.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS settings_update ON workspace_settings;
CREATE POLICY settings_update ON workspace_settings FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_settings.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS settings_delete ON workspace_settings;
CREATE POLICY settings_delete ON workspace_settings FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_settings.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Financial ─────────────────────────────────────────────────────────────────
ALTER TABLE workspace_financial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_select ON workspace_financial;
CREATE POLICY financial_select ON workspace_financial FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_financial.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS financial_insert ON workspace_financial;
CREATE POLICY financial_insert ON workspace_financial FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_financial.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS financial_update ON workspace_financial;
CREATE POLICY financial_update ON workspace_financial FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_financial.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS financial_delete ON workspace_financial;
CREATE POLICY financial_delete ON workspace_financial FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_financial.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Integrations ──────────────────────────────────────────────────────────────
ALTER TABLE workspace_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integrations_select ON workspace_integrations;
CREATE POLICY integrations_select ON workspace_integrations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_integrations.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS integrations_insert ON workspace_integrations;
CREATE POLICY integrations_insert ON workspace_integrations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_integrations.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS integrations_update ON workspace_integrations;
CREATE POLICY integrations_update ON workspace_integrations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_integrations.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS integrations_delete ON workspace_integrations;
CREATE POLICY integrations_delete ON workspace_integrations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_integrations.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Sessions ──────────────────────────────────────────────────────────────────
ALTER TABLE workspace_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_select ON workspace_sessions;
CREATE POLICY sessions_select ON workspace_sessions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_sessions.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS sessions_insert ON workspace_sessions;
CREATE POLICY sessions_insert ON workspace_sessions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_sessions.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS sessions_update ON workspace_sessions;
CREATE POLICY sessions_update ON workspace_sessions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_sessions.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS sessions_delete ON workspace_sessions;
CREATE POLICY sessions_delete ON workspace_sessions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_sessions.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Dashboard ─────────────────────────────────────────────────────────────────
ALTER TABLE workspace_dashboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_select ON workspace_dashboard;
CREATE POLICY dashboard_select ON workspace_dashboard FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_dashboard.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS dashboard_insert ON workspace_dashboard;
CREATE POLICY dashboard_insert ON workspace_dashboard FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_dashboard.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS dashboard_update ON workspace_dashboard;
CREATE POLICY dashboard_update ON workspace_dashboard FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_dashboard.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS dashboard_delete ON workspace_dashboard;
CREATE POLICY dashboard_delete ON workspace_dashboard FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_dashboard.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Analytics ─────────────────────────────────────────────────────────────────
ALTER TABLE workspace_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_select ON workspace_analytics;
CREATE POLICY analytics_select ON workspace_analytics FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_analytics.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS analytics_insert ON workspace_analytics;
CREATE POLICY analytics_insert ON workspace_analytics FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_analytics.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS analytics_update ON workspace_analytics;
CREATE POLICY analytics_update ON workspace_analytics FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_analytics.workspace_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS analytics_delete ON workspace_analytics;
CREATE POLICY analytics_delete ON workspace_analytics FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_analytics.workspace_id AND m.user_id = auth.uid()
  ));
