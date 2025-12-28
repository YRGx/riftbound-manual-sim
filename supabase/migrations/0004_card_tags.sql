-- Track card tag metadata for validation rules
alter table public.deck_cards
  add column if not exists card_tags text[] not null default '{}';
