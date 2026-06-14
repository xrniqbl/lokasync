-- ═══════════════════════════════════════════════════════════════════════════════
-- 023_fix_profiles_schema.sql
-- Reconciles the `profiles` table with what the backend code actually reads/writes.
-- 013 created profiles with first_name/last_name only; the server (GET/PUT /profile,
-- onboarding) reads/writes full_name, job_title, company, created_at.
-- This adds the missing columns and backfills full_name from first/last where present.
-- Safe to run multiple times (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name  TEXT,
  ADD COLUMN IF NOT EXISTS job_title  TEXT,
  ADD COLUMN IF NOT EXISTS company    TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Backfill full_name for rows that only have first_name/last_name.
UPDATE profiles
SET full_name = NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
WHERE full_name IS NULL
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- Backfill created_at for existing rows from updated_at if available.
UPDATE profiles
SET created_at = COALESCE(created_at, updated_at, now())
WHERE created_at IS NULL;
