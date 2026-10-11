-- =====================================================================
-- D&D AI — Short & long rests (hit dice), concentration, and secret monster saves the DM can reveal.
-- Safe to run again.
-- =====================================================================
-- Spent hit dice by die size, e.g. {"12": 2}
alter table public.characters add column if not exists hit_dice_used jsonb not null default '{}'::jsonb;
-- The spell being concentrated on, e.g. {"spell": "Bless", "since": "…"}; empty when not concentrating
alter table public.characters add column if not exists concentration jsonb;
-- Monsters can concentrate too (the DM sets it)
alter table public.monsters add column if not exists concentration jsonb;

-- The table log tells the DM which rolls are still secret (so they can reveal one early),
-- and says who rolled (so everyone sees each other's dice, in that person's own dice skin)
drop function if exists public.session_log(uuid, int);
create function public.session_log(p_session_id uuid, p_limit int default 80)
returns table (
  id uuid, created_at timestamptz, round int, actor text, actor_kind text, roll_type text, source text,
  expression text, total int, dice int[], dice_all int[], modifier int, advantage text,
  is_crit boolean, is_fumble boolean, success boolean, dc int, ability text, damage_type text,
  target text, spell_slot int, masked boolean, secret boolean, rolled_by uuid
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
         r.hidden and not s.dm,
         r.hidden and s.dm,
         case when r.hidden and not s.dm then null else r.rolled_by end -- whose dice to show
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

select 'Rests, concentration and secret saves ready' as result;
