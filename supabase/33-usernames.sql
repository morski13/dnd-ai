-- =====================================================================
-- D&D AI — 33: log in with a username instead of an email
-- Paste into Supabase → SQL Editor → Run. Safe to run again.
--
-- New accounts pick a username and a password, nothing else. Behind the scenes Supabase still needs an
-- email, so the app gives each new account a private placeholder address that is never written to.
-- Accounts made before this keep working: they get a username made from their name (see the Home menu),
-- and can still log in with their old email too.
-- =====================================================================

-- 1. The username (stored in lower case, one per person)
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- 2. Everyone who signed up before this gets one: their name, else the start of their email,
--    letters/numbers/._- only, 3–20 characters, with a number added if it's taken ("marko2").
do $$
declare
  r record;
  base text;
  cand text;
  n int;
begin
  for r in
    select p.id, p.display_name, u.email
    from public.profiles p join auth.users u on u.id = p.id
    where p.username is null
    order by p.created_at
  loop
    base := lower(regexp_replace(coalesce(nullif(r.display_name, 'Adventurer'), split_part(r.email, '@', 1), 'player'), '[^a-zA-Z0-9._-]', '', 'g'));
    if length(base) < 3 then base := base || 'player'; end if;
    base := left(base, 17);
    cand := base;
    n := 1;
    while exists (select 1 from public.profiles where lower(username) = cand) loop
      n := n + 1;
      cand := base || n;
    end loop;
    update public.profiles set username = cand where id = r.id;
  end loop;
end $$;

-- 3. New accounts: the profile gets the username chosen on the sign-up screen.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'Adventurer'),
    lower(nullif(new.raw_user_meta_data->>'username', ''))
  )
  on conflict (id) do nothing;
  return new;
end $$;
