# LokaSync SQL Architecture

## Overview

LokaSync has migrated from a single-table KV JSONB store (`kv_store_827698a1`) to a normalized relational PostgreSQL schema. This document describes the new architecture:

- Table definitions
- Row Level Security (RLS) policies
- Supabase Realtime channel naming
- Dual-write transition plan
- Migration process

---

## Relational Schema

### Core Entities

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workspaces` | Workspace identity and ownership | `id` UUID PK, `name`, `owner_id`, `plan_id` |
| `workspace_members` | Many-to-many: users ↔ workspaces | `(workspace_id, user_id)` composite PK |
| `projects` | Workspace-scoped projects | `id` UUID PK, `workspace_id` FK, `legacy_id` |
| `tasks` | Tasks inside projects/workspaces | `id` UUID PK, `workspace_id` FK, `project_id` FK, `legacy_id` |
| `calendar_events` | Scheduled events | `id` UUID PK, `workspace_id` FK, `start_time` |
| `mentions` | @mentions and assignments | `id` UUID PK, `workspace_id` FK, `mentionee`, `read` |
| `team_activity` | Audit log of actions | `id` UUID PK, `workspace_id` FK, `actor`, `action`, `target` |
| `file_folders` | Folder hierarchy | `id` UUID PK, `workspace_id` FK, `parent_id` self-FK |
| `files` | File metadata (not blobs) | `id` UUID PK, `workspace_id` FK, `folder_id` FK, `storage_path` |

### Indexes

All tenant tables have `idx_{table}_workspace` on `workspace_id`. Tasks additionally indexes `project_id`, `assignee`, `status`, `priority`.

---

## Row Level Security

Every tenant table has `ENABLE ROW LEVEL SECURITY`. The `anon` key frontend client enforces these policies. Edge Functions use `service_role` and bypass RLS (intentional — they are trusted).

### Policy Pattern

```sql
CREATE POLICY tasks_select ON tasks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = tasks.workspace_id
      AND workspace_members.user_id = auth.uid()
  ));
```

All `SELECT/INSERT/UPDATE` policies use the same `EXISTS(workspace_members)` pattern.
`DELETE` policies on `projects` and `tasks` additionally require `role = 'owner'`.

### Workspaces Table

Special rules:
- Owner-specific: `owner_id = auth.uid()` for update/delete
- Member-readable: any workspace where the user has a `workspace_members` row

---

## Supabase Realtime

### Publication

All 9 tenant tables are added to `supabase_realtime` publication with `REPLICA IDENTITY FULL`. This means every `INSERT/UPDATE/DELETE` broadcasts the full old + new row.

### Channel Naming

| Channel | Audience | Events |
|---------|----------|--------|
| `workspace:{id}` | All members of workspace | `refresh` with payload `{ table }` |

### Broadcast Trigger

After every successful write (POST/PUT/DELETE), Edge Functions call:

```ts
await broadcastAfterWrite(workspace.id, "tasks");
```

This sends a lightweight `refresh` event to the `workspace:{id}` channel. Frontend hooks (`useRealtimeWorkspace`) receive the event and re-fetch the relevant data.

### Why Not Postgres Changes?

We use broadcast (not direct Postgres Changes) because:
1. **Business logic control** — backend decides when/how to broadcast
2. **Payload shape** — broadcast carries `table` name, not raw SQL row
3. **Backward compatibility** — easy to add/remove without schema changes

---

## Dual-Write Transition

### Current State (Phase 2-3 Complete)

```
┌─────────────┐     POST/PUT/DELETE     ┌──────────────┐
│   Frontend  │ ───────────────────────→│ Edge Function│
│             │                         │              │
│  (polling   │ ←────────────────────── │  dual-write  │
│   removed)  │     Realtime broadcast  │  SQL + KV    │
└─────────────┘                         └──────┬───────┘
       ↑                                       │
       │         broadcast: refresh            │
       └───────────────────────────────────────┘
```

### Endpoint Matrix

| Route | Read | Write | Broadcast |
|-------|------|-------|-----------|
| GET /tasks | SQL → KV fallback | — | — |
| POST/PUT/DELETE /tasks | — | SQL + KV | tasks |
| GET /projects | SQL → KV fallback | — | — |
| POST/PUT/DELETE /projects | — | SQL + KV | projects |
| GET /calendar | KV only* | — | — |
| POST/DELETE /calendar/events | — | SQL + KV | calendar_events |
| GET /files | KV only* | — | — |
| POST/PUT/DELETE /files | — | SQL + KV | files |
| GET /workspaces | SQL | — | — |
| POST/PUT/DELETE /workspaces | — | SQL + KV | workspaces |

> *Calendar and files GET remain KV-only during transition because there is no stable `legacy_id` mapping for SQL↔KV event/file rows.

---

## Migration Script

File: `supabase/migrations/004_migrate_kv_to_sql.sql`

### Steps

1. **Workspaces** — copy from `workspace:{id}` keys
2. **Members** — expand `ws_members:{id}` arrays into rows
3. **Projects** — copy from `ws:{id}:projects:list`
4. **Tasks** — copy from `ws:{id}:tasks:list`; resolve `project_id` by LATERAL JOIN
5. **Calendar** — expand date-keyed objects into events
6. **Mentions / Activity** — copy arrays
7. **Files / Folders** — copy arrays; resolve `folder_id`

All INSERT statements use `ON CONFLICT DO NOTHING` for idempotency.

### How to Run

Execute via Supabase SQL Editor (Dashboard → Database → SQL Editor):

```sql
\i supabase/migrations/004_migrate_kv_to_sql.sql
```

Or use `psql`:
```bash
psql $SUPABASE_DB_URL -f supabase/migrations/004_migrate_kv_to_sql.sql
```

### Verification Query

```sql
SELECT
  (SELECT count(*) FROM tasks) as tasks,
  (SELECT count(*) FROM projects) as projects,
  (SELECT count(*) FROM calendar_events) as events,
  (SELECT count(*) FROM mentions) as mentions,
  (SELECT count(*) FROM files) as files;
```

---

## Cutover Checklist (Phase 5)

After migration:

- [ ] Run `004_migrate_kv_to_sql.sql` in production
- [ ] Verify row counts match KV counts
- [ ] Switch GET /calendar and GET /files to SQL-first (add mapping)
- [ ] Remove KV write fallback from POST/PUT/DELETE handlers
- [ ] Deploy Edge Functions
- [ ] Test E2E: open 2 tabs, create task → Tab 2 should update within 2s
- [ ] Update `useMemberHome` polling → Realtime

---

## Files

| # | File | Purpose |
|---|------|---------|
| 1 | `migrations/001_relational_schema.sql` | DDL: 9 tables, FKs, indexes, triggers |
| 2 | `migrations/002_rls_policies.sql` | 31 RLS policies |
| 3 | `migrations/003_enable_realtime.sql` | Publication + replica identity |
| 4 | `migrations/004_migrate_kv_to_sql.sql` | Data migration from KV |
| 5 | `functions/server/sql_client.tsx` | Supabase JS client wrapper |
| 6 | `functions/server/index.tsx` | All endpoints (dual-write + broadcast) |
| 7 | `src/app/realtime/useRealtimeWorkspace.tsx` | Frontend Realtime subscription hook |
