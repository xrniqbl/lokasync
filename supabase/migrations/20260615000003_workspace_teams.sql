-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — workspace_teams & workspace_team_members
--
-- Adds two tables so team data can be stored relationally per workspace,
-- replacing the old KV-store approach. RLS policies use inline EXISTS checks
-- against workspace_members so there is no dependency on helper functions that
-- may or may not already exist in the target database.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── workspace_teams ───────────────────────────────────────────────────────────
create table if not exists public.workspace_teams (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  name          text        not null,
  description   text        not null default '',
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists workspace_teams_workspace_id_idx
  on public.workspace_teams (workspace_id);

-- ── workspace_team_members ────────────────────────────────────────────────────
create table if not exists public.workspace_team_members (
  id            uuid        primary key default gen_random_uuid(),
  team_id       uuid        not null references public.workspace_teams(id) on delete cascade,
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  initials      text        not null,
  name          text        not null,
  role          text        not null default 'member',
  status        text        not null default 'online'
                              check (status in ('online','away','offline')),
  tasks         integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists workspace_team_members_team_id_idx
  on public.workspace_team_members (team_id);
create index if not exists workspace_team_members_workspace_id_idx
  on public.workspace_team_members (workspace_id);

-- ── updated_at auto-touch for workspace_teams ─────────────────────────────────
drop trigger if exists workspace_teams_touch_updated_at on public.workspace_teams;
create trigger workspace_teams_touch_updated_at
  before update on public.workspace_teams
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- NOTE: The Edge Function uses the service-role key (bypasses RLS), so these
-- policies are the safety backstop for any direct client-side access.
-- We use inline EXISTS queries instead of helper functions to avoid any
-- signature-mismatch errors on databases where helper functions may differ.

alter table public.workspace_teams     enable row level security;
alter table public.workspace_team_members enable row level security;

-- workspace_teams: any active workspace member can read
drop policy if exists "members read their workspace teams" on public.workspace_teams;
create policy "members read their workspace teams"
  on public.workspace_teams for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_teams.workspace_id
        and wm.user_id      = auth.uid()
        and wm.status       = 'active'
    )
  );

-- workspace_teams: only owner/admin can write
drop policy if exists "admins manage workspace teams" on public.workspace_teams;
create policy "admins manage workspace teams"
  on public.workspace_teams for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_teams.workspace_id
        and wm.user_id      = auth.uid()
        and wm.status       = 'active'
        and wm.role in ('owner', 'admin')
    )
  );

-- workspace_team_members: any active workspace member can read
drop policy if exists "members read workspace team members" on public.workspace_team_members;
create policy "members read workspace team members"
  on public.workspace_team_members for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_team_members.workspace_id
        and wm.user_id      = auth.uid()
        and wm.status       = 'active'
    )
  );

-- workspace_team_members: only owner/admin can write
drop policy if exists "admins manage workspace team members" on public.workspace_team_members;
create policy "admins manage workspace team members"
  on public.workspace_team_members for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_team_members.workspace_id
        and wm.user_id      = auth.uid()
        and wm.status       = 'active'
        and wm.role in ('owner', 'admin')
    )
  );
