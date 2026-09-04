-- ── Chat Realtime ─────────────────────────────────────────────────────────────
-- Enable realtime for chat tables so messages and reactions propagate instantly
-- to all connected workspace members.

do $$
declare
  t text;
  tables text[] := array['chat_messages', 'chat_reactions'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end$$;

alter table public.chat_messages  replica identity full;
alter table public.chat_reactions replica identity full;
