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
  elem->>'due' as due_date,  -- stored as text in KV; may need manual cleanup
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
  elem->>'due' as due_date,
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
  (regexp_match(t.key, '^ws:([^:]+):calendar:events$'))[1]::UUID as workspace_id,
  elem->>'title',
  (CASE
    WHEN regexp_match(date_keys.date_key, '^(\d+)-(\d+)-(\d+)$') IS NOT NULL THEN
      TO_TIMESTAMP(
        regexp_match(date_keys.date_key, '^(\d+)-(\d+)-(\d+)$')[1] || '-' ||
        lpad(regexp_match(date_keys.date_key, '^(\d+)-(\d+)-(\d+)$')[2], 2, '0') || '-' ||
        lpad(regexp_match(date_keys.date_key, '^(\d+)-(\d+)-(\d+)$')[3], 2, '0') || ' ' ||
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
