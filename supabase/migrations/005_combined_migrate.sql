-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Relational Schema — Migration 001
-- Replaces KV JSONB store with normalized PostgreSQL tables.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Workspaces ────────────────────────────────────────────────────────────────
-- Source of truth for every workspace.
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,                  -- references auth.users(id)
  plan_id TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_plan ON workspaces(plan_id);

-- ── Workspace Members ─────────────────────────────────────────────────────────
-- Many-to-many: users belonging to workspaces with role.
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                    -- references auth.users(id)
  role TEXT NOT NULL CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- ── Projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id INTEGER,                      -- maps to KV integer id during migration
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  due_date DATE,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ── Tasks ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id INTEGER,                      -- maps to KV integer id during migration
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in-progress','review','completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  assignee TEXT,                           -- user email or display name
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_legacy_id ON tasks(legacy_id);

-- ── Calendar Events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace ON calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);

-- ── Mentions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'mention' CHECK (type IN ('mention','assignment')),
  actor TEXT NOT NULL,                     -- sender display name / email
  text TEXT NOT NULL,
  mentionee TEXT,                          -- target user email / name
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentions_workspace ON mentions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mentions_mentionee ON mentions(mentionee);
CREATE INDEX IF NOT EXISTS idx_mentions_read ON mentions(read);

-- ── Team Activity ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created','updated','deleted','completed','uploaded','left','joined','commented')),
  target TEXT NOT NULL,
  target_type TEXT CHECK (target_type IN ('task','project','file','workspace','comment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_activity_workspace ON team_activity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_created ON team_activity(created_at);

-- ── File Folders ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES file_folders(id) ON DELETE CASCADE,  -- self-referential for nesting
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_folders_workspace ON file_folders(workspace_id);

-- ── Files ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES file_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  url TEXT,
  uploader TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);

-- ── Triggers: auto-update updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_workspaces
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_tasks
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_calendar_events
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
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

CREATE POLICY workspaces_update ON workspaces
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY workspaces_delete ON workspaces
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ── workspace_members ─────────────────────────────────────────────────────────
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of workspaces they belong to.
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

CREATE POLICY projects_select ON projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = projects.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY projects_insert ON projects
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = projects.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

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

CREATE POLICY tasks_select ON tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY tasks_insert ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

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

CREATE POLICY calendar_events_select ON calendar_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_events.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY calendar_events_insert ON calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_events.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY calendar_events_update ON calendar_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_events.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

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

CREATE POLICY mentions_select ON mentions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = mentions.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY mentions_insert ON mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = mentions.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY mentions_update ON mentions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = mentions.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

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

CREATE POLICY team_activity_select ON team_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = team_activity.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY team_activity_insert ON team_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = team_activity.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

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

CREATE POLICY file_folders_select ON file_folders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = file_folders.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY file_folders_insert ON file_folders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = file_folders.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

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

CREATE POLICY files_select ON files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = files.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY files_insert ON files
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = files.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY files_delete ON files
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = files.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );
-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Realtime Enablement — Migration 003
-- Adds all tenant tables to the supabase_realtime publication and sets
-- replica identity to FULL so every INSERT/UPDATE/DELETE broadcasts the
-- complete row payload (required for Edge-Function broadcast pattern).
-- ═══════════════════════════════════════════════════════════════════════════════

-- NOTE: This migration assumes the `supabase_realtime` publication already
-- exists (created automatically by Supabase). If it does not exist, run:
--   CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
-- or enable Realtime in the Supabase Dashboard (Database → Replication).

-- ── Add tables to Realtime publication ────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_members;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE mentions;
ALTER PUBLICATION supabase_realtime ADD TABLE team_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE file_folders;
ALTER PUBLICATION supabase_realtime ADD TABLE files;

-- ── Replica Identity FULL ─────────────────────────────────────────────────────
-- Without FULL, Postgres only sends the primary key on UPDATE/DELETE.
-- We need the entire old + new row so the Edge Function can broadcast
-- meaningful payloads (title, assignee, status, etc.) to subscribers.
ALTER TABLE workspaces REPLICA IDENTITY FULL;
ALTER TABLE workspace_members REPLICA IDENTITY FULL;
ALTER TABLE projects REPLICA IDENTITY FULL;
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE calendar_events REPLICA IDENTITY FULL;
ALTER TABLE mentions REPLICA IDENTITY FULL;
ALTER TABLE team_activity REPLICA IDENTITY FULL;
ALTER TABLE file_folders REPLICA IDENTITY FULL;
ALTER TABLE files REPLICA IDENTITY FULL;
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 004: KV → SQL Data Migration
-- Copies existing KV structured data into the new relational tables.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING on legacy_id).
-- ═══════════════════════════════════════════════════════════════════════════════

-- NOTE: This migration assumes the new tables are already created (001).
-- Run after applying 001, 002, 003.

-- ── Workspaces ────────────────────────────────────────────────────────────────
-- workspace:{id} → workspaces
INSERT INTO workspaces (id, name, owner_id, plan_id, created_at)
SELECT
  (value->>'id')::UUID,
  value->>'name',
  (value->>'owner_id')::UUID,
  COALESCE(value->>'plan_id', 'free'),
  COALESCE((value->>'created_at')::TIMESTAMPTZ, now())
FROM kv_store_827698a1
WHERE key LIKE 'workspace:%'
ON CONFLICT (id) DO NOTHING;

-- ── Workspace Members ─────────────────────────────────────────────────────────
-- ws_members:{id} array → workspace_members
INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
SELECT
  (regexp_match(key, '^ws_members:([^:]+)$'))[1]::UUID,
  (elem->>'user_id')::UUID,
  COALESCE(elem->>'role', 'member'),
  COALESCE((elem->>'joined_at')::TIMESTAMPTZ, now())
FROM kv_store_827698a1,
jsonb_array_elements(value) as elem
WHERE key LIKE 'ws_members:%'
-- Filter out NULL workspace_ids that can arise from malformed keys
  AND (regexp_match(key, '^ws_members:([^:]+)$'))[1] IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- ── Projects ──────────────────────────────────────────────────────────────────
-- ws:{wsId}:projects:list → projects
INSERT INTO projects (
  workspace_id, legacy_id, name, description, status, progress, due_date, tags, created_at, updated_at
)
SELECT
  (regexp_match(key, '^ws:([^:]+):projects:list$'))[1]::UUID as workspace_id,
  (elem->>'id')::INTEGER as legacy_id,
  elem->>'name',
  elem->>'description',
  COALESCE(elem->>'status', 'active'),
  COALESCE((elem->>'progress')::INTEGER, 0),
  (elem->>'due')::date as due_date,  -- stored as text in KV; may need manual cleanup
  COALESCE(
    (SELECT array_agg(x::text) FROM jsonb_array_elements_text(elem->'tags') as x),
    ARRAY[]::TEXT[]
  ),
  now(),
  now()
FROM kv_store_827698a1,
jsonb_array_elements(value) as elem
WHERE key LIKE 'ws:%:projects:list'
ON CONFLICT DO NOTHING;

-- ── Tasks ─────────────────────────────────────────────────────────────────────
-- ws:{wsId}:tasks:list → tasks
-- project_id resolved by matching project name against projects table
INSERT INTO tasks (
  workspace_id, legacy_id, project_id, title, description, status, priority, assignee, due_date, created_at, updated_at
)
SELECT
  (regexp_match(t.key, '^ws:([^:]+):tasks:list$'))[1]::UUID as workspace_id,
  (elem->>'id')::INTEGER as legacy_id,
  p.id as project_id,
  elem->>'title',
  elem->>'description',
  COALESCE(elem->>'status', 'todo'),
  COALESCE(elem->>'priority', 'medium'),
  elem->>'assignee',
  (elem->>'due')::date as due_date,
  now(),
  now()
FROM kv_store_827698a1 t
cross join lateral jsonb_array_elements(t.value) as elem
LEFT JOIN LATERAL (
  SELECT p.id FROM projects p
  WHERE p.workspace_id = (regexp_match(t.key, '^ws:([^:]+):tasks:list$'))[1]::UUID
    AND p.name = elem->>'project'
  LIMIT 1
) p ON true
WHERE t.key LIKE 'ws:%:tasks:list'
ON CONFLICT DO NOTHING;

-- ── Calendar Events ───────────────────────────────────────────────────────────
-- ws:{wsId}:calendar:events → calendar_events
-- KV key format: ws:{wsId}:calendar:events  value: {"YYYY-M-D": [{id,title,time,color}]}
INSERT INTO calendar_events (workspace_id, title, start_time, end_time, color, created_at, updated_at)
SELECT
  split_part(t.key, ':', 2)::UUID as workspace_id,
  elem->>'title',
  (CASE
    WHEN date_keys.date_key ~ '^\d+-\d+-\d+$' THEN
      TO_TIMESTAMP(
        split_part(date_keys.date_key, '-', 1) || '-' ||
        lpad(split_part(date_keys.date_key, '-', 2), 2, '0') || '-' ||
        lpad(split_part(date_keys.date_key, '-', 3), 2, '0') || ' ' ||
        COALESCE(elem->>'time', '00:00') || ':00',
        'YYYY-MM-DD HH24:MI:SS'
      )
    ELSE NULL
  END) as start_time,
  NULL as end_time,
  COALESCE(elem->>'color', '#6366f1'),
  now(),
  now()
FROM kv_store_827698a1 t,
lateral jsonb_each(t.value) as date_keys(date_key, events),
lateral jsonb_array_elements(date_keys.events) as elem
WHERE t.key LIKE 'ws:%:calendar:events'
ON CONFLICT DO NOTHING;

-- ── Mentions (seed-only; real mentions are generated from assignee changes) ────
-- ws:{wsId}:mentions:list → mentions
INSERT INTO mentions (workspace_id, type, actor, text, mentionee, created_at)
SELECT
  (regexp_match(key, '^ws:([^:]+):mentions:list$'))[1]::UUID as workspace_id,
  COALESCE(elem->>'type', 'mention'),
  elem->>'actor',
  elem->>'text',
  elem->>'mentionee',
  COALESCE((elem->>'time')::TIMESTAMPTZ, now())
FROM kv_store_827698a1,
jsonb_array_elements(value) as elem
WHERE key LIKE 'ws:%:mentions:list'
ON CONFLICT DO NOTHING;

-- ── Team Activity (seed-only; real activity is generated from action logs) ─────
-- ws:{wsId}:team_activity:list → team_activity
INSERT INTO team_activity (workspace_id, actor, action, target, created_at)
SELECT
  (regexp_match(key, '^ws:([^:]+):team_activity:list$'))[1]::UUID as workspace_id,
  elem->>'actor',
  elem->>'action',
  elem->>'target',
  COALESCE((elem->>'time')::TIMESTAMPTZ, now())
FROM kv_store_827698a1,
jsonb_array_elements(value) as elem
WHERE key LIKE 'ws:%:team_activity:list'
ON CONFLICT DO NOTHING;

-- ── File Folders ──────────────────────────────────────────────────────────────
-- ws:{wsId}:files:folders → file_folders
INSERT INTO file_folders (workspace_id, name, created_at)
SELECT
  (regexp_match(key, '^ws:([^:]+):files:folders$'))[1]::UUID as workspace_id,
  elem->>'name',
  now()
FROM kv_store_827698a1,
jsonb_array_elements(value) as elem
WHERE key LIKE 'ws:%:files:folders'
ON CONFLICT DO NOTHING;

-- ── Files ─────────────────────────────────────────────────────────────────────
-- ws:{wsId}:files:list → files
-- folder_id resolved by matching folder name
INSERT INTO files (workspace_id, folder_id, name, size_bytes, mime_type, storage_path, url, uploader, created_at)
SELECT
  (regexp_match(t.key, '^ws:([^:]+):files:list$'))[1]::UUID as workspace_id,
  f.id as folder_id,
  elem->>'name',
  CASE WHEN (elem->>'size') ~ '^\d+$' THEN (elem->>'size')::BIGINT ELSE 0 END,
  COALESCE(elem->>'type', 'application/octet-stream'),
  elem->>'storagePath',
  elem->>'url',
  COALESCE(elem->>'uploader', 'unknown'),
  now()
FROM kv_store_827698a1 t
cross join lateral jsonb_array_elements(t.value) as elem
LEFT JOIN LATERAL (
  SELECT f.id FROM file_folders f
  WHERE f.workspace_id = (regexp_match(t.key, '^ws:([^:]+):files:list$'))[1]::UUID
    AND f.name = elem->>'folderName'
  LIMIT 1
) f ON true
WHERE t.key LIKE 'ws:%:files:list'
ON CONFLICT DO NOTHING;
