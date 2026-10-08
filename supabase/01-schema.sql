-- =====================================================================
-- D&D AI — Step 2: database tables + security rules
-- Paste this whole file into Supabase → SQL Editor → Run. Run it ONCE.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PROFILES: one row per person who signs up (name shown in the app)
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Adventurer',
  created_at   timestamptz not null default now()
);

-- Make a profile automatically whenever someone signs up.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Adventurer')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for anyone who signed up before this script ran.
insert into public.profiles (id, display_name)
select id, coalesce(split_part(email, '@', 1), 'Adventurer') from auth.users
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 2. CAMPAIGNS + MEMBERS (who is the DM, who are players)
-- ---------------------------------------------------------------------
create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  dm_user_id  uuid not null default auth.uid() references public.profiles(id),
  rule_set    text not null default 'mixed' check (rule_set in ('2014', '2024', 'mixed')),
  settings    jsonb not null default '{}'::jsonb,   -- house rules, theme, etc.
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 8)),
  created_at  timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'player' check (role in ('dm', 'co_dm', 'player')),
  joined_at   timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index on public.campaign_members (user_id);

-- The person who creates a campaign automatically becomes its DM.
create function public.add_dm_as_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  values (new.id, new.dm_user_id, 'dm')
  on conflict (campaign_id, user_id) do update set role = 'dm';
  return new;
end $$;

create trigger on_campaign_created
  after insert on public.campaigns
  for each row execute function public.add_dm_as_member();


-- ---------------------------------------------------------------------
-- 3. HELPER CHECKS used by the security rules
--    is_member: you belong to this campaign
--    is_dm:     you are the DM or a co-DM of this campaign
--    is_owner:  you are THE DM who owns the campaign
-- ---------------------------------------------------------------------
create function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = cid and m.user_id = (select auth.uid())
  );
$$;

create function public.is_dm(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = cid and m.user_id = (select auth.uid()) and m.role in ('dm', 'co_dm')
  );
$$;

create function public.is_owner(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = cid and c.dm_user_id = (select auth.uid())
  );
$$;


-- ---------------------------------------------------------------------
-- 4. CHARACTERS
-- ---------------------------------------------------------------------
create table public.characters (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  owner_user_id  uuid references public.profiles(id) on delete set null,  -- empty = not claimed by a player yet
  player_name    text,                                   -- e.g. "Marko" before he has an account
  name           text not null,
  species        text,
  background     text,
  rule_set       text not null default '2024' check (rule_set in ('2014', '2024')),
  class_levels   jsonb not null default '[]'::jsonb,     -- [{"class":"Barbarian","subclass":"Berserker","level":3}]
  ability_scores jsonb not null default '{"STR":10,"DEX":10,"CON":10,"INT":10,"WIS":10,"CHA":10}'::jsonb,
  hp_max         int,
  hp_current     int,
  temp_hp        int not null default 0,
  ac             int,
  speed          int,
  proficiencies  jsonb not null default '{}'::jsonb,
  features       jsonb not null default '[]'::jsonb,
  inventory      jsonb not null default '[]'::jsonb,
  spells         jsonb not null default '{}'::jsonb,
  resources      jsonb not null default '[]'::jsonb,     -- Rage 3/3, Second Wind 1/1 ...
  sheet_values   jsonb not null default '{}'::jsonb,     -- numbers as written on the paper sheet (for the sheet checker)
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.characters (campaign_id);
create index on public.characters (owner_user_id);

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger characters_updated_at
  before update on public.characters
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------
-- 5. MONSTERS & NPC STAT BLOCKS (DM-only unless shared)
-- ---------------------------------------------------------------------
create table public.monsters (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name        text not null,
  kind        text not null default 'monster' check (kind in ('monster', 'npc')),
  stat_block  jsonb not null default '{}'::jsonb,
  hp_max      int,
  hp_current  int,
  ac          int,
  is_boss     boolean not null default false,
  visibility  text not null default 'dm' check (visibility in ('dm', 'party')),
  created_at  timestamptz not null default now()
);
create index on public.monsters (campaign_id);


-- ---------------------------------------------------------------------
-- 6. SESSIONS and COMBATS (a session can have several fights)
-- ---------------------------------------------------------------------
create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  number      int not null,
  title       text,
  started_at  timestamptz,
  ended_at    timestamptz,
  recap       text,
  created_at  timestamptz not null default now(),
  unique (campaign_id, number)
);

create table public.combats (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_id  uuid references public.sessions(id) on delete cascade,
  name        text,
  round       int not null default 0,
  turn_index  int not null default 0,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index on public.combats (session_id);


-- ---------------------------------------------------------------------
-- 7. ROLL EVENTS: every single roll (the heart of the stats)
-- ---------------------------------------------------------------------
create table public.roll_events (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns(id) on delete cascade,
  session_id          uuid references public.sessions(id) on delete set null,  -- empty = rolled outside a session
  combat_id           uuid references public.combats(id) on delete set null,
  round               int,
  rolled_by           uuid not null default auth.uid() references public.profiles(id),
  character_id        uuid references public.characters(id) on delete set null,  -- who rolled (a character...
  monster_id          uuid references public.monsters(id) on delete set null,    -- ...or a monster)
  roll_type           text not null check (roll_type in (
                        'attack', 'damage', 'save', 'save_dc', 'check', 'heal', 'initiative',
                        'death_save', 'hit_dice', 'ability_score', 'hp_level', 'other')),
  source              text,                         -- "Greataxe", "Sacred Flame", "Stealth"
  expression          text not null,                -- "1d20+5", "4d6kh3"
  dice                int[] not null default '{}',  -- dice that counted
  dice_all            int[],                        -- every die, incl. dropped ones (advantage, 4d6kh3)
  modifier            int not null default 0,
  total               int,
  advantage           text not null default 'normal' check (advantage in ('normal', 'advantage', 'disadvantage')),
  is_crit             boolean not null default false,
  is_fumble           boolean not null default false,
  dc                  int,
  ability             text check (ability in ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA')),
  target_character_id uuid references public.characters(id) on delete set null,
  target_monster_id   uuid references public.monsters(id) on delete set null,
  success             boolean,
  damage_type         text,
  spell_slot          int,
  parent_roll_id      uuid references public.roll_events(id) on delete set null,  -- damage → its attack
  hidden              boolean not null default false,  -- secret DM roll / death save
  created_at          timestamptz not null default now(),
  check (character_id is null or monster_id is null)
);
create index on public.roll_events (campaign_id, created_at);
create index on public.roll_events (session_id);
create index on public.roll_events (combat_id);
create index on public.roll_events (character_id);
create index on public.roll_events (monster_id);


-- ---------------------------------------------------------------------
-- 8. EFFECTS: what actually happened (damage taken after resistance,
--    healing, temp HP, conditions like "Bless, 10 rounds")
-- ---------------------------------------------------------------------
create table public.effects (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns(id) on delete cascade,
  session_id          uuid references public.sessions(id) on delete set null,
  combat_id           uuid references public.combats(id) on delete set null,
  roll_event_id       uuid references public.roll_events(id) on delete set null,
  round               int,
  actor_character_id  uuid references public.characters(id) on delete set null,
  actor_monster_id    uuid references public.monsters(id) on delete set null,
  target_character_id uuid references public.characters(id) on delete set null,
  target_monster_id   uuid references public.monsters(id) on delete set null,
  kind                text not null check (kind in ('damage', 'heal', 'temp_hp', 'condition')),
  amount              int,          -- what was actually applied (after resistance, half on save...)
  rolled_amount       int,          -- the number before that
  damage_type         text,
  condition           text,         -- "Blessed", "Prone", "Concentrating: Bless"
  duration_rounds     int,
  dropped_to_zero     boolean not null default false,  -- knockout / kill (for stats)
  hidden              boolean not null default false,
  created_by          uuid not null default auth.uid() references public.profiles(id),
  created_at          timestamptz not null default now()
);
create index on public.effects (session_id);
create index on public.effects (combat_id);


-- ---------------------------------------------------------------------
-- 9. ACTIONS the app can call
-- ---------------------------------------------------------------------

-- A player joins a campaign with the DM's invite code.
create function public.join_campaign(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Log in first';
  end if;
  select id into v_id from public.campaigns where invite_code = upper(trim(p_code));
  if v_id is null then
    raise exception 'No campaign with that invite code';
  end if;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_id, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;
  return v_id;
end $$;

-- The DM ends a fight: hidden rolls are revealed and monsters that fought become visible.
create function public.end_combat(p_combat_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign uuid;
begin
  select campaign_id into v_campaign from public.combats where id = p_combat_id;
  if v_campaign is null or not public.is_dm(v_campaign) then
    raise exception 'Only the DM can end this combat';
  end if;
  update public.combats     set ended_at = coalesce(ended_at, now()) where id = p_combat_id;
  update public.roll_events set hidden = false where combat_id = p_combat_id;
  update public.effects     set hidden = false where combat_id = p_combat_id;
  update public.monsters    set visibility = 'party'
   where id in (select monster_id from public.roll_events
                 where combat_id = p_combat_id and monster_id is not null);
end $$;


-- ---------------------------------------------------------------------
-- 10. SECURITY RULES (Row Level Security)
--     With RLS on, the database refuses anything not allowed below,
--     no matter what the app's screens do.
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.campaigns        enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters       enable row level security;
alter table public.monsters         enable row level security;
alter table public.sessions         enable row level security;
alter table public.combats          enable row level security;
alter table public.roll_events      enable row level security;
alter table public.effects          enable row level security;

-- Profiles: see your own and people you play with; edit only your own.
create policy "profiles: read" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.campaign_members me
      join public.campaign_members them on them.campaign_id = me.campaign_id
      where me.user_id = (select auth.uid()) and them.user_id = profiles.id
    )
  );
create policy "profiles: edit own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Campaigns: members can see it; anyone logged in can create one (as its DM);
-- only the owning DM can change or delete it.
create policy "campaigns: read" on public.campaigns for select to authenticated
  using (public.is_member(id) or dm_user_id = (select auth.uid()));
create policy "campaigns: create" on public.campaigns for insert to authenticated
  with check (dm_user_id = (select auth.uid()));
create policy "campaigns: edit" on public.campaigns for update to authenticated
  using (public.is_owner(id)) with check (dm_user_id = (select auth.uid()));
create policy "campaigns: delete" on public.campaigns for delete to authenticated
  using (public.is_owner(id));

-- Members: see your campaign's members. The owner manages roles; co-DMs can add/remove players;
-- players can leave.
create policy "members: read" on public.campaign_members for select to authenticated
  using (public.is_member(campaign_id));
create policy "members: add" on public.campaign_members for insert to authenticated
  with check (public.is_owner(campaign_id) or (public.is_dm(campaign_id) and role = 'player'));
create policy "members: change role" on public.campaign_members for update to authenticated
  using (public.is_owner(campaign_id)) with check (public.is_owner(campaign_id));
create policy "members: remove" on public.campaign_members for delete to authenticated
  using (
    public.is_owner(campaign_id)
    or (public.is_dm(campaign_id) and role = 'player')
    or (user_id = (select auth.uid()) and role <> 'dm')
  );

-- Characters: the whole table can see them; you edit your own; the DM can edit any.
create policy "characters: read" on public.characters for select to authenticated
  using (public.is_member(campaign_id));
create policy "characters: create" on public.characters for insert to authenticated
  with check (public.is_member(campaign_id)
              and (owner_user_id = (select auth.uid()) or public.is_dm(campaign_id)));
create policy "characters: edit" on public.characters for update to authenticated
  using (owner_user_id = (select auth.uid()) or public.is_dm(campaign_id))
  with check (owner_user_id = (select auth.uid()) or public.is_dm(campaign_id));
create policy "characters: delete" on public.characters for delete to authenticated
  using (owner_user_id = (select auth.uid()) or public.is_dm(campaign_id));

-- Monsters: DM sees everything; players only see ones marked 'party'. Only the DM edits.
create policy "monsters: read" on public.monsters for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and visibility = 'party'));
create policy "monsters: DM writes" on public.monsters for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));

-- Sessions and combats: everyone in the campaign sees them; only the DM runs them.
create policy "sessions: read" on public.sessions for select to authenticated
  using (public.is_member(campaign_id));
create policy "sessions: DM writes" on public.sessions for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));

create policy "combats: read" on public.combats for select to authenticated
  using (public.is_member(campaign_id));
create policy "combats: DM writes" on public.combats for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));

-- Rolls: players see every roll except hidden ones; the DM sees all.
-- You can only roll as yourself, for your own character; only the DM rolls for monsters.
-- Rolls can't be edited afterwards, except by the DM.
create policy "rolls: read" on public.roll_events for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and not hidden));
create policy "rolls: create" on public.roll_events for insert to authenticated
  with check (
    rolled_by = (select auth.uid())
    and public.is_member(campaign_id)
    and (monster_id is null or public.is_dm(campaign_id))
    and (
      character_id is null
      or public.is_dm(campaign_id)
      or exists (select 1 from public.characters c
                 where c.id = character_id
                   and c.campaign_id = roll_events.campaign_id
                   and c.owner_user_id = (select auth.uid()))
    )
  );
create policy "rolls: DM edits" on public.roll_events for update to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));
create policy "rolls: DM deletes" on public.roll_events for delete to authenticated
  using (public.is_dm(campaign_id));

-- Effects: same idea as rolls.
create policy "effects: read" on public.effects for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and not hidden));
create policy "effects: create" on public.effects for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_member(campaign_id));
create policy "effects: DM edits" on public.effects for update to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));
create policy "effects: DM deletes" on public.effects for delete to authenticated
  using (public.is_dm(campaign_id));


-- ---------------------------------------------------------------------
-- 11. ACCESS: logged-in users go through the rules above;
--     logged-out visitors get nothing.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke execute on function public.join_campaign(text) from public, anon;
revoke execute on function public.end_combat(uuid)    from public, anon;
grant  execute on function public.join_campaign(text) to authenticated;
grant  execute on function public.end_combat(uuid)    to authenticated;


-- ---------------------------------------------------------------------
-- 12. LIVE UPDATES: the table sees new rolls and turn changes instantly
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.roll_events, public.effects, public.combats;
