-- Deck building tables ------------------------------------------------
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  format text,
  cover_card_id uuid,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decks_owner_idx on public.decks (owner_id);
create index if not exists decks_public_idx on public.decks (is_public);

create table if not exists public.deck_cards (
  deck_id uuid not null references public.decks (id) on delete cascade,
  card_id uuid not null,
  card_name text not null,
  card_public_code text,
  quantity integer not null check (quantity > 0),
  primary key (deck_id, card_id)
);

create index if not exists deck_cards_deck_idx on public.deck_cards (deck_id);

-- Updated_at trigger for decks
create or replace function public.set_decks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_decks_updated on public.decks;
create trigger set_decks_updated
  before update on public.decks
  for each row
  execute procedure public.set_decks_updated_at();

-- Row level security ---------------------------------------------------
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;

create policy if not exists "Decks visible to owner or public" on public.decks
  for select
  using (auth.uid() = owner_id or is_public = true);

create policy if not exists "Owners manage their decks" on public.decks
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy if not exists "Deck cards visible with access" on public.deck_cards
  for select
  using (
    exists (
      select 1
      from public.decks d
      where d.id = deck_cards.deck_id
        and (auth.uid() = d.owner_id or d.is_public = true)
    )
  );

create policy if not exists "Owners manage deck cards" on public.deck_cards
  for all
  using (
    exists (
      select 1
      from public.decks d
      where d.id = deck_cards.deck_id
        and auth.uid() = d.owner_id
    )
  )
  with check (
    exists (
      select 1
      from public.decks d
      where d.id = deck_cards.deck_id
        and auth.uid() = d.owner_id
    )
  );
