-- =====================================================================
-- D&D AI — Battle maps: the DM's map pictures with a grid (1 square = 5 ft by default),
-- tokens for everyone in a fight, movement per turn, and character portraits.
-- Hidden monster tokens are never sent to players (their rows are invisible to them).
-- Safe to run again.
-- =====================================================================

create table if not exists public.battle_maps (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name        text not null default 'Battle map',
  image_path  text,                       -- in the private "vault" bucket (null = a plain grid)
  image_w     int, image_h int,           -- the picture's size in pixels
  cols        int not null default 24 check (cols between 2 and 100),
  rows        int not null default 24 check (rows between 2 and 100),
  crop        jsonb,                      -- the part of the picture under the grid {x,y,w,h} in pixels
  stretch     boolean not null default false,
  feet        int not null default 5 check (feet between 1 and 100),   -- one square
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists battle_maps_campaign_idx on public.battle_maps (campaign_id);

alter table public.combats add column if not exists map_id uuid references public.battle_maps(id) on delete set null;
alter table public.combats add column if not exists last_area jsonb;   -- the last area spell cast (everyone sees it)

create table if not exists public.map_tokens (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  combat_id     uuid not null references public.combats(id) on delete cascade,
  combatant_id  uuid not null unique references public.combatants(id) on delete cascade,
  x int not null default 0, y int not null default 0,   -- top-left square
  size int not null default 1 check (size between 1 and 4),
  hidden boolean not null default false,                -- DM only until revealed
  moved_ft int not null default 0,                      -- this turn
  dashes int not null default 0,                        -- Dash used this turn (each adds the speed again)
  updated_at timestamptz not null default now()
);
create index if not exists map_tokens_combat_idx on public.map_tokens (combat_id);

alter table public.characters add column if not exists portrait bigint;   -- upload stamp of the token picture
alter table public.monsters   add column if not exists portrait bigint;

-- who may see what
alter table public.battle_maps enable row level security;
alter table public.map_tokens  enable row level security;
drop policy if exists "maps: DM" on public.battle_maps;
drop policy if exists "maps: in a fight" on public.battle_maps;
create policy "maps: DM" on public.battle_maps for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));
create policy "maps: in a fight" on public.battle_maps for select to authenticated
  using (public.is_member(campaign_id) and exists (
    select 1 from public.combats c where c.map_id = battle_maps.id and c.ended_at is null));
drop policy if exists "tokens: DM" on public.map_tokens;
drop policy if exists "tokens: table sees the visible ones" on public.map_tokens;
create policy "tokens: DM" on public.map_tokens for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));
create policy "tokens: table sees the visible ones" on public.map_tokens for select to authenticated
  using (public.is_member(campaign_id) and not hidden);
grant select, insert, update, delete on public.battle_maps, public.map_tokens to authenticated;
revoke all on public.battle_maps, public.map_tokens from anon;

-- moves show up live for everyone (hidden tokens only for the DM: realtime follows the rules above)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'map_tokens') then
    alter publication supabase_realtime add table public.map_tokens;
  end if;
end $$;

select 'Battle maps ready' as result;
