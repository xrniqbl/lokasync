-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync RLS Policies — Migration 002
-- Enforces workspace membership at the database level.
-- Edge Functions use service_role (bypasses RLS).
-- Frontend anon client enforces these policies.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Helper: membership check as a reusable expression ─────────────────────────
-- Every tenant table has workspace_id FK. This EXISTS verifies the current
-- user is listed in workspace_members for that workspace.

-- ── workspaces ────────────────────────────────────────────────────────────────
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_select ON workspaces;
CREATE POLICY workspaces_select ON workspaces
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS workspaces_update ON workspaces;
CREATE POLICY workspaces_update ON workspaces
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS workspaces_delete ON workspaces;
CREATE POLICY workspaces_delete ON workspaces
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ── workspace_members ─────────────────────────────────────────────────────────
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of workspaces they belong to.
DROP POLICY IF EXISTS workspace_members_select ON workspace_members;
CREATE POLICY workspace_members_select ON workspace_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members AS self
      WHERE self.workspace_id = workspace_members.workspace_id
        AND self.user_id = auth.uid()
    )
  );

-- Only workspace owners can add or remove members.
DROP POLICY IF EXISTS workspace_members_insert ON workspace_members;
CREATE POLICY workspace_members_insert ON workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members AS owner_check
      WHERE owner_check.workspace_id = workspace_members.workspace_id
        AND owner_check.user_id = auth.uid()
        AND owner_check.role = 'owner'
    )
  );

DROP POLICY IF EXISTS workspace_members_delete ON workspace_members;
CREATE POLICY workspace_members_delete ON workspace_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members AS owner_check
      WHERE owner_check.workspace_id = workspace_members.workspace_id
        AND owner_check.user_id = auth.uid()
        AND owner_check.role = 'owner'
    )
  );

-- ── projects ──────────────────────────────────────────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_select ON projects;
CREATE POLICY projects_select ON projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = projects.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS projects_insert ON projects;
CREATE POLICY projects_insert ON projects
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = projects.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS projects_update ON projects;
CREATE POLICY projects_update ON projects
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = projects.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = projects.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS projects_delete ON projects;
CREATE POLICY projects_delete ON projects
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = projects.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'owner'
    )
  );

-- ── tasks ─────────────────────────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON tasks;
CREATE POLICY tasks_select ON tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tasks_insert ON tasks;
CREATE POLICY tasks_insert ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tasks_update ON tasks;
CREATE POLICY tasks_update ON tasks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tasks_delete ON tasks;
CREATE POLICY tasks_delete ON tasks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'owner'
    )
  );

-- ── calendar_events ───────────────────────────────────────────────────────────
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_events_select ON calendar_events;
CREATE POLICY calendar_events_select ON calendar_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_events.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS calendar_events_insert ON calendar_events;
CREATE POLICY calendar_events_insert ON calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_events.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS calendar_events_update ON calendar_events;
CREATE POLICY calendar_events_update ON calendar_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_events.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS calendar_events_delete ON calendar_events;
CREATE POLICY calendar_events_delete ON calendar_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_events.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- ── mentions ──────────────────────────────────────────────────────────────────
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mentions_select ON mentions;
CREATE POLICY mentions_select ON mentions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = mentions.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS mentions_insert ON mentions;
CREATE POLICY mentions_insert ON mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = mentions.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS mentions_update ON mentions;
CREATE POLICY mentions_update ON mentions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = mentions.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS mentions_delete ON mentions;
CREATE POLICY mentions_delete ON mentions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = mentions.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- ── team_activity ─────────────────────────────────────────────────────────────
ALTER TABLE team_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_activity_select ON team_activity;
CREATE POLICY team_activity_select ON team_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = team_activity.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_activity_insert ON team_activity;
CREATE POLICY team_activity_insert ON team_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = team_activity.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_activity_delete ON team_activity;
CREATE POLICY team_activity_delete ON team_activity
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = team_activity.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'owner'
    )
  );

-- ── file_folders ──────────────────────────────────────────────────────────────
ALTER TABLE file_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_folders_select ON file_folders;
CREATE POLICY file_folders_select ON file_folders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = file_folders.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS file_folders_insert ON file_folders;
CREATE POLICY file_folders_insert ON file_folders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = file_folders.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS file_folders_delete ON file_folders;
CREATE POLICY file_folders_delete ON file_folders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = file_folders.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- ── files ─────────────────────────────────────────────────────────────────────
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS files_select ON files;
CREATE POLICY files_select ON files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = files.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS files_insert ON files;
CREATE POLICY files_insert ON files
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = files.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS files_delete ON files;
CREATE POLICY files_delete ON files
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = files.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );
