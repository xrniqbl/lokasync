-- ── Chat Messages ─────────────────────────────────────────────────────────────
-- Real-time team chat for workspace members. One channel per workspace.

create table if not exists public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  content       text not null default '',
  file_url      text,
  file_name     text,
  file_type     text,
  reply_to      uuid references public.chat_messages(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- Drift safety: add columns if table already exists
alter table public.chat_messages add column if not exists workspace_id  uuid;
alter table public.chat_messages add column if not exists user_id       uuid;
alter table public.chat_messages add column if not exists content       text not null default '';
alter table public.chat_messages add column if not exists file_url      text;
alter table public.chat_messages add column if not exists file_name     text;
alter table public.chat_messages add column if not exists file_type     text;
alter table public.chat_messages add column if not exists reply_to      uuid;
alter table public.chat_messages add column if not exists created_at    timestamptz not null default now();
alter table public.chat_messages add column if not exists updated_at    timestamptz;

-- Indexes
create index if not exists chat_messages_workspace_created_idx
  on public.chat_messages(workspace_id, created_at);

create index if not exists chat_messages_reply_to_idx
  on public.chat_messages(reply_to);

-- ── Chat Reactions ────────────────────────────────────────────────────────────

create table if not exists public.chat_reactions (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.chat_messages(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  emoji         text not null check (emoji in ('👍','❤️','😂','🎉','👀','🔥')),
  created_at    timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table public.chat_reactions add column if not exists message_id    uuid;
alter table public.chat_reactions add column if not exists user_id       uuid;
alter table public.chat_reactions add column if not exists workspace_id  uuid;
alter table public.chat_reactions add column if not exists emoji         text;
alter table public.chat_reactions add column if not exists created_at    timestamptz not null default now();

create index if not exists chat_reactions_message_idx
  on public.chat_reactions(message_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.chat_messages  enable row level security;
alter table public.chat_reactions enable row level security;

-- chat_messages: any active member can read, member+ can write
drop policy if exists "members read chat_messages" on public.chat_messages;
create policy "members read chat_messages"
  on public.chat_messages for select
  using (public.is_workspace_member(workspace_id, 'viewer'));

drop policy if exists "members insert chat_messages" on public.chat_messages;
create policy "members insert chat_messages"
  on public.chat_messages for insert
  with check (public.is_workspace_member(workspace_id, 'member'));

drop policy if exists "author update chat_messages" on public.chat_messages;
create policy "author update chat_messages"
  on public.chat_messages for update
  using (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'member'))
  with check (auth.uid() = user_id);

drop policy if exists "author or admin delete chat_messages" on public.chat_messages;
create policy "author or admin delete chat_messages"
  on public.chat_messages for delete
  using (
    (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'member'))
    or public.is_workspace_member(workspace_id, 'admin')
  );

-- chat_reactions: any member can read, member+ can insert/delete own
drop policy if exists "members read chat_reactions" on public.chat_reactions;
create policy "members read chat_reactions"
  on public.chat_reactions for select
  using (public.is_workspace_member(workspace_id, 'viewer'));

drop policy if exists "members insert chat_reactions" on public.chat_reactions;
create policy "members insert chat_reactions"
  on public.chat_reactions for insert
  with check (public.is_workspace_member(workspace_id, 'member'));

drop policy if exists "owner delete chat_reactions" on public.chat_reactions;
create policy "owner delete chat_reactions"
  on public.chat_reactions for delete
  using (auth.uid() = user_id);
