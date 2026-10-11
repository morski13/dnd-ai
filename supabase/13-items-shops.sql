-- =====================================================================
-- D&D AI — Items, money, shops and loot
--   • the SRD item library (filled by 14-item-library-2014.sql and 15-item-library-2024.sql)
--   • campaign items: the DM's custom items and the players' homebrew (needs DM approval)
--   • every character's coins and inventory, plus a log of who got what
--   • shops (secret until the DM opens them) and premade loot tables
-- Run this first, then 14 and 15. Safe to run again.
-- =====================================================================

-- 1. The SRD item library (read-only for everyone)
create table if not exists public.srd_items (
  id          text primary key,                -- e.g. '2024:longsword'
  rules       text not null check (rules in ('2014', '2024')),
  name        text not null,
  kind        text not null,                   -- gear, weapon, armor, ammo, tool, pack, mount, magic
  category    text,
  rarity      text,
  attunement  boolean not null default false,
  cost_cp     int,                             -- price in copper (1 gp = 100 cp); magic items have none
  weight      numeric,
  bundle      int,                             -- sold in bundles (20 arrows…)
  summary     text,                            -- one line: "1d8 Slashing · Versatile (1d10)"
  description text not null default '',
  data        jsonb
);
create index if not exists srd_items_rules_name_idx on public.srd_items (rules, lower(name));
alter table public.srd_items enable row level security;
drop policy if exists "items: everyone logged in can read" on public.srd_items;
create policy "items: everyone logged in can read" on public.srd_items for select to authenticated using (true);
revoke all on public.srd_items from anon;
revoke insert, update, delete on public.srd_items from authenticated;
grant select on public.srd_items to authenticated;

-- 2. Coins on every character
alter table public.characters add column if not exists coins jsonb not null default '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'::jsonb;

create or replace function public.owns_character(p_character uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters c where c.id = p_character and c.owner_user_id = (select auth.uid()))
$$;

-- 3. Campaign items: the DM's custom items and the players' homebrew
create table if not exists public.campaign_items (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  name          text not null check (length(name) between 1 and 120),
  kind          text not null default 'gear' check (kind in ('gear', 'weapon', 'armor', 'ammo', 'tool', 'pack', 'mount', 'magic', 'potion', 'treasure', 'other')),
  category      text,
  rarity        text,
  attunement    boolean not null default false,
  cost_cp       int check (cost_cp >= 0),
  weight        numeric,
  summary       text,
  description   text not null default '',
  based_on      text,                          -- an SRD item it builds on (optional)
  source        text not null default 'dm' check (source in ('dm', 'player')),
  status        text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  dm_note       text,                          -- the DM's answer to a homebrew request
  for_character uuid references public.characters(id) on delete set null,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists campaign_items_campaign_idx on public.campaign_items (campaign_id);

-- 4. Inventory
create table if not exists public.character_items (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  srd_id       text,                           -- from the library…
  item_id      uuid references public.campaign_items(id) on delete cascade,  -- …or a campaign item…
  name         text not null check (length(name) between 1 and 160),       -- …or just a name
  qty          int not null default 1 check (qty between 1 and 99999),
  equipped     boolean not null default false,
  attuned      boolean not null default false,
  note         text,
  source       text not null default 'manual' check (source in ('manual', 'start', 'shop', 'dm', 'loot')),
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists character_items_character_idx on public.character_items (character_id);
create index if not exists character_items_item_idx on public.character_items (item_id);

-- Homebrew can't be used before the DM approves it; the campaign always comes from the character.
create or replace function public.character_items_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  select c.campaign_id into new.campaign_id from public.characters c where c.id = new.character_id;
  if new.campaign_id is null then raise exception 'Character not found'; end if;
  if new.item_id is not null then
    select i.status into st from public.campaign_items i where i.id = new.item_id and i.campaign_id = new.campaign_id;
    if st is null then raise exception 'Item not found in this campaign'; end if;
    if st <> 'approved' then raise exception 'This homebrew item needs the DM''s approval first'; end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists character_items_check on public.character_items;
create trigger character_items_check before insert or update on public.character_items
  for each row execute function public.character_items_check();

-- 5. Log: who got what, bought what, and coin changes (shown to the DM and the owner)
create table if not exists public.item_log (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  session_id   uuid references public.sessions(id) on delete set null,
  kind         text not null check (kind in ('buy', 'give', 'loot', 'coins', 'drop', 'homebrew')),
  text         text not null,
  cp_delta     int,
  created_by   uuid default auth.uid() references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists item_log_character_idx on public.item_log (character_id, created_at desc);
create index if not exists item_log_campaign_idx on public.item_log (campaign_id, created_at desc);

-- 6. Shops: secret until the DM opens them for the players
create table if not exists public.shops (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  name           text not null check (length(name) between 1 and 80),
  keeper         text,
  blurb          text,
  is_open        boolean not null default false,
  opened_session uuid references public.sessions(id) on delete set null,
  price_pct      int not null default 100 check (price_pct between 10 and 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists shops_campaign_idx on public.shops (campaign_id);

create table if not exists public.shop_stock (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  srd_id      text,
  item_id     uuid references public.campaign_items(id) on delete cascade,
  name        text not null,
  price_cp    int not null check (price_cp >= 0),
  qty         int check (qty >= 0),            -- empty = unlimited
  bundle      int,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists shop_stock_shop_idx on public.shop_stock (shop_id);

-- 7. Premade loot tables (DM only)
create table if not exists public.loot_tables (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  note        text,
  coins_cp    int not null default 0 check (coins_cp >= 0),
  created_at  timestamptz not null default now()
);
create table if not exists public.loot_rows (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.loot_tables(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  srd_id      text,
  item_id     uuid references public.campaign_items(id) on delete cascade,
  name        text not null,
  qty         int not null default 1 check (qty between 1 and 9999),
  weight      int not null default 1 check (weight between 1 and 100),  -- chance when rolling one
  sort        int not null default 0
);
create index if not exists loot_rows_table_idx on public.loot_rows (table_id);

-- 8. Who sees what
create or replace function public.campaign_item_visible(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.character_items ci where ci.item_id = p_item)
      or exists (select 1 from public.shop_stock s join public.shops sh on sh.id = s.shop_id where s.item_id = p_item and sh.is_open)
$$;
revoke execute on function public.campaign_item_visible(uuid), public.owns_character(uuid) from public, anon;
grant execute on function public.campaign_item_visible(uuid), public.owns_character(uuid) to authenticated;

alter table public.campaign_items  enable row level security;
alter table public.character_items enable row level security;
alter table public.item_log        enable row level security;
alter table public.shops           enable row level security;
alter table public.shop_stock      enable row level security;
alter table public.loot_tables     enable row level security;
alter table public.loot_rows       enable row level security;

-- Campaign items: the DM sees all. Players see their own requests, items someone owns and items in an open shop.
drop policy if exists "campaign items: read" on public.campaign_items;
create policy "campaign items: read" on public.campaign_items for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and (created_by = (select auth.uid()) or public.campaign_item_visible(id))));
drop policy if exists "campaign items: create" on public.campaign_items;
create policy "campaign items: create" on public.campaign_items for insert to authenticated
  with check (public.is_dm(campaign_id)
    or (public.is_member(campaign_id) and created_by = (select auth.uid()) and source = 'player' and status = 'pending'));
drop policy if exists "campaign items: edit" on public.campaign_items;
create policy "campaign items: edit" on public.campaign_items for update to authenticated
  using (public.is_dm(campaign_id) or (created_by = (select auth.uid()) and source = 'player' and status <> 'approved'))
  with check (public.is_dm(campaign_id) or (created_by = (select auth.uid()) and source = 'player' and status = 'pending'));
drop policy if exists "campaign items: delete" on public.campaign_items;
create policy "campaign items: delete" on public.campaign_items for delete to authenticated
  using (public.is_dm(campaign_id) or (created_by = (select auth.uid()) and status <> 'approved'));

-- Inventory: the whole table can see it (like character sheets); the owner and the DM change it.
drop policy if exists "inventory: read" on public.character_items;
create policy "inventory: read" on public.character_items for select to authenticated
  using (public.is_member(campaign_id));
drop policy if exists "inventory: owner or DM writes" on public.character_items;
create policy "inventory: owner or DM writes" on public.character_items for all to authenticated
  using (public.owns_character(character_id) or public.is_dm(campaign_id))
  with check (public.owns_character(character_id) or public.is_dm(campaign_id));

drop policy if exists "item log: read" on public.item_log;
create policy "item log: read" on public.item_log for select to authenticated
  using (public.is_dm(campaign_id) or public.owns_character(character_id));
drop policy if exists "item log: write" on public.item_log;
create policy "item log: write" on public.item_log for insert to authenticated
  with check (created_by = (select auth.uid()) and (public.is_dm(campaign_id) or public.owns_character(character_id)));
drop policy if exists "item log: DM deletes" on public.item_log;
create policy "item log: DM deletes" on public.item_log for delete to authenticated using (public.is_dm(campaign_id));

-- Shops: players only see open shops (and what's in them). Only the DM changes them.
drop policy if exists "shops: read" on public.shops;
create policy "shops: read" on public.shops for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and is_open));
drop policy if exists "shops: DM writes" on public.shops;
create policy "shops: DM writes" on public.shops for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));
drop policy if exists "stock: read" on public.shop_stock;
create policy "stock: read" on public.shop_stock for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and exists (select 1 from public.shops s where s.id = shop_id and s.is_open)));
drop policy if exists "stock: DM writes" on public.shop_stock;
create policy "stock: DM writes" on public.shop_stock for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));

drop policy if exists "loot: DM only" on public.loot_tables;
create policy "loot: DM only" on public.loot_tables for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));
drop policy if exists "loot rows: DM only" on public.loot_rows;
create policy "loot rows: DM only" on public.loot_rows for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));

grant select, insert, update, delete on public.campaign_items, public.character_items, public.item_log,
  public.shops, public.shop_stock, public.loot_tables, public.loot_rows to authenticated;
revoke all on public.campaign_items, public.character_items, public.item_log,
  public.shops, public.shop_stock, public.loot_tables, public.loot_rows from anon;

-- 9. Buying from a shop, all in one step. The app works out the coins to pay (and the change);
--    the database checks the value is exactly right, the shop is open and the stock is there.
create or replace function public.shop_buy(p_stock uuid, p_character uuid, p_qty int, p_old jsonb, p_new jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  st public.shop_stock%rowtype;
  sh public.shops%rowtype;
  ch public.characters%rowtype;
  price int;
  units int;
  row_id uuid;
  sess uuid;
  v_old int; v_new int;
begin
  if p_qty is null or p_qty < 1 or p_qty > 999 then raise exception 'Pick how many to buy'; end if;
  select * into st from public.shop_stock where id = p_stock for update;
  if not found then raise exception 'That item is gone'; end if;
  select * into sh from public.shops where id = st.shop_id;
  if not sh.is_open then raise exception 'This shop is closed'; end if;
  select * into ch from public.characters where id = p_character for update;
  if not found or ch.campaign_id <> sh.campaign_id then raise exception 'Character not found'; end if;
  if ch.owner_user_id is distinct from (select auth.uid()) and not public.is_dm(sh.campaign_id) then
    raise exception 'You can only buy for your own character';
  end if;
  if st.qty is not null and st.qty < p_qty then raise exception 'Only % left', st.qty; end if;
  if ch.coins is distinct from p_old then raise exception 'Your coins changed, try again'; end if;

  price := round(st.price_cp * sh.price_pct / 100.0)::int * p_qty;
  v_old := coalesce((p_old->>'pp')::int, 0) * 1000 + coalesce((p_old->>'gp')::int, 0) * 100 + coalesce((p_old->>'ep')::int, 0) * 50
         + coalesce((p_old->>'sp')::int, 0) * 10 + coalesce((p_old->>'cp')::int, 0);
  v_new := coalesce((p_new->>'pp')::int, 0) * 1000 + coalesce((p_new->>'gp')::int, 0) * 100 + coalesce((p_new->>'ep')::int, 0) * 50
         + coalesce((p_new->>'sp')::int, 0) * 10 + coalesce((p_new->>'cp')::int, 0);
  if least((p_new->>'pp')::int, (p_new->>'gp')::int, (p_new->>'ep')::int, (p_new->>'sp')::int, (p_new->>'cp')::int) < 0
     or v_old - v_new <> price then
    raise exception 'Not enough coins';
  end if;

  update public.characters set coins = p_new where id = p_character;
  if st.qty is not null then update public.shop_stock set qty = qty - p_qty where id = p_stock; end if;

  units := p_qty * coalesce(st.bundle, 1);
  select id into row_id from public.character_items
    where character_id = p_character and not equipped and note is null
      and srd_id is not distinct from st.srd_id and item_id is not distinct from st.item_id and name = st.name
    limit 1;
  if row_id is not null then
    update public.character_items set qty = least(qty + units, 99999) where id = row_id;
  else
    insert into public.character_items (campaign_id, character_id, srd_id, item_id, name, qty, source)
    values (sh.campaign_id, p_character, st.srd_id, st.item_id, st.name, units, 'shop') returning id into row_id;
  end if;

  select s.id into sess from public.sessions s where s.campaign_id = sh.campaign_id and s.started_at is not null and s.ended_at is null
    order by s.started_at desc limit 1;
  insert into public.item_log (campaign_id, character_id, session_id, kind, text, cp_delta, created_by)
  values (sh.campaign_id, p_character, sess, 'buy',
          'Bought ' || case when units > 1 then units || '× ' else '' end || st.name || ' at ' || sh.name, -price, (select auth.uid()));
  return row_id;
end $$;
revoke execute on function public.shop_buy(uuid, uuid, int, jsonb, jsonb) from public, anon;
grant execute on function public.shop_buy(uuid, uuid, int, jsonb, jsonb) to authenticated;

-- 10. Bring over the gear already written on the sheets (once): "15 gp" becomes coins, "Handaxe x4" becomes 4 Handaxes.
update public.characters c
set coins = jsonb_build_object('pp', 0, 'ep', 0, 'sp', 0, 'cp', 0, 'gp',
  (select coalesce(sum((regexp_match(v, '^(\d+)\s*gp$', 'i'))[1]::int), 0) from jsonb_array_elements_text(c.inventory) v))
where c.coins = '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'::jsonb
  and not exists (select 1 from public.character_items x where x.character_id = c.id)
  and exists (select 1 from jsonb_array_elements_text(c.inventory) v where v ~* '^\d+\s*gp$');

insert into public.character_items (campaign_id, character_id, name, qty, source, sort)
select c.campaign_id, c.id,
       regexp_replace(t.v, '\s+x\s*\d+$', '', 'i'),
       coalesce((regexp_match(t.v, '\s+x\s*(\d+)$', 'i'))[1]::int, 1),
       'start', t.n
from public.characters c, jsonb_array_elements_text(c.inventory) with ordinality as t(v, n)
where not exists (select 1 from public.character_items x where x.character_id = c.id)
  and t.v !~* '^\d+\s*(gp|sp|cp|pp|ep)$'
  and length(trim(t.v)) > 0;

-- 11. Live updates: players see a shop the moment the DM opens it
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shops') then
    alter publication supabase_realtime add table public.shops;
  end if;
end $$;
