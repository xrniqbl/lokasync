-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — multi-tenant workspace schema
--
-- Replaces the single global KV store (`kv_store_827698a1`) with properly
-- relational, per-workspace tables. All workspace-scoped data carries a
-- `workspace_id` foreign key and is gated by Row Level Security based on
-- `workspace_members` membership (see 20260615000002_enable_rls_policies.sql).
--
-- User-scoped data that is NOT workspace-scoped (profile, subscription,
-- transactions, notification reads) stays in the KV store for now.
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions ──────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ── workspaces ───────────────────────────────────────────────────────────────
-- A workspace (tenant). The owner is the user who created it; ownership can
-- later be transferred by updating owner_id (see role policy).
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  slug        text unique,
  industry    text,
  team_size   text,
  region      text,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Drift safety net: reconcile a pre-existing workspaces table from the
-- earlier schema to the current column set.
alter table public.workspaces add column if not exists name       text;
alter table public.workspaces add column if not exists slug       text;
alter table public.workspaces add column if not exists industry   text;
alter table public.workspaces add column if not exists team_size  text;
alter table public.workspaces add column if not exists region     text;
alter table public.workspaces add column if not exists owner_id   uuid;
alter table public.workspaces add column if not exists created_at timestamptz not null default now();
alter table public.workspaces add column if not exists updated_at timestamptz not null default now();

create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);

-- ── workspace_members ────────────────────────────────────────────────────────
-- Junction between users and workspaces, carrying role + status.
-- `user_id` is nullable so an invited (but not-yet-registered) email can be
-- pre-seated; once they accept the invitation the row is linked to their id.
create table if not exists public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  email         text,
  role          text not null default 'member'
                  check (role in ('owner','admin','member','viewer')),
  status        text not null default 'active'
                  check (status in ('active','invited','removed')),
  joined_at     timestamptz not null default now(),
  -- A user (by identity or email) can only appear once per workspace.
  unique (workspace_id, user_id),
  unique (workspace_id, email)
);

create index if not exists workspace_members_workspace_id_idx
  on public.workspace_members(workspace_id);
create index if not exists workspace_members_user_id_idx
  on public.workspace_members(user_id);

-- Drift safety net: reconcile a pre-existing workspace_members table from the
-- earlier schema to the current column set. The RLS migration's
-- is_workspace_member() function reads workspace_id / user_id / status / role,
-- so all of these must exist before 000002 runs.
alter table public.workspace_members add column if not exists workspace_id uuid;
alter table public.workspace_members add column if not exists user_id    uuid;
alter table public.workspace_members add column if not exists email      text;
alter table public.workspace_members add column if not exists role       text not null default 'member';
alter table public.workspace_members add column if not exists status     text not null default 'active';
alter table public.workspace_members add column if not exists joined_at  timestamptz not null default now();
alter table public.workspace_members drop constraint if exists workspace_members_identity_check;
-- At least one of user_id / email must be present.
alter table public.workspace_members
  add constraint workspace_members_identity_check
  check (user_id is not null or (email is not null and length(trim(email)) > 0));

-- ── invitations ──────────────────────────────────────────────────────────────
-- Token-based invites. The accept flow looks up the opaque token, verifies it
-- is still pending & unexpired, then inserts/links a workspace_members row.
create table if not exists public.invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         text not null,
  role          text not null default 'member'
                  check (role in ('owner','admin','member','viewer')),
  token         text not null unique,
  invited_by    uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','accepted','expired','revoked')),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  unique (workspace_id, email)
);

-- Same drift safety net as workspace_members: reconcile a pre-existing
-- invitations table to the current column set so the RLS migration (000002)
-- can create policies on it without "column ... does not exist" errors.
alter table public.invitations add column if not exists workspace_id uuid;
alter table public.invitations add column if not exists email      text;
alter table public.invitations add column if not exists role       text not null default 'member';
alter table public.invitations add column if not exists token      text;
alter table public.invitations add column if not exists invited_by uuid;
alter table public.invitations add column if not exists status     text not null default 'pending';
alter table public.invitations add column if not exists expires_at timestamptz;
alter table public.invitations add column if not exists created_at timestamptz not null default now();
alter table public.invitations add column if not exists accepted_at timestamptz;

create index if not exists invitations_workspace_id_idx
  on public.invitations(workspace_id);
create index if not exists invitations_status_idx on public.invitations(status);

-- ── workspace-scoped application data ────────────────────────────────────────
-- Each table mirrors the shape the KV store held, but adds workspace_id so
-- data is isolated per tenant. IDs switch from autoincrement int to uuid to
-- avoid collisions across workspaces.

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  status        text not null default 'todo',
  priority      text not null default 'medium',
  assignee      text,
  project       text,
  due           text,
  completed     boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Drift safety net for tasks.
alter table public.tasks add column if not exists workspace_id uuid;
alter table public.tasks add column if not exists title        text;
alter table public.tasks add column if not exists description  text not null default '';
alter table public.tasks add column if not exists status       text not null default 'todo';
alter table public.tasks add column if not exists priority     text not null default 'medium';
alter table public.tasks add column if not exists assignee     text;
alter table public.tasks add column if not exists project      text;
alter table public.tasks add column if not exists due          text;
alter table public.tasks add column if not exists completed    boolean not null default false;
alter table public.tasks add column if not exists created_by   uuid;
alter table public.tasks add column if not exists created_at   timestamptz not null default now();
alter table public.tasks add column if not exists updated_at   timestamptz not null default now();

create index if not exists tasks_workspace_id_idx on public.tasks(workspace_id);

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  description   text not null default '',
  status        text not null default 'active',
  progress      integer not null default 0,
  tasks         jsonb not null default '{"total":0,"done":0}',
  team          text[] not null default '{}',
  due           text,
  tags          text[] not null default '{}',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Drift safety net for projects.
alter table public.projects add column if not exists workspace_id uuid;
alter table public.projects add column if not exists name         text;
alter table public.projects add column if not exists description  text not null default '';
alter table public.projects add column if not exists status       text not null default 'active';
alter table public.projects add column if not exists progress     integer not null default 0;
alter table public.projects add column if not exists tasks        jsonb not null default '{"total":0,"done":0}';
alter table public.projects add column if not exists team         text[] not null default '{}';
alter table public.projects add column if not exists due          text;
alter table public.projects add column if not exists tags         text[] not null default '{}';
alter table public.projects add column if not exists created_by   uuid;
alter table public.projects add column if not exists created_at   timestamptz not null default now();
alter table public.projects add column if not exists updated_at   timestamptz not null default now();

create index if not exists projects_workspace_id_idx on public.projects(workspace_id);

create table if not exists public.calendar_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  date_key      text not null,          -- e.g. "2026-6-8"
  title         text not null,
  tag           text,
  color         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
-- Drift safety net: a pre-existing calendar_events table (from an earlier
-- schema) may be missing date_key, which would break the index below.
alter table public.calendar_events add column if not exists workspace_id uuid;
alter table public.calendar_events add column if not exists date_key      text;
alter table public.calendar_events add column if not exists title         text;
alter table public.calendar_events add column if not exists tag           text;
alter table public.calendar_events add column if not exists color         text;
alter table public.calendar_events add column if not exists created_by    uuid;
alter table public.calendar_events add column if not exists created_at    timestamptz not null default now();

create index if not exists calendar_events_workspace_date_idx
  on public.calendar_events(workspace_id, date_key);

create table if not exists public.files (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  type          text,
  size          text,
  modified      text,
  owner         text,
  shared        boolean not null default false,
  archived      boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
-- Drift safety net for files.
alter table public.files add column if not exists workspace_id uuid;
alter table public.files add column if not exists name         text;
alter table public.files add column if not exists type         text;
alter table public.files add column if not exists size         text;
alter table public.files add column if not exists modified     text;
alter table public.files add column if not exists owner        text;
alter table public.files add column if not exists shared       boolean not null default false;
alter table public.files add column if not exists archived     boolean not null default false;
alter table public.files add column if not exists created_by   uuid;
alter table public.files add column if not exists created_at   timestamptz not null default now();

create index if not exists files_workspace_id_idx on public.files(workspace_id);

create table if not exists public.folders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  modified      text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
-- Drift safety net for folders.
alter table public.folders add column if not exists workspace_id uuid;
alter table public.folders add column if not exists name         text;
alter table public.folders add column if not exists modified     text;
alter table public.folders add column if not exists created_by   uuid;
alter table public.folders add column if not exists created_at   timestamptz not null default now();

create index if not exists folders_workspace_id_idx on public.folders(workspace_id);

create table if not exists public.milestones (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  project       text not null,
  milestone     text not null,
  "date"        text,
  done          boolean not null default false,
  created_at    timestamptz not null default now()
);
-- Drift safety net for milestones.
alter table public.milestones add column if not exists workspace_id uuid;
alter table public.milestones add column if not exists project    text;
alter table public.milestones add column if not exists milestone  text;
alter table public.milestones add column if not exists "date"     text;
alter table public.milestones add column if not exists done       boolean not null default false;
alter table public.milestones add column if not exists created_at timestamptz not null default now();

create index if not exists milestones_workspace_project_idx
  on public.milestones(workspace_id, project);

-- Per-workspace settings blobs (one row per section). Kept as jsonb because
-- these are loose key/value settings (appearance, timezone, notifications…).
create table if not exists public.workspace_settings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  section       text not null,          -- 'notifications' | 'appearance' | …
  data          jsonb not null default '{}',
  updated_at    timestamptz not null default now(),
  unique (workspace_id, section)
);
-- Drift safety net for workspace_settings.
alter table public.workspace_settings add column if not exists workspace_id uuid;
alter table public.workspace_settings add column if not exists section     text;
alter table public.workspace_settings add column if not exists data        jsonb not null default '{}';
alter table public.workspace_settings add column if not exists updated_at  timestamptz not null default now();

create index if not exists workspace_settings_workspace_id_idx
  on public.workspace_settings(workspace_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
-- Keep updated_at honest on tables that expose PUT endpoints.

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array['workspaces','tasks','projects','workspace_settings'])
  loop
    execute format(
      'drop trigger if exists %1$I_touch_updated_at on public.%1$I;', t
    );
    execute format(
      'create trigger %1$I_touch_updated_at before update on public.%1$I ' ||
      'for each row execute function public.touch_updated_at();', t
    );
  end loop;
end$$;
