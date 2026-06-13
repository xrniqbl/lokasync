-- ═══════════════════════════════════════════════════════════════════════════════
-- workspace_milestones (012) — JSONB store for per-project milestone arrays.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workspace_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestones_workspace ON workspace_milestones(workspace_id);

ALTER TABLE workspace_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY milestones_select ON workspace_milestones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_milestones.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY milestones_insert ON workspace_milestones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_milestones.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY milestones_update ON workspace_milestones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_milestones.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY milestones_delete ON workspace_milestones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_milestones.workspace_id AND m.user_id = auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_milestones') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_milestones;
  END IF;
  ALTER TABLE workspace_milestones REPLICA IDENTITY FULL;
END $$;
