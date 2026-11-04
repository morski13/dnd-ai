-- 38: battle engine phase 3, reactions (2026-11-04). Safe to run again.
-- reaction_windows: something happened in a fight (an attack hit, a spell, someone left reach, damage);
-- for a few seconds the creatures that can react get a pop-up. The server writes these (secret key);
-- everyone in the campaign can read them (the app shows each person only their own creatures' choices).
create table if not exists public.reaction_windows (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  combat_id   uuid not null references public.combats(id) on delete cascade,
  trigger     jsonb not null,               -- what happened (kind, who, to whom, the roll)
  eligible    jsonb not null default '[]',  -- [{ combatantId, name, characterId, monsterId, options: [...] }]
  responses   jsonb not null default '[]',  -- [{ combatantId, optionId | null, at }]
  roll_id     uuid references public.roll_events(id) on delete set null, -- the roll it's about (an attack)
  opened_at   timestamptz not null default now(),
  closes_at   timestamptz not null,
  status      text not null default 'open' check (status in ('open', 'closed'))
);
create index if not exists reaction_windows_combat on public.reaction_windows (combat_id, opened_at desc);
alter table public.reaction_windows enable row level security;
drop policy if exists "reaction windows: read" on public.reaction_windows;
create policy "reaction windows: read" on public.reaction_windows for select to authenticated using (public.is_member(campaign_id));
revoke insert, update, delete on public.reaction_windows from anon, authenticated;

-- a creature's reaction this round (it comes back at the start of its turn)
alter table public.combatants add column if not exists reaction_used boolean not null default false;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reaction_windows') then
    alter publication supabase_realtime add table public.reaction_windows;
  end if;
end $$;
