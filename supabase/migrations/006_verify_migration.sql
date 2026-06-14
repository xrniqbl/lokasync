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
