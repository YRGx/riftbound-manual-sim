-- Enable uuid helpers
create extension if not exists "pgcrypto";

-- Profiles ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update their profile" on public.profiles
  for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Matches ---------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  player1_id uuid not null references public.profiles (id) on delete cascade,
  player2_id uuid references public.profiles (id) on delete set null,
  spectators_allowed boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;

create policy "Players and spectators can read matches" on public.matches
  for select
  using (
    auth.uid() = player1_id
    or auth.uid() = player2_id
    or spectators_allowed = true
  );

-- Match state -----------------------------------------------------------
create table if not exists public.match_state (
  match_id uuid primary key references public.matches (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_match_state_updated on public.match_state;
create trigger set_match_state_updated
  before update on public.match_state
  for each row
  execute procedure public.set_updated_at();

alter table public.match_state enable row level security;

create policy "Players and allowed spectators can read state" on public.match_state
  for select using (
    exists (
      select 1
      from public.matches m
      where m.id = match_state.match_id
        and (
          auth.uid() = m.player1_id
          or auth.uid() = m.player2_id
          or m.spectators_allowed = true
        )
    )
  );

-- Match events ----------------------------------------------------------
create table if not exists public.match_events (
  id bigserial primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid references public.profiles (id) on delete set null,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.match_events enable row level security;

create policy "Players and allowed spectators can read events" on public.match_events
  for select using (
    exists (
      select 1
      from public.matches m
      where m.id = match_events.match_id
        and (
          auth.uid() = m.player1_id
          or auth.uid() = m.player2_id
          or m.spectators_allowed = true
        )
    )
  );

-- Only service role/API should mutate matches, state, events so no insert/update policies are added.
