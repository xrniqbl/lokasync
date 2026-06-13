-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Minor Endpoints Schema (007)
-- New tables for teams, settings, financial, integrations, sessions,
-- dashboard, and analytics — cut over from KV JSONB store.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Teams ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_workspace ON teams(workspace_id);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  initials TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  tasks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

-- ── Settings (JSONB per section) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, section)
);

CREATE INDEX IF NOT EXISTS idx_settings_workspace ON workspace_settings(workspace_id);

-- ── Financial (workspace-scoped JSONB) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_financial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_workspace ON workspace_financial(workspace_id);

-- ── Integrations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  connected BOOLEAN DEFAULT false,
  last_sync TEXT,
  scopes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON workspace_integrations(workspace_id);

-- ── Sessions (workspace-scoped JSONB) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON workspace_sessions(workspace_id);

-- ── Dashboard Ops (workspace-scoped JSONB) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_dashboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_workspace ON workspace_dashboard(workspace_id);

-- ── Analytics (workspace-scoped JSONB) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_workspace ON workspace_analytics(workspace_id);

-- ── Auto-update triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_teams_updated') THEN
    CREATE TRIGGER tr_teams_updated BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_integrations_updated') THEN
    CREATE TRIGGER tr_integrations_updated BEFORE UPDATE ON workspace_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_settings_updated') THEN
    CREATE TRIGGER tr_settings_updated BEFORE UPDATE ON workspace_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
