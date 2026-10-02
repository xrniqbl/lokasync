-- ═══════════════════════════════════════════════════════════════════════════════
-- 026_file_sharing.sql
-- Adds the `shared` / `archived` flags the frontend already renders (Shared tab,
-- Archived tab, "Restore all"). The files table (001) never had these columns,
-- so GET /files returned `false` for every row via `?? false` fallbacks and the
-- Restore button had no endpoint to call. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_files_archived ON files(workspace_id, archived);
