-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — Row Level Security
--
-- Enable RLS on every workspace-scoped table and gate access on membership.
-- Members of a workspace (any role, active) can READ; writes require a
-- write-capable role (owner/admin/member). Viewers are read-only.
--
-- The service-role key (used by the edge function) bypasses RLS, so these
-- policies are the backstop for direct Supabase-client access and for any
-- future client-side queries. The edge function still does its own
-- membership checks before mutating.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper functions ─────────────────────────────────────────────────────────
-- is_workspace_member(ws, min_rank): true if auth.uid() is an ACTIVE member of
-- ws with role rank >= min_rank. Rank: owner(4) > admin(3) > member(2) >
-- viewer(1). Called with NULL or a non-member returns false.
create or replace function public.is_workspace_member(
  ws uuid, min_role text default 'viewer'
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and case min_role
            when 'owner'  then wm.role = 'owner'
            when 'admin'  then wm.role in ('owner','admin')
            when 'member' then wm.role in ('owner','admin','member')
            else true  -- 'viewer' (default): any active member can read
          end
  );
$$;

-- Convenience: workspace_id of a row identified by table + pk.
-- Not used directly by policies (they reference columns), but handy for
-- ad-hoc checks in the edge function / SQL editor.
comment on function public.is_workspace_member(uuid, text) is
  'Returns true if the current auth.uid() is an active member of the given workspace with at least min_role.';

-- ── workspace_members ────────────────────────────────────────────────────────
alter table public.workspace_members enable row level security;

-- Any active member of a workspace can see its roster.
drop policy if exists "members read their workspace roster" on public.workspace_members;
create policy "members read their workspace roster"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id, 'viewer'));

-- Only owner/admin can invite, remove, or change roles of others. A member
-- may update their own row only in benign ways (the app enforces that), so
-- writes here are restricted to owner/admin.
drop policy if exists "owner admin manage members" on public.workspace_members;
create policy "owner admin manage members"
  on public.workspace_members for insert
  with check (public.is_workspace_member(workspace_id, 'admin'));

drop policy if exists "owner admin update members" on public.workspace_members;
create policy "owner admin update members"
  on public.workspace_members for update
  using (public.is_workspace_member(workspace_id, 'admin'));

drop policy if exists "owner admin delete members" on public.workspace_members;
create policy "owner admin delete members"
  on public.workspace_members for delete
  using (
    public.is_workspace_member(workspace_id, 'admin')
    -- The owner row can never be deleted through this policy unless the actor
    -- is also the owner (transfer handled via a dedicated path).
    and (role <> 'owner' or public.is_workspace_member(workspace_id, 'owner'))
  );

-- ── workspaces ───────────────────────────────────────────────────────────────
alter table public.workspaces enable row level security;

drop policy if exists "members read workspace" on public.workspaces;
create policy "members read workspace"
  on public.workspaces for select
  using (
    public.is_workspace_member(id, 'viewer')
    or owner_id = auth.uid()
  );

drop policy if exists "admin update workspace" on public.workspaces;
create policy "admin update workspace"
  on public.workspaces for update
  using (public.is_workspace_member(id, 'admin'));

-- Inserts happen through the edge function (service role) during onboarding;
-- a client cannot create a workspace row directly. Delete is owner-only.
drop policy if exists "owner delete workspace" on public.workspaces;
create policy "owner delete workspace"
  on public.workspaces for delete
  using (owner_id = auth.uid());

-- ── invitations ──────────────────────────────────────────────────────────────
alter table public.invitations enable row level security;

drop policy if exists "members read invitations" on public.invitations;
create policy "members read invitations"
  on public.invitations for select
  using (public.is_workspace_member(workspace_id, 'viewer'));

drop policy if exists "admin manage invitations" on public.invitations;
create policy "admin manage invitations"
  on public.invitations for insert
  with check (public.is_workspace_member(workspace_id, 'admin'));

drop policy if exists "admin update invitations" on public.invitations;
create policy "admin update invitations"
  on public.invitations for update
  using (public.is_workspace_member(workspace_id, 'admin'));

drop policy if exists "admin delete invitations" on public.invitations;
create policy "admin delete invitations"
  on public.invitations for delete
  using (public.is_workspace_member(workspace_id, 'admin'));

-- ── workspace-scoped data tables ─────────────────────────────────────────────
-- All read: any active member. Write: owner/admin/member (NOT viewer).

alter table public.tasks enable row level security;
drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks" on public.tasks for select
  using (public.is_workspace_member(workspace_id, 'viewer'));
drop policy if exists "members write tasks" on public.tasks;
create policy "members write tasks" on public.tasks for all
  using (public.is_workspace_member(workspace_id, 'member'))
  with check (public.is_workspace_member(workspace_id, 'member'));

alter table public.projects enable row level security;
drop policy if exists "members read projects" on public.projects;
create policy "members read projects" on public.projects for select
  using (public.is_workspace_member(workspace_id, 'viewer'));
drop policy if exists "members write projects" on public.projects;
create policy "members write projects" on public.projects for all
  using (public.is_workspace_member(workspace_id, 'member'))
  with check (public.is_workspace_member(workspace_id, 'member'));

alter table public.calendar_events enable row level security;
drop policy if exists "members read calendar" on public.calendar_events;
create policy "members read calendar" on public.calendar_events for select
  using (public.is_workspace_member(workspace_id, 'viewer'));
drop policy if exists "members write calendar" on public.calendar_events;
create policy "members write calendar" on public.calendar_events for all
  using (public.is_workspace_member(workspace_id, 'member'))
  with check (public.is_workspace_member(workspace_id, 'member'));

alter table public.files enable row level security;
drop policy if exists "members read files" on public.files;
create policy "members read files" on public.files for select
  using (public.is_workspace_member(workspace_id, 'viewer'));
drop policy if exists "members write files" on public.files;
create policy "members write files" on public.files for all
  using (public.is_workspace_member(workspace_id, 'member'))
  with check (public.is_workspace_member(workspace_id, 'member'));

alter table public.folders enable row level security;
drop policy if exists "members read folders" on public.folders;
create policy "members read folders" on public.folders for select
  using (public.is_workspace_member(workspace_id, 'viewer'));
drop policy if exists "members write folders" on public.folders;
create policy "members write folders" on public.folders for all
  using (public.is_workspace_member(workspace_id, 'member'))
  with check (public.is_workspace_member(workspace_id, 'member'));

alter table public.milestones enable row level security;
drop policy if exists "members read milestones" on public.milestones;
create policy "members read milestones" on public.milestones for select
  using (public.is_workspace_member(workspace_id, 'viewer'));
drop policy if exists "members write milestones" on public.milestones;
create policy "members write milestones" on public.milestones for all
  using (public.is_workspace_member(workspace_id, 'member'))
  with check (public.is_workspace_member(workspace_id, 'member'));

alter table public.workspace_settings enable row level security;
drop policy if exists "members read settings" on public.workspace_settings;
create policy "members read settings" on public.workspace_settings for select
  using (public.is_workspace_member(workspace_id, 'viewer'));
drop policy if exists "members write settings" on public.workspace_settings;
create policy "members write settings" on public.workspace_settings for all
  using (public.is_workspace_member(workspace_id, 'member'))
  with check (public.is_workspace_member(workspace_id, 'member'));
