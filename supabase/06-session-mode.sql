-- =====================================================================
-- D&D AI — Step 6: Session mode
-- Paste into Supabase → SQL Editor → Run. Run it ONCE.
-- =====================================================================

-- 1. Who is in a fight, and their initiative.
create table public.combatants (
  id                 uuid primary key default gen_random_uuid(),
  combat_id          uuid not null references public.combats(id) on delete cascade,
  campaign_id        uuid not null references public.campaigns(id) on delete cascade,
  character_id       uuid references public.characters(id) on delete cascade,
  monster_id         uuid references public.monsters(id) on delete cascade,
  name               text not null,
  initiative         int,
  initiative_hidden  boolean not null default false,  -- monster rolled in secret: players see "hidden"
  dex_mod            int not null default 0,          -- breaks initiative ties
  created_at         timestamptz not null default now(),
  check ((character_id is null) <> (monster_id is null))
);
create index on public.combatants (combat_id);

alter table public.combatants enable row level security;
create policy "combatants: read" on public.combatants for select to authenticated
  using (public.is_member(campaign_id));
create policy "combatants: DM writes" on public.combatants for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));
grant select, insert, update, delete on public.combatants to authenticated;
revoke all on public.combatants from anon;

-- Turn/round changes and session start/end are sent live to everyone at the table.
alter publication supabase_realtime add table public.sessions;

-- 2. Rolls and effects can now only be written by the app's server (with the secret key),
--    which rolls the dice itself. Players can't insert made-up rolls any more.
drop policy if exists "rolls: create" on public.roll_events;
drop policy if exists "effects: create" on public.effects;
revoke insert on public.roll_events, public.effects from authenticated;

-- 3. The table log. Everyone in the campaign sees every roll of a session,
--    but hidden DM rolls show as "DM roll, hidden" to players until revealed.
create function public.session_log(p_session_id uuid, p_limit int default 80)
returns table (
  id uuid, created_at timestamptz, round int, actor text, actor_kind text, roll_type text, source text,
  expression text, total int, dice int[], dice_all int[], modifier int, advantage text,
  is_crit boolean, is_fumble boolean, success boolean, dc int, ability text, damage_type text,
  target text, spell_slot int, masked boolean
)
language sql stable security definer set search_path = '' as $$
  with s as (
    select id, campaign_id, public.is_dm(campaign_id) as dm
    from public.sessions where id = p_session_id and public.is_member(campaign_id)
  )
  select r.id, r.created_at, r.round,
         case when r.hidden and not s.dm then 'DM' else coalesce(ch.name, m.name, p.display_name) end,
         case when r.monster_id is not null then 'monster' when r.character_id is not null then 'character' else 'player' end,
         r.roll_type,
         case when r.hidden and not s.dm then null else r.source end,
         case when r.hidden and not s.dm then null else r.expression end,
         case when r.hidden and not s.dm then null else r.total end,
         case when r.hidden and not s.dm then null else r.dice end,
         case when r.hidden and not s.dm then null else r.dice_all end,
         case when r.hidden and not s.dm then null else r.modifier end,
         r.advantage,
         case when r.hidden and not s.dm then false else r.is_crit end,
         case when r.hidden and not s.dm then false else r.is_fumble end,
         case when r.hidden and not s.dm then null else r.success end,
         case when r.hidden and not s.dm then null else r.dc end,
         r.ability, r.damage_type,
         coalesce(tc.name, tm.name),
         r.spell_slot,
         r.hidden and not s.dm
  from s
  join public.roll_events r on r.session_id = s.id
  left join public.characters ch on ch.id = r.character_id
  left join public.monsters   m  on m.id  = r.monster_id
  left join public.profiles   p  on p.id  = r.rolled_by
  left join public.characters tc on tc.id = r.target_character_id
  left join public.monsters   tm on tm.id = r.target_monster_id
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 300);
$$;
revoke execute on function public.session_log(uuid, int) from public, anon;
grant  execute on function public.session_log(uuid, int) to authenticated;
