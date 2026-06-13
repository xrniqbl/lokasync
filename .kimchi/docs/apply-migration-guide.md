# Apply Migration: KV → SQL + Realtime

## Step 1: Run Schema + RLS + Realtime

Open **Supabase Dashboard → SQL Editor** and run:

```sql
-- Copy entire contents of:
-- 001_relational_schema.sql
-- 002_rls_policies.sql
-- 003_enable_realtime.sql
```

Or use the combined file (faster, one copy-paste):
```sql
\i supabase/migrations/005_combined_migrate.sql
```

## Step 2: Migrate Data from KV to SQL

Run the migration script:

```sql
\i supabase/migrations/004_migrate_kv_to_sql.sql
```

This copies all existing workspace data from `kv_store_827698a1` into the new relational tables.

## Step 3: Verify

Run the verification queries:

```sql
\i supabase/migrations/006_verify_migration.sql
```

Expected: row counts should match your KV data. All tables listed in query #5 should appear under the `supabase_realtime` publication.

## Step 4: Cutover (Backend Code)

Core endpoints are already SQL-only in this branch:
- `GET /tasks`, `POST /tasks`, `PUT /tasks/:id`, `DELETE /tasks/:id`
- `GET /projects`, `POST /projects`, `PUT /projects/:id`, `DELETE /projects/:id`
- `GET /workspaces`
- `GET /member-home`
- `GET /analytics/metrics`

Deploy the Edge Functions after merging this branch:
```bash
npx supabase functions deploy server
```

## Step 5: Frontend Build

Build passes cleanly:
```bash
npx vite build
```

## Step 6: E2E Realtime Test

1. Open LokaSync in two browser tabs
2. Create a task in Tab A
3. Tab B should show the new task within 2 seconds (no refresh needed)

## Backlog (Future Work)

Endpoints still on KV (they need new SQL tables before cutover):
- `/teams` — no `teams` table yet
- `/files` (storage upload) — files table exists but upload endpoint still writes KV metadata
- `/settings` — no `workspace_settings` table
- `/financial` — no `workspace_financial` table
- `/integrations` — no `workspace_integrations` table
- `/sessions` — no `workspace_sessions` table
- `/dashboard/ops` — no `workspace_dashboard` table
