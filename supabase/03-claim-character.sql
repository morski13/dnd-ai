-- =====================================================================
-- D&D AI — Step 4: players can claim an unclaimed character
-- Paste into Supabase → SQL Editor → Run. Run it ONCE.
-- =====================================================================

-- A player in the campaign says "this character is mine".
-- Only works if nobody has claimed it yet.
create function public.claim_character(p_character_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_campaign uuid;
  v_owner    uuid;
begin
  if auth.uid() is null then
    raise exception 'Log in first';
  end if;

  select campaign_id, owner_user_id into v_campaign, v_owner
    from public.characters where id = p_character_id
    for update;

  if v_campaign is null or not public.is_member(v_campaign) then
    raise exception 'Character not found';
  end if;
  if v_owner is not null then
    raise exception 'Someone already claimed this character';
  end if;

  update public.characters set owner_user_id = auth.uid() where id = p_character_id;
end $$;

revoke execute on function public.claim_character(uuid) from public, anon;
grant  execute on function public.claim_character(uuid) to authenticated;
