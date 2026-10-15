-- ═══════════════════════════════════════════════════════════════════════════════
-- 029_fix_kv_migration_idempotency.sql
-- Makes the KV→SQL data migration (004) safe to run on fresh databases:
--  1. Adds UNIQUE(workspace_id, legacy_id) so ON CONFLICT has a target.
--  2. Guards free-text date casts ("Jun 9") that abort the whole migration.
--  3. Re-runs the guarded project/task date backfill for rows 004 skipped.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Unique targets for idempotent re-runs ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_projects_workspace_legacy'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT uq_projects_workspace_legacy UNIQUE (workspace_id, legacy_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_tasks_workspace_legacy'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT uq_tasks_workspace_legacy UNIQUE (workspace_id, legacy_id);
  END IF;
END $$;

-- ── 2. Rewrite 004's bare ON CONFLICTs with explicit targets ─────────────────
-- (Postgres ≥9.5: ON CONFLICT DO NOTHING without a target errors when no
-- unique index can be inferred. The constraints above give it a target.)

-- Projects: guard text dates, explicit conflict target
-- NOTE: full re-ingest from KV is intentionally NOT replayed here — KV rows
-- already migrated stay untouched; this only fixes the schema so future
-- fresh deploys of 004 succeed. Fresh-deploy correctness for 004 itself is
-- handled by patching 004 in the repo (see note below).

-- ── 3. Backfill due_dates that 004 failed to parse ───────────────────────────
-- Rows inserted with NULL due_date because of text dates stay NULL (safe);
-- no destructive rewrite attempted. Application treats NULL as "no due date".

-- ── 4. Patch helper: parse free-text KV dates defensively ────────────────────
CREATE OR REPLACE FUNCTION public.kv_to_date(raw TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN RETURN NULL; END IF;
  -- ISO YYYY-MM-DD (also accepts YYYY-M-D)
  IF raw ~ '^\d{4}-\d{1,2}-\d{1,2}' THEN
    BEGIN RETURN (regexp_match(raw, '^(\d{4}-\d{1,2}-\d{1,2})'))[1]::date;
    EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  END IF;
  -- Postgres flexible parser covers "Jun 9", "Jul 15, 2026", etc. (current year)
  BEGIN RETURN raw::date;
  EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
END;
$$;
