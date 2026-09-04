-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — user-scoped relational tables
--
-- Moves billing/subscription, transaction history, and user profiles from the
-- ephemeral KV store into proper relational tables. This makes the data
-- queryable, durable, and safe for production SaaS operations.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Public read-only view of a user's profile. Row Level Security ensures each
-- user can only read/update their own row (see 000002/000006 policies).
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text not null,
  phone         text,
  job_title     text,
  company       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The profiles table carries `user_id` (the auth uid) as its stable per-user
-- key. The edge function upserts on `user_id`, so it must exist, be backfilled,
-- and be UNIQUE. Backfill from `id` for any legacy row missing it, mirror it on
-- write, and add the unique constraint the edge function's ON CONFLICT relies on.
alter table public.profiles add column if not exists user_id uuid;
update public.profiles set user_id = id where user_id is null;

create or replace function public.profiles_sync_user_id()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then
    new.user_id := new.id;
  end if;
  return new;
end$$;

drop trigger if exists profiles_sync_user_id on public.profiles;
create trigger profiles_sync_user_id
  before insert or update on public.profiles
  for each row execute function public.profiles_sync_user_id();

-- Add the unique constraint only if it isn't already present (production already
-- has `profiles_user_id_key`; fresh deploys need it created).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'u'
      and conname = 'profiles_user_id_key'
  ) then
    alter table public.profiles
      add constraint profiles_user_id_key unique (user_id);
  end if;
end$$;

alter table public.profiles add column if not exists email     text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone     text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists company   text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_email_idx on public.profiles(email);

-- ── plans ────────────────────────────────────────────────────────────────────
-- Plan catalogue. Kept small and editable by admin. The edge function seeds
-- this table on first boot if it is empty.
create table if not exists public.plans (
  id            text primary key,          -- 'free' | 'pro' | 'business'
  name          text not null,
  description   text not null,
  currency      text not null default 'IDR',
  monthly       integer not null default 0,
  yearly        integer not null default 0,
  features      text[] not null default '{}',
  highlighted   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.plans add column if not exists id          text;
alter table public.plans add column if not exists name        text;
alter table public.plans add column if not exists description text;
alter table public.plans add column if not exists currency    text not null default 'IDR';
alter table public.plans add column if not exists monthly     integer not null default 0;
alter table public.plans add column if not exists yearly      integer not null default 0;
alter table public.plans add column if not exists features    text[] not null default '{}';
alter table public.plans add column if not exists highlighted boolean not null default false;
alter table public.plans add column if not exists created_at  timestamptz not null default now();
alter table public.plans add column if not exists updated_at  timestamptz not null default now();

-- ── subscriptions ────────────────────────────────────────────────────────────
-- One row per user. Stores the currently active (or most recent) subscription.
-- status can be 'active', 'expired', 'cancelled', 'pending'.
create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  plan_id             text not null references public.plans(id),
  interval            text not null check (interval in ('monthly','yearly')),
  status              text not null default 'pending'
                        check (status in ('active','expired','cancelled','pending')),
  order_id            text,
  started_at          timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id)
);

alter table public.subscriptions add column if not exists id                 uuid;
alter table public.subscriptions add column if not exists user_id            uuid;
alter table public.subscriptions add column if not exists plan_id            text;
alter table public.subscriptions add column if not exists interval           text;
alter table public.subscriptions add column if not exists status             text not null default 'pending';
alter table public.subscriptions add column if not exists order_id           text;
alter table public.subscriptions add column if not exists started_at         timestamptz;
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions add column if not exists created_at         timestamptz not null default now();
alter table public.subscriptions add column if not exists updated_at         timestamptz not null default now();

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_plan_id_idx on public.subscriptions(plan_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

-- ── transactions ─────────────────────────────────────────────────────────────
-- Every Midtrans checkout and its final status. Serves as the audit log / billing
-- history. order_id is the natural external key from Midtrans.
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  order_id        text not null unique,
  plan_id         text not null references public.plans(id),
  plan_name       text not null,
  interval        text not null check (interval in ('monthly','yearly')),
  gross_amount    integer not null default 0,
  discount        integer not null default 0,
  voucher_code    text,
  status          text not null default 'pending'
                      check (status in ('pending','paid','failed')),
  payment_type    text,
  midtrans_data   jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.transactions add column if not exists id           uuid;
alter table public.transactions add column if not exists user_id      uuid;
alter table public.transactions add column if not exists order_id     text;
alter table public.transactions add column if not exists plan_id      text;
alter table public.transactions add column if not exists plan_name    text;
alter table public.transactions add column if not exists interval     text;
alter table public.transactions add column if not exists gross_amount integer not null default 0;
alter table public.transactions add column if not exists discount     integer not null default 0;
alter table public.transactions add column if not exists voucher_code text;
alter table public.transactions add column if not exists status       text not null default 'pending';
alter table public.transactions add column if not exists payment_type text;
alter table public.transactions add column if not exists midtrans_data jsonb not null default '{}';
alter table public.transactions add column if not exists created_at   timestamptz not null default now();
alter table public.transactions add column if not exists updated_at   timestamptz not null default now();

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_order_id_idx on public.transactions(order_id);
create index if not exists transactions_status_idx on public.transactions(status);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array['profiles','plans','subscriptions','transactions'])
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
