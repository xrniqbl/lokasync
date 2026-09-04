-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — enable Supabase Realtime for collaborative tables
--
-- Adds the core workspace-scoped tables to the `supabase_realtime` publication
-- so the client receives INSERT/UPDATE/DELETE change events. Row Level Security
-- (already enabled in 000002) still applies to realtime: a subscriber only
-- receives change events for rows they're allowed to read — i.e. rows in a
-- workspace they're an active member of. Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array['tasks', 'projects', 'calendar_events', 'files', 'folders', 'milestones'];
begin
  -- Ensure the publication exists (it does on managed Supabase, but be safe).
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    -- Only add a table if it isn't already part of the publication.
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

-- REPLICA IDENTITY FULL so UPDATE/DELETE events carry the full old row (needed
-- for the client to know which workspace a deleted row belonged to).
alter table public.tasks            replica identity full;
alter table public.projects         replica identity full;
alter table public.calendar_events  replica identity full;
alter table public.files            replica identity full;
alter table public.folders          replica identity full;
alter table public.milestones       replica identity full;
