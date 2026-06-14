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

-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Migration Verification Queries
-- Run these after executing 004_migrate_kv_to_sql.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Row counts per table (compare with your KV data)
SELECT 'workspaces' as "table", count(*) as rows FROM workspaces
UNION ALL SELECT 'workspace_members', count(*) FROM workspace_members
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'tasks', count(*) FROM tasks
UNION ALL SELECT 'calendar_events', count(*) FROM calendar_events
UNION ALL SELECT 'mentions', count(*) FROM mentions
UNION ALL SELECT 'team_activity', count(*) FROM team_activity
UNION ALL SELECT 'file_folders', count(*) FROM file_folders
UNION ALL SELECT 'files', count(*) FROM files
ORDER BY "table";

-- 2. Verify tasks have valid project linkage (should be >0 for most workspaces)
SELECT t.workspace_id, count(*) as tasks_with_project
FROM tasks t
WHERE t.project_id IS NOT NULL
GROUP BY t.workspace_id
ORDER BY tasks_with_project DESC
LIMIT 5;

-- 3. Verify files have folder linkage
SELECT f.workspace_id, count(*) as files_with_folder
FROM files f
WHERE f.folder_id IS NOT NULL
GROUP BY f.workspace_id
ORDER BY files_with_folder DESC
LIMIT 5;

-- 4. Check RLS is enabled on all tenant tables
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('tasks','projects','calendar_events','mentions','team_activity','files','file_folders','workspace_members','workspaces')
ORDER BY relname;

-- 5. Check Realtime publication includes all tables
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';

-- 6. Spot-check: a few workspace members
SELECT m.*, w.name as workspace_name
FROM workspace_members m
JOIN workspaces w ON w.id = m.workspace_id
LIMIT 10;

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Minor Endpoints RLS Policies (008)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Teams ─────────────────────────────────────────────────────────────────────
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_select ON teams FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY teams_insert ON teams FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY teams_update ON teams FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY teams_delete ON teams FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Team Members ──────────────────────────────────────────────────────────────
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_members_select ON team_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM teams t JOIN workspace_members m ON m.workspace_id = t.workspace_id
    WHERE t.id = team_members.team_id AND m.user_id = auth.uid()
  ));

CREATE POLICY team_members_insert ON team_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM teams t JOIN workspace_members m ON m.workspace_id = t.workspace_id
    WHERE t.id = team_members.team_id AND m.user_id = auth.uid()
  ));

CREATE POLICY team_members_update ON team_members FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM teams t JOIN workspace_members m ON m.workspace_id = t.workspace_id
    WHERE t.id = team_members.team_id AND m.user_id = auth.uid()
  ));

CREATE POLICY team_members_delete ON team_members FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM teams t JOIN workspace_members m ON m.workspace_id = t.workspace_id
    WHERE t.id = team_members.team_id AND m.user_id = auth.uid()
  ));

-- ── Settings ──────────────────────────────────────────────────────────────────
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_select ON workspace_settings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_settings.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY settings_insert ON workspace_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_settings.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY settings_update ON workspace_settings FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_settings.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY settings_delete ON workspace_settings FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_settings.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Financial ─────────────────────────────────────────────────────────────────
ALTER TABLE workspace_financial ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_select ON workspace_financial FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_financial.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY financial_insert ON workspace_financial FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_financial.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY financial_update ON workspace_financial FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_financial.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY financial_delete ON workspace_financial FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_financial.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Integrations ──────────────────────────────────────────────────────────────
ALTER TABLE workspace_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY integrations_select ON workspace_integrations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_integrations.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY integrations_insert ON workspace_integrations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_integrations.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY integrations_update ON workspace_integrations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_integrations.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY integrations_delete ON workspace_integrations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_integrations.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Sessions ──────────────────────────────────────────────────────────────────
ALTER TABLE workspace_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_select ON workspace_sessions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_sessions.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY sessions_insert ON workspace_sessions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_sessions.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY sessions_update ON workspace_sessions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_sessions.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY sessions_delete ON workspace_sessions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_sessions.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Dashboard ─────────────────────────────────────────────────────────────────
ALTER TABLE workspace_dashboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY dashboard_select ON workspace_dashboard FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_dashboard.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY dashboard_insert ON workspace_dashboard FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_dashboard.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY dashboard_update ON workspace_dashboard FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_dashboard.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY dashboard_delete ON workspace_dashboard FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_dashboard.workspace_id AND m.user_id = auth.uid()
  ));

-- ── Analytics ─────────────────────────────────────────────────────────────────
ALTER TABLE workspace_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_select ON workspace_analytics FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_analytics.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY analytics_insert ON workspace_analytics FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_analytics.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY analytics_update ON workspace_analytics FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_analytics.workspace_id AND m.user_id = auth.uid()
  ));

CREATE POLICY analytics_delete ON workspace_analytics FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspace_analytics.workspace_id AND m.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Minor Endpoints Realtime Enable (009)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Teams
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'teams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  END IF;
  ALTER TABLE teams REPLICA IDENTITY FULL;

  -- Team Members
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
  END IF;
  ALTER TABLE team_members REPLICA IDENTITY FULL;

  -- Settings
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_settings;
  END IF;
  ALTER TABLE workspace_settings REPLICA IDENTITY FULL;

  -- Financial
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_financial'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_financial;
  END IF;
  ALTER TABLE workspace_financial REPLICA IDENTITY FULL;

  -- Integrations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_integrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_integrations;
  END IF;
  ALTER TABLE workspace_integrations REPLICA IDENTITY FULL;

  -- Sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_sessions;
  END IF;
  ALTER TABLE workspace_sessions REPLICA IDENTITY FULL;

  -- Dashboard
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_dashboard'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_dashboard;
  END IF;
  ALTER TABLE workspace_dashboard REPLICA IDENTITY FULL;

  -- Analytics
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_analytics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_analytics;
  END IF;
  ALTER TABLE workspace_analytics REPLICA IDENTITY FULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 010: Minor Endpoints KV → SQL
-- Migrates teams, integrations, settings, financial, sessions, dashboard,
-- and analytics from KV JSONB store into the relational tables created by 007.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Teams ─────────────────────────────────────────────────────────────────────
-- KV: ws:{workspace_id}:teams:list  →  JSONB array of team objects with nested members
-- Step 1: Insert teams (deduplicated by workspace_id + name)
INSERT INTO teams (workspace_id, name, description)
SELECT DISTINCT ON (workspace_id, name)
  (regexp_match(t.key, '^ws:([^:]+):teams:list$'))[1]::UUID as workspace_id,
  elem->>'name',
  elem->>'description'
FROM kv_store_827698a1 t
CROSS JOIN LATERAL jsonb_array_elements(t.value) as elem
WHERE t.key LIKE 'ws:%:teams:list'
ON CONFLICT DO NOTHING;

-- Step 2: Insert team_members (nested inside each team object)
-- NOTE: team_id resolved via LATERAL join on name match within same workspace
INSERT INTO team_members (team_id, initials, name, role, status, tasks)
SELECT
  tm.id as team_id,
  member->>'initials',
  member->>'name',
  COALESCE(member->>'role', 'member'),
  COALESCE(member->>'status', 'offline'),
  COALESCE((member->>'tasks')::INTEGER, 0)
FROM kv_store_827698a1 t
CROSS JOIN LATERAL jsonb_array_elements(t.value) as team_elem
CROSS JOIN LATERAL jsonb_array_elements(team_elem->'members') as member
INNER JOIN teams tm
  ON tm.workspace_id = (regexp_match(t.key, '^ws:([^:]+):teams:list$'))[1]::UUID
  AND tm.name = team_elem->>'name'
WHERE t.key LIKE 'ws:%:teams:list'
ON CONFLICT DO NOTHING;

-- ── Integrations ──────────────────────────────────────────────────────────────
-- KV: ws:{workspace_id}:integrations:list  →  JSONB array of integration objects
INSERT INTO workspace_integrations (workspace_id, name, description, connected, last_sync, scopes)
SELECT
  (regexp_match(t.key, '^ws:([^:]+):integrations:list$'))[1]::UUID as workspace_id,
  elem->>'name',
  COALESCE(elem->>'description', ''),
  COALESCE((elem->>'connected')::BOOLEAN, false),
  elem->>'lastSync',
  elem->>'scopes'
FROM kv_store_827698a1 t
CROSS JOIN LATERAL jsonb_array_elements(t.value) as elem
WHERE t.key LIKE 'ws:%:integrations:list'
ON CONFLICT (workspace_id, name) DO NOTHING;

-- ── Settings ──────────────────────────────────────────────────────────────────
-- KV: ws:{workspace_id}:settings:{section}  →  JSONB object per section
INSERT INTO workspace_settings (workspace_id, section, data)
SELECT
  (regexp_match(t.key, '^ws:([^:]+):settings:(.+)$'))[1]::UUID as workspace_id,
  (regexp_match(t.key, '^ws:([^:]+):settings:(.+)$'))[2] as section,
  t.value as data
FROM kv_store_827698a1 t
WHERE t.key LIKE 'ws:%:settings:%'
ON CONFLICT (workspace_id, section) DO NOTHING;

-- ── Financial ─────────────────────────────────────────────────────────────────
-- KV: ws:{workspace_id}:financial:data  →  single JSONB object
INSERT INTO workspace_financial (workspace_id, data)
SELECT
  (regexp_match(t.key, '^ws:([^:]+):financial:data$'))[1]::UUID as workspace_id,
  t.value as data
FROM kv_store_827698a1 t
WHERE t.key LIKE 'ws:%:financial:data'
ON CONFLICT (workspace_id) DO NOTHING;

-- ── Sessions ──────────────────────────────────────────────────────────────────
-- KV: ws:{workspace_id}:security:sessions  →  single JSONB object
INSERT INTO workspace_sessions (workspace_id, data)
SELECT
  (regexp_match(t.key, '^ws:([^:]+):security:sessions$'))[1]::UUID as workspace_id,
  t.value as data
FROM kv_store_827698a1 t
WHERE t.key LIKE 'ws:%:security:sessions'
ON CONFLICT (workspace_id) DO NOTHING;

-- ── Dashboard ─────────────────────────────────────────────────────────────────
-- KV: ws:{workspace_id}:dashboard:ops  →  single JSONB object
INSERT INTO workspace_dashboard (workspace_id, data)
SELECT
  (regexp_match(t.key, '^ws:([^:]+):dashboard:ops$'))[1]::UUID as workspace_id,
  t.value as data
FROM kv_store_827698a1 t
WHERE t.key LIKE 'ws:%:dashboard:ops'
ON CONFLICT (workspace_id) DO NOTHING;

-- ── Analytics ─────────────────────────────────────────────────────────────────
-- KV: ws:{workspace_id}:analytics:metrics  →  single JSONB object
INSERT INTO workspace_analytics (workspace_id, data)
SELECT
  (regexp_match(t.key, '^ws:([^:]+):analytics:metrics$'))[1]::UUID as workspace_id,
  t.value as data
FROM kv_store_827698a1 t
WHERE t.key LIKE 'ws:%:analytics:metrics'
ON CONFLICT (workspace_id) DO NOTHING;
-- ═══════════════════════════════════════════════════════════════════════════════
-- Alter workspace_dashboard to support category column (ops vs details)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workspace_dashboard ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'ops';

-- Drop old unique constraint and add composite unique key
ALTER TABLE workspace_dashboard DROP CONSTRAINT IF EXISTS workspace_dashboard_workspace_id_key;
ALTER TABLE workspace_dashboard ADD CONSTRAINT workspace_dashboard_workspace_category_key UNIQUE (workspace_id, category);

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync System Schema (013)
-- Global tables: profiles, plans, subscriptions, vouchers, transactions, system_config
-- These are not workspace-scoped; they are user-scoped or system-wide.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  department TEXT,
  bio TEXT,
  github TEXT,
  linkedin TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);

-- ── Plans ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price INTEGER DEFAULT 0,
  yearly_price INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  features JSONB DEFAULT '[]',
  storage_limit BIGINT DEFAULT 0,
  max_projects INTEGER DEFAULT 0,
  max_members INTEGER DEFAULT 0,
  highlighted BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(active);
CREATE INDEX IF NOT EXISTS idx_plans_sort ON plans(sort_order);

-- ── Subscriptions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  seats INTEGER DEFAULT 1,
  next_billing TEXT,
  expires_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'trial', 'suspended')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ── Vouchers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);

-- ── Transactions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT,
  amount INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'IDR',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded', 'cancelled')),
  payment_method TEXT,
  gateway TEXT DEFAULT 'midtrans',
  gateway_transaction_id TEXT,
  metadata JSONB DEFAULT '{}',
  voucher_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ── System Config ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_profiles_updated') THEN
    CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_plans_updated') THEN
    CREATE TRIGGER tr_plans_updated BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_subscriptions_updated') THEN
    CREATE TRIGGER tr_subscriptions_updated BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_vouchers_updated') THEN
    CREATE TRIGGER tr_vouchers_updated BEFORE UPDATE ON vouchers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_transactions_updated') THEN
    CREATE TRIGGER tr_transactions_updated BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync System RLS Policies (014)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ── Plans ─────────────────────────────────────────────────────────────────────
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select ON plans FOR SELECT TO authenticated
  USING (true);

-- ── Subscriptions ─────────────────────────────────────────────────────────────
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY subscriptions_delete ON subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Vouchers ──────────────────────────────────────────────────────────────────
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY vouchers_select ON vouchers FOR SELECT TO authenticated
  USING (true);

-- ── Transactions ──────────────────────────────────────────────────────────────
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_select ON transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY transactions_insert ON transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY transactions_update ON transactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ── System Config ─────────────────────────────────────────────────────────────
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_config_select ON system_config FOR SELECT TO authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync System Realtime Enable (015)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Profiles
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
  ALTER TABLE profiles REPLICA IDENTITY FULL;

  -- Plans
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'plans') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE plans;
  END IF;
  ALTER TABLE plans REPLICA IDENTITY FULL;

  -- Subscriptions
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'subscriptions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;
  END IF;
  ALTER TABLE subscriptions REPLICA IDENTITY FULL;

  -- Vouchers
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'vouchers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vouchers;
  END IF;
  ALTER TABLE vouchers REPLICA IDENTITY FULL;

  -- Transactions
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;
  ALTER TABLE transactions REPLICA IDENTITY FULL;

  -- System Config
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'system_config') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE system_config;
  END IF;
  ALTER TABLE system_config REPLICA IDENTITY FULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE: Add applies_to JSONB column to vouchers
-- Needed because checkout validates voucher against plan IDs.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS applies_to JSONB DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Notification + Invitation Schema (017)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'free', 'pro', 'business')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_audience ON notifications(audience);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

CREATE TABLE IF NOT EXISTS notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notification ON notification_reads(notification_id);

-- ── Workspace Invitations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON workspace_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON workspace_invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON workspace_invitations(email);

-- ── Auto-update triggers ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_notifications_updated') THEN
    CREATE TRIGGER tr_notifications_updated BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_invitations_updated') THEN
    CREATE TRIGGER tr_invitations_updated BEFORE UPDATE ON workspace_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Notification + Invitation Realtime Enable (019)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Notifications
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
  ALTER TABLE notifications REPLICA IDENTITY FULL;

  -- Notification Reads
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notification_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_reads;
  END IF;
  ALTER TABLE notification_reads REPLICA IDENTITY FULL;

  -- Workspace Invitations
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_invitations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_invitations;
  END IF;
  ALTER TABLE workspace_invitations REPLICA IDENTITY FULL;
END $$;

