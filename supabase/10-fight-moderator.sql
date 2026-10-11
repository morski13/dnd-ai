-- =====================================================================
-- D&D AI — Fight moderator
-- Damage and healing rolls change HP by themselves, monsters get live health,
-- death saves and conditions are tracked. Safe to run again.
-- =====================================================================

-- 1. Every HP change remembers how it was applied and what the HP was before,
--    so the DM can fix it ("they saved: half", "resistant") or undo it.
alter table public.effects add column if not exists factor text not null default 'full'
  check (factor in ('full', 'half', 'resist', 'double', 'immune'));
alter table public.effects add column if not exists undo jsonb;          -- state before this change
alter table public.effects add column if not exists undone boolean not null default false;

-- 2. In a fight: conditions on anyone, and how hurt a monster looks (players see this, not exact HP).
alter table public.combatants add column if not exists conditions text[] not null default '{}';
alter table public.combatants add column if not exists health text not null default 'unhurt'
  check (health in ('unhurt', 'hurt', 'bloodied', 'down'));

-- 3. Death saves. If the house rule says death saves are secret, only the DM can see them.
create table if not exists public.death_saves (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  successes    int not null default 0 check (successes between 0 and 3),
  failures     int not null default 0 check (failures between 0 and 3),
  stable       boolean not null default false,
  dead         boolean not null default false,
  updated_at   timestamptz not null default now()
);
alter table public.death_saves enable row level security;

create or replace function public.death_saves_secret(p_campaign uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select settings->'house_rules'->>'death_saves' from public.campaigns where id = p_campaign), 'open') = 'secret'
$$;
revoke execute on function public.death_saves_secret(uuid) from public, anon;
grant execute on function public.death_saves_secret(uuid) to authenticated;

drop policy if exists "death saves: read" on public.death_saves;
create policy "death saves: read" on public.death_saves for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and not public.death_saves_secret(campaign_id)));
-- Only the app's server writes death saves (it rolls them).
revoke insert, update, delete on public.death_saves from authenticated;
grant select on public.death_saves to authenticated;
revoke all on public.death_saves from anon;

-- 4. Live updates for HP and death saves
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'combatants') then
    alter publication supabase_realtime add table public.combatants;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'characters') then
    alter publication supabase_realtime add table public.characters;
  end if;
end $$;
