-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — Row Level Security for user-scoped tables
--
-- profiles, plans, subscriptions, and transactions are user-scoped (not
-- workspace-scoped). The edge function still gates admin endpoints server-side.
-- These policies protect direct Supabase client access.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles ─────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (id = auth.uid());

drop policy if exists "users delete own profile" on public.profiles;
create policy "users delete own profile"
  on public.profiles for delete
  using (id = auth.uid());

-- ── plans ────────────────────────────────────────────────────────────────────
-- Plans are read-only for authenticated users; admin mutations go through the
-- edge function (service role).
alter table public.plans enable row level security;

drop policy if exists "authenticated read plans" on public.plans;
create policy "authenticated read plans"
  on public.plans for select
  using (auth.role() = 'authenticated');

-- ── subscriptions ────────────────────────────────────────────────────────────
-- Users can only see their own subscription. Writes happen via the edge function.
alter table public.subscriptions enable row level security;

drop policy if exists "users read own subscription" on public.subscriptions;
create policy "users read own subscription"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- ── transactions ─────────────────────────────────────────────────────────────
-- Users can only see their own transactions. Writes happen via the edge function.
alter table public.transactions enable row level security;

drop policy if exists "users read own transactions" on public.transactions;
create policy "users read own transactions"
  on public.transactions for select
  using (user_id = auth.uid());
