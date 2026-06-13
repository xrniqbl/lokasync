# Minor Endpoint Cutover Plan

## New Tables

| # | Table | Type | Purpose |
|---|-------|------|---------|
| 1 | `teams` | Relational | Workspace teams |
| 2 | `team_members` | Relational | Members inside each team |
| 3 | `workspace_settings` | JSONB/section | Settings per section (profile, workspace, notifications, etc.) |
| 4 | `workspace_financial` | JSONB/single | Financial charts + KPIs |
| 5 | `workspace_integrations` | Relational | Integration list |
| 6 | `workspace_sessions` | JSONB/single | Active sessions + login history |
| 7 | `workspace_dashboard` | JSONB/single | Ops dashboard data |
| 8 | `workspace_analytics` | JSONB/single | Analytics series + metrics |

### Relational Tables Detail

#### `teams`
```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `team_members`
```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  initials TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  tasks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `workspace_integrations`
```sql
CREATE TABLE workspace_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  connected BOOLEAN DEFAULT false,
  last_sync TEXT,
  scopes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, name)
);
```

### JSONB Tables Detail

#### `workspace_settings`
```sql
CREATE TABLE workspace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, section)
);
```

#### `workspace_financial`
```sql
CREATE TABLE workspace_financial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `workspace_sessions`
```sql
CREATE TABLE workspace_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `workspace_dashboard`
```sql
CREATE TABLE workspace_dashboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `workspace_analytics`
```sql
CREATE TABLE workspace_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## RLS Policies Pattern

```sql
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_select ON teams FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY teams_insert ON teams FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY teams_update ON teams FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY teams_delete ON teams FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = teams.workspace_id AND m.user_id = auth.uid()));
```

Same pattern for `team_members`, `workspace_integrations`, `workspace_settings`, `workspace_financial`, `workspace_sessions`, `workspace_dashboard`, `workspace_analytics`.

## Realtime

All new tables added to `supabase_realtime` publication with `REPLICA IDENTITY FULL`.

## Backend Cutover Map

| Endpoint | Tables | Action |
|----------|--------|--------|
| GET /teams | teams, team_members | SQL SELECT JOIN |
| POST /teams/invite | team_members | SQL INSERT |
| PUT /teams/member | team_members | SQL UPDATE |
| DELETE /teams/member | team_members | SQL DELETE |
| POST /files/upload | files | SQL INSERT (already have table) |
| POST /files/folders | file_folders | SQL INSERT (already have table) |
| GET /settings/:section | workspace_settings | SQL SELECT by section |
| PUT /settings/:section | workspace_settings | SQL UPSERT (INSERT ... ON CONFLICT UPDATE) |
| GET /financial | workspace_financial | SQL SELECT |
| PUT /financial | workspace_financial | SQL UPSERT |
| GET /integrations | workspace_integrations | SQL SELECT |
| PUT /integrations/:name | workspace_integrations | SQL UPDATE |
| GET /sessions | workspace_sessions | SQL SELECT |
| DELETE /sessions/:device | workspace_sessions | SQL UPDATE (remove from JSONB array) |
| GET /dashboard/ops | workspace_dashboard | SQL SELECT |
| PUT /dashboard/ops | workspace_dashboard | SQL UPSERT |
| GET /analytics/metrics | workspace_analytics + tasks/projects live counts | SQL SELECT + live query merge |
| PUT /analytics/metrics | workspace_analytics | SQL UPSERT |

## Migration Script (007)

For each endpoint, copy KV data into new tables. Teams and integrations can be migrated with `jsonb_array_elements`. JSONB tables (financial, sessions, dashboard, analytics, settings) can be migrated with simple `INSERT SELECT`.

## Build Order

1. Schema migration (new tables + indexes + triggers)
2. RLS policies migration
3. Realtime enable migration
4. Data migration script
5. Backend cutover (index.tsx edits)
6. Verification queries
7. Build check

## Acceptance Criteria

- [ ] All 8 new tables exist in database
- [ ] All RLS policies active (31 + new policies)
- [ ] All new tables in Realtime publication
- [ ] GET /teams returns SQL data with nested members
- [ ] POST/PUT/DELETE /teams writes SQL only
- [ ] GET /settings/:section returns SQL data
- [ ] PUT /settings/:section writes SQL only
- [ ] GET /financial, /integrations, /sessions, /dashboard/ops return SQL data
- [ ] PUT endpoints write SQL only (no KV.set)
- [ ] POST /files/upload writes to SQL `files` table only
- [ ] Build: vite build passes + tsc no errors
