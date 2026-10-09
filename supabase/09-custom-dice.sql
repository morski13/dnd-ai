-- =====================================================================
-- D&D AI — Custom dice
-- Each player can design dice sets (colors, pattern, finish, pictures) and pick one to roll with.
-- Pictures are small (resized in the browser) and stored inside the set itself.
-- Safe to run again.
-- =====================================================================
create table if not exists public.dice_skins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null default 'My dice',
  data       jsonb not null,
  is_active  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dice_skins_size check (pg_column_size(data) < 2000000)
);
create index if not exists dice_skins_user_idx on public.dice_skins (user_id);
-- Only one set can be the one you roll with
create unique index if not exists dice_skins_one_active on public.dice_skins (user_id) where is_active;

alter table public.dice_skins enable row level security;

-- You see your own dice, and the dice of people you play with (so we can show their dice later).
drop policy if exists "dice: see own and table's" on public.dice_skins;
create policy "dice: see own and table's" on public.dice_skins for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.campaign_members me
      join public.campaign_members them on them.campaign_id = me.campaign_id
      where me.user_id = auth.uid() and them.user_id = dice_skins.user_id
    )
  );

drop policy if exists "dice: make your own" on public.dice_skins;
create policy "dice: make your own" on public.dice_skins for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "dice: change your own" on public.dice_skins;
create policy "dice: change your own" on public.dice_skins for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "dice: delete your own" on public.dice_skins;
create policy "dice: delete your own" on public.dice_skins for delete to authenticated
  using (user_id = auth.uid());

-- At most 12 sets per person
create or replace function public.dice_skins_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.dice_skins where user_id = new.user_id) >= 12 then
    raise exception 'You can keep up to 12 dice sets. Delete one first.';
  end if;
  return new;
end $$;
drop trigger if exists dice_skins_limit on public.dice_skins;
create trigger dice_skins_limit before insert on public.dice_skins
  for each row execute function public.dice_skins_limit();
