-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — extend Supabase Realtime to team membership tables
--
-- The Teams page is collaborative too: invites, role changes and member
-- additions should appear for every workspace member without a refresh. This
-- adds the team-related tables to the `supabase_realtime` publication. RLS
-- (enabled in earlier migrations) still scopes events to rows a subscriber may
-- read. Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array['workspace_teams', 'workspace_team_members', 'workspace_members'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end$$;

-- REPLICA IDENTITY FULL so UPDATE/DELETE events carry the full old row.
alter table public.workspace_teams        replica identity full;
alter table public.workspace_team_members replica identity full;
alter table public.workspace_members      replica identity full;
