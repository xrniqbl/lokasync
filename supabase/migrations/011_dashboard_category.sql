-- ═══════════════════════════════════════════════════════════════════════════════
-- Alter workspace_dashboard to support category column (ops vs details)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workspace_dashboard ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'ops';

-- Drop old unique constraint and add composite unique key
ALTER TABLE workspace_dashboard DROP CONSTRAINT IF EXISTS workspace_dashboard_workspace_id_key;
ALTER TABLE workspace_dashboard ADD CONSTRAINT workspace_dashboard_workspace_category_key UNIQUE (workspace_id, category);
