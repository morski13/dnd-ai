-- =====================================================================
-- D&D AI — Start your own campaigns and switch between them.
-- Safe to run again.
-- =====================================================================

-- The campaign you looked at last is the one the app opens.
alter table public.campaign_members add column if not exists last_active_at timestamptz;

create or replace function public.set_active_campaign(p_campaign uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  update public.campaign_members set last_active_at = now() where campaign_id = p_campaign and user_id = auth.uid();
  if not found then raise exception 'You are not in that campaign'; end if;
end $$;

-- Anyone can start a campaign; they become its DM and it becomes their active campaign.
create or replace function public.create_campaign(p_name text, p_rule_set text default '2024', p_home_base text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the campaign a name'; end if;
  if (select count(*) from public.campaigns where dm_user_id = auth.uid()) >= 20 then raise exception 'You can run up to 20 campaigns'; end if;
  insert into public.campaigns (name, dm_user_id, rule_set, settings)
  values (left(trim(p_name), 80), auth.uid(),
          case when p_rule_set in ('2014', '2024', 'mixed') then p_rule_set else '2024' end,
          jsonb_build_object('home_base', nullif(left(trim(coalesce(p_home_base, '')), 80), ''),
                             'house_rules', jsonb_build_object('death_saves', 'secret', 'monster_rolls', 'hidden', 'auto_apply_damage', true)))
  returning id into v_id;
  update public.campaign_members set last_active_at = now() where campaign_id = v_id and user_id = auth.uid();
  return v_id;
end $$;

-- Joining also makes the new campaign the active one.
create or replace function public.join_campaign(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  select id into v_id from public.campaigns where invite_code = upper(trim(p_code));
  if v_id is null then raise exception 'No campaign with that invite code'; end if;
  insert into public.campaign_members (campaign_id, user_id, role, last_active_at)
  values (v_id, auth.uid(), 'player', now())
  on conflict (campaign_id, user_id) do update set last_active_at = now();
  return v_id;
end $$;

-- The DM can make a new invite code (the old one stops working).
create or replace function public.new_invite_code(p_campaign uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not public.is_dm(p_campaign) then raise exception 'Only the DM can do that'; end if;
  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  update public.campaigns set invite_code = v_code where id = p_campaign;
  return v_code;
end $$;

-- A player can leave a campaign (their characters stay, unclaimed). The DM can't leave their own.
create or replace function public.leave_campaign(p_campaign uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.campaigns where id = p_campaign and dm_user_id = auth.uid()) then
    raise exception 'You run this campaign, so you can''t leave it';
  end if;
  update public.characters set owner_user_id = null where campaign_id = p_campaign and owner_user_id = auth.uid();
  delete from public.campaign_members where campaign_id = p_campaign and user_id = auth.uid();
end $$;

revoke execute on function public.set_active_campaign(uuid), public.create_campaign(text, text, text), public.join_campaign(text),
  public.new_invite_code(uuid), public.leave_campaign(uuid) from public, anon;
grant execute on function public.set_active_campaign(uuid), public.create_campaign(text, text, text), public.join_campaign(text),
  public.new_invite_code(uuid), public.leave_campaign(uuid) to authenticated;

select 'Own campaigns ready' as result;
