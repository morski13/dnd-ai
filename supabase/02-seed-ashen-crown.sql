-- =====================================================================
-- D&D AI — Test data: The Ashen Crown
-- Before running: create your user in Supabase (Authentication → Users → Add user),
-- then put that email on the line marked >>> below. Run this file ONCE.
-- =====================================================================
do $$
declare
  dm_email text := 'radiusmill@gmail.com';   -- >>> change this to the email of your Supabase user
  v_dm   uuid;
  v_c    uuid;
begin
  select id into v_dm from auth.users where email = dm_email;
  if v_dm is null then
    raise exception 'No user with email %. Create it first: Authentication → Users → Add user.', dm_email;
  end if;

  -- The campaign (you are the DM). Settings = the default house rules from 04-house-rules.md.
  insert into public.campaigns (name, dm_user_id, rule_set, settings)
  values ('The Ashen Crown', v_dm, 'mixed', $json${
    "region": "Vale of Morrow",
    "home_base": "Hollowford",
    "party_level": 3,
    "schedule": "Saturdays 18:00–22:30",
    "theme": { "preset": "ember", "accent": "#E0913A" },
    "house_rules": {
      "ability_scores": "4d6_drop_lowest",
      "hp_on_level_up": "roll",
      "multiclassing": true,
      "homebrew": "dm_approval",
      "crit": "double_dice",
      "nat1_attack": "miss",
      "flanking": "advantage",
      "potion_bonus_action": true,
      "potion_healing": "roll",
      "death_saves": "secret",
      "monster_hp": "average",
      "monster_rolls": "hidden",
      "encumbrance": false,
      "ammo_tracking": true,
      "spell_components": false,
      "players_see_each_others_stats": true,
      "players_see_monster_stats_after_combat": true,
      "reveal_hidden_rolls_after_combat": true,
      "session_awards": true
    }
  }$json$::jsonb)
  returning id into v_c;

  -- The party (not linked to player accounts yet).
  insert into public.characters
    (campaign_id, player_name, name, species, rule_set, class_levels, ability_scores, hp_max, hp_current, ac, speed, resources, notes)
  values
    (v_c, 'Marko', 'Brakka Stonehew', 'Goliath', '2024',
     '[{"class":"Barbarian","subclass":"Berserker","level":3}]',
     '{"STR":17,"DEX":14,"CON":16,"INT":8,"WIS":12,"CHA":10}', 35, 35, 15, 35,
     '[{"name":"Rage","max":3,"used":0,"recharge":"long rest"}]',
     'Former pit fighter, loud, loyal. Carries Grub''s Iron Key.'),
    (v_c, 'Ana', 'Lyra Venn', 'Human', '2024',
     '[{"class":"Cleric","subclass":"Life Domain","level":3}]',
     '{"STR":14,"DEX":10,"CON":14,"INT":10,"WIS":16,"CHA":12}', 24, 24, 18, 30,
     '[{"name":"Channel Divinity","max":2,"used":0,"recharge":"short rest"}]',
     'Novice from Saint Aldric''s Abbey. Wears the Abbey Medallion.'),
    (v_c, 'Stefan', 'Vex', 'Halfling', '2024',
     '[{"class":"Rogue","subclass":"Thief","level":3}]',
     '{"STR":8,"DEX":17,"CON":12,"INT":12,"WIS":13,"CHA":14}', 21, 21, 14, 30,
     '[]',
     'Owes 80 gp to the Lanternhands.'),
    (v_c, 'Jelena', 'Orrin Ashby', 'Gnome', '2024',
     '[{"class":"Wizard","subclass":"Evoker","level":3}]',
     '{"STR":8,"DEX":14,"CON":12,"INT":17,"WIS":12,"CHA":10}', 17, 17, 12, 30,
     '[{"name":"Arcane Recovery","max":1,"used":0,"recharge":"long rest"}]',
     'Scholar obsessed with the old empire.');

  -- Past sessions.
  insert into public.sessions (campaign_id, number, title, started_at, ended_at, recap) values
    (v_c, 1, 'The Drowned Lantern', '2026-09-19 18:00+02', '2026-09-19 22:30+02',
     'The party meets in the Drowned Lantern. Abbess Morwen hires them to find the stolen Ashen Crown.'),
    (v_c, 2, 'The Abbey', '2026-09-26 18:00+02', '2026-09-26 22:30+02',
     'Investigated the abbey. Met Kessa Nightvane, who escaped with a stolen abbey map. Vex''s debt to Pell revealed.'),
    (v_c, 3, 'The Old Bridge', '2026-10-03 18:00+02', '2026-10-03 22:30+02',
     'Fought Grub the ogre and two goblins at the Old Bridge. Orrin dropped to 0 HP and was saved by Lyra. Found Grub''s Iron Key.');

  -- Monsters from session 3 (defeated, so the party can see them).
  insert into public.monsters (campaign_id, name, stat_block, hp_max, hp_current, ac, is_boss, visibility) values
    (v_c, 'Grub (Ogre)',      '{"type":"Large giant","cr":"2"}',   68, 0, 11, true,  'party'),
    (v_c, 'Goblin Warrior A', '{"type":"Small fey","cr":"1/4"}',   10, 0, 15, false, 'party'),
    (v_c, 'Goblin Warrior B', '{"type":"Small fey","cr":"1/4"}',   10, 0, 15, false, 'party');

  raise notice 'Done! The Ashen Crown is ready.';
end $$;

-- Shows your new campaign and its invite code:
select name, invite_code from public.campaigns where name = 'The Ashen Crown';
