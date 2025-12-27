-- Add deck sections and metadata columns
alter table public.deck_cards drop constraint if exists deck_cards_pkey;

alter table public.deck_cards
  add column if not exists section text not null default 'main',
  add column if not exists card_domains text[] not null default '{}',
  add column if not exists card_supertype text,
  add column if not exists card_type text;

alter table public.deck_cards
  add constraint deck_cards_section_check
  check (section in ('legend', 'main', 'runes', 'battlefields', 'side'));

alter table public.deck_cards
  add primary key (deck_id, card_id, section);

create index if not exists deck_cards_section_idx on public.deck_cards (section);
