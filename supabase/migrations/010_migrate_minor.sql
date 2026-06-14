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
  elem->>'name' as name,
  elem->>'description' as description
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