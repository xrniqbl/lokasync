-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — invitations integrity guarantees
--
-- The workspace-invitation flow upserts on (workspace_id, email) and looks up
-- invites by a unique token. On databases where `invitations` predates the
-- inline constraints (schema drift), those guarantees may be missing — which
-- would break ON CONFLICT upserts and allow duplicate tokens. This migration
-- ensures both constraints exist. Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Make sure the columns the constraints reference actually exist first.
alter table public.invitations add column if not exists workspace_id uuid;
alter table public.invitations add column if not exists email        text;
alter table public.invitations add column if not exists token        text;

-- Clean up any duplicate (workspace_id, email) rows that would block the unique
-- index — keep the most recently created invitation for each pair.
delete from public.invitations a
using public.invitations b
where a.workspace_id = b.workspace_id
  and lower(a.email) = lower(b.email)
  and a.created_at < b.created_at;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitations'::regclass
      and contype = 'u'
      and conname = 'invitations_workspace_id_email_key'
  ) then
    alter table public.invitations
      add constraint invitations_workspace_id_email_key unique (workspace_id, email);
  end if;
end$$;

-- Tokens must be globally unique (looked up directly in the accept flow).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitations'::regclass
      and contype = 'u'
      and conname = 'invitations_token_key'
  ) then
    alter table public.invitations
      add constraint invitations_token_key unique (token);
  end if;
end$$;

create index if not exists invitations_token_idx on public.invitations(token);
create index if not exists invitations_email_idx on public.invitations(lower(email));
