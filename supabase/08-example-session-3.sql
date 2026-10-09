-- =====================================================================
-- D&D AI — Example statistics: session 3 "The Old Bridge" (made-up rolls)
-- Fills session 3 with the fight against Grub the ogre and two goblins, so the
-- Statistics screen has something to show. Safe to run again: it replaces session 3's rolls.
-- Needs 02-seed-ashen-crown.sql (and 07-fight-planner.sql for the saved plan).
-- =====================================================================
do $$
declare
  v_c   uuid;
  v_dm  uuid;
  v_s   uuid;
  v_k   uuid;
  v_t0  timestamptz := '2026-10-03 18:40+02';
begin
  select id, dm_user_id into v_c, v_dm from public.campaigns where name = 'The Ashen Crown' order by created_at limit 1;
  if v_c is null then raise exception 'Run 02-seed-ashen-crown.sql first.'; end if;
  select id into v_s from public.sessions where campaign_id = v_c and number = 3;
  if v_s is null then raise exception 'Session 3 is missing — run 02-seed-ashen-crown.sql first.'; end if;

  -- Start clean (re-runnable)
  delete from public.effects where session_id = v_s;
  delete from public.roll_events where session_id = v_s;
  delete from public.combats where session_id = v_s;

  insert into public.combats (campaign_id, session_id, name, round, turn_index, started_at, ended_at)
  values (v_c, v_s, 'Ogre at the bridge', 3, 0, v_t0, v_t0 + interval '25 minutes')
  returning id into v_k;

  create temp table ch on commit drop as select id, name from public.characters where campaign_id = v_c;
  create temp table mo on commit drop as select id, name from public.monsters where campaign_id = v_c;
  create temp table ids (tag text primary key, id uuid not null default gen_random_uuid()) on commit drop;

  create temp table raw (
    tag text, actor_c uuid, actor_m uuid, roll_type text, source text, expression text, dice int[], dice_all int[],
    modifier int, total int, advantage text, is_crit boolean, dc int, ability text, tgt_c uuid, tgt_m uuid,
    success boolean, damage_type text, spell_slot int, parent text, round int, in_combat boolean, seq int
  ) on commit drop;
  insert into raw values
  ('r1', (select id from ch where name = 'Brakka Stonehew'), null, 'initiative', 'Initiative', '1d20+2', array[14]::int[], null, 2, 16, 'normal', false, null, null, null, null, null, null, null, null, 0, true, 1),
  ('r2', (select id from ch where name = 'Lyra Venn'), null, 'initiative', 'Initiative', '1d20+0', array[7]::int[], null, 0, 7, 'normal', false, null, null, null, null, null, null, null, null, 0, true, 2),
  ('r3', (select id from ch where name = 'Vex'), null, 'initiative', 'Initiative', '1d20+3', array[19]::int[], null, 3, 22, 'normal', false, null, null, null, null, null, null, null, null, 0, true, 3),
  ('r4', (select id from ch where name = 'Orrin Ashby'), null, 'initiative', 'Initiative', '1d20+2', array[3]::int[], null, 2, 5, 'normal', false, null, null, null, null, null, null, null, null, 0, true, 4),
  ('r5', null, (select id from mo where name = 'Grub (Ogre)'), 'initiative', 'Initiative', '1d20-1', array[11]::int[], null, -1, 10, 'normal', false, null, null, null, null, null, null, null, null, 0, true, 5),
  ('r6', (select id from ch where name = 'Vex'), null, 'attack', 'Shortbow', '2d20kh1+5', array[16]::int[], array[16,4]::int[], 5, 21, 'advantage', false, null, null, null, (select id from mo where name = 'Goblin Warrior A'), true, null, null, null, 1, true, 6),
  ('r7', (select id from ch where name = 'Vex'), null, 'damage', 'Shortbow + Sneak Attack', '1d6+2d6+3', array[5,6,2]::int[], null, 3, 16, 'normal', false, null, null, null, (select id from mo where name = 'Goblin Warrior A'), null, 'Piercing', null, 'r6', 1, true, 7),
  ('r8', (select id from ch where name = 'Brakka Stonehew'), null, 'attack', 'Greataxe', '2d20kh1+5', array[20]::int[], array[20,9]::int[], 5, 25, 'advantage', true, null, null, null, (select id from mo where name = 'Grub (Ogre)'), true, null, null, null, 1, true, 8),
  ('r9', (select id from ch where name = 'Brakka Stonehew'), null, 'damage', 'Greataxe (crit) + Rage', '2d12+5', array[11,8]::int[], null, 5, 24, 'normal', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), null, 'Slashing', null, 'r8', 1, true, 9),
  ('r10', null, (select id from mo where name = 'Grub (Ogre)'), 'attack', 'Greatclub', '1d20+6', array[12]::int[], null, 6, 18, 'normal', false, null, null, (select id from ch where name = 'Brakka Stonehew'), null, true, null, null, null, 1, true, 10),
  ('r11', null, (select id from mo where name = 'Grub (Ogre)'), 'damage', 'Greatclub', '2d8+4', array[7,5]::int[], null, 4, 16, 'normal', false, null, null, (select id from ch where name = 'Brakka Stonehew'), null, null, 'Bludgeoning', null, 'r10', 1, true, 11),
  ('r13', null, (select id from mo where name = 'Goblin Warrior B'), 'attack', 'Shortbow', '1d20+4', array[15]::int[], null, 4, 19, 'normal', false, null, null, (select id from ch where name = 'Orrin Ashby'), null, true, null, null, null, 1, true, 13),
  ('r14', null, (select id from mo where name = 'Goblin Warrior B'), 'damage', 'Shortbow', '1d6+2', array[4]::int[], null, 2, 6, 'normal', false, null, null, (select id from ch where name = 'Orrin Ashby'), null, null, 'Piercing', null, 'r13', 1, true, 14),
  ('r15', (select id from ch where name = 'Lyra Venn'), null, 'save_dc', 'Sacred Flame', 'DC 13 DEX', array[]::int[], null, 0, null, 'normal', false, 13, 'DEX', null, (select id from mo where name = 'Goblin Warrior B'), null, null, null, null, 1, true, 15),
  ('r16', null, (select id from mo where name = 'Goblin Warrior B'), 'save', 'DEX save vs Sacred Flame', '1d20+2', array[6]::int[], null, 2, 8, 'normal', false, null, 'DEX', null, null, false, null, null, 'r15', 1, true, 16),
  ('r17', (select id from ch where name = 'Lyra Venn'), null, 'damage', 'Sacred Flame', '1d8', array[8]::int[], null, 0, 8, 'normal', false, null, null, null, (select id from mo where name = 'Goblin Warrior B'), null, 'Radiant', null, 'r15', 1, true, 17),
  ('r18', (select id from ch where name = 'Orrin Ashby'), null, 'save_dc', 'Shatter', 'DC 13 CON', array[]::int[], null, 0, null, 'normal', false, 13, 'CON', null, (select id from mo where name = 'Grub (Ogre)'), null, null, 2, null, 1, true, 18),
  ('r19', null, (select id from mo where name = 'Grub (Ogre)'), 'save', 'CON save vs Shatter', '1d20+3', array[14]::int[], null, 3, 17, 'normal', false, null, 'CON', null, null, true, null, null, 'r18', 1, true, 19),
  ('r20', (select id from ch where name = 'Orrin Ashby'), null, 'damage', 'Shatter (half)', '3d8', array[6,3,7]::int[], null, 0, 16, 'normal', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), null, 'Thunder', null, 'r18', 1, true, 20),
  ('r21', (select id from ch where name = 'Vex'), null, 'attack', 'Shortbow', '1d20+5', array[9]::int[], null, 5, 14, 'normal', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), true, null, null, null, 2, true, 21),
  ('r22', (select id from ch where name = 'Vex'), null, 'damage', 'Shortbow + Sneak Attack', '1d6+2d6+3', array[3,4,1]::int[], null, 3, 11, 'normal', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), null, 'Piercing', null, 'r21', 2, true, 22),
  ('r23', (select id from ch where name = 'Brakka Stonehew'), null, 'attack', 'Greataxe', '2d20kh1+5', array[4]::int[], array[4,2]::int[], 5, 9, 'advantage', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), false, null, null, null, 2, true, 23),
  ('r25', null, (select id from mo where name = 'Grub (Ogre)'), 'attack', 'Greatclub', '1d20+6', array[17]::int[], null, 6, 23, 'normal', false, null, null, (select id from ch where name = 'Orrin Ashby'), null, true, null, null, null, 2, true, 25),
  ('r26', null, (select id from mo where name = 'Grub (Ogre)'), 'damage', 'Greatclub', '2d8+4', array[6,4]::int[], null, 4, 14, 'normal', false, null, null, (select id from ch where name = 'Orrin Ashby'), null, null, 'Bludgeoning', null, 'r25', 2, true, 26),
  ('r27', (select id from ch where name = 'Lyra Venn'), null, 'heal', 'Healing Word', '2d4+3', array[3,2]::int[], null, 3, 8, 'normal', false, null, null, (select id from ch where name = 'Orrin Ashby'), null, null, null, 1, null, 2, true, 27),
  ('r28', (select id from ch where name = 'Orrin Ashby'), null, 'attack', 'Fire Bolt', '1d20+5', array[13]::int[], null, 5, 18, 'normal', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), true, null, null, null, 2, true, 28),
  ('r29', (select id from ch where name = 'Orrin Ashby'), null, 'damage', 'Fire Bolt', '1d10', array[8]::int[], null, 0, 8, 'normal', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), null, 'Fire', null, 'r28', 2, true, 29),
  ('r30', (select id from ch where name = 'Vex'), null, 'attack', 'Shortbow', '1d20+5', array[18]::int[], null, 5, 23, 'normal', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), true, null, null, null, 3, true, 30),
  ('r31', (select id from ch where name = 'Vex'), null, 'damage', 'Shortbow + Sneak Attack', '1d6+2d6+3', array[6,5,3]::int[], null, 3, 17, 'normal', false, null, null, null, (select id from mo where name = 'Grub (Ogre)'), null, 'Piercing', null, 'r30', 3, true, 31),
  ('r32', (select id from ch where name = 'Vex'), null, 'check', 'Stealth', '1d20+7', array[11]::int[], null, 7, 18, 'normal', false, 15, null, null, null, true, null, null, null, null, false, 32),
  ('r33', (select id from ch where name = 'Orrin Ashby'), null, 'check', 'Arcana', '1d20+5', array[2]::int[], null, 5, 7, 'normal', false, 12, null, null, null, false, null, null, null, null, false, 33);

  insert into ids (tag) select tag from raw;

  insert into public.roll_events (
    id, campaign_id, session_id, combat_id, round, rolled_by, character_id, monster_id, roll_type, source, expression,
    dice, dice_all, modifier, total, advantage, is_crit, is_fumble, dc, ability, target_character_id, target_monster_id,
    success, damage_type, spell_slot, parent_roll_id, hidden, created_at)
  select i.id, v_c, v_s, case when r.in_combat then v_k end, r.round, v_dm, r.actor_c, r.actor_m, r.roll_type, r.source, r.expression,
    r.dice, r.dice_all, r.modifier, r.total, r.advantage, r.is_crit, false, r.dc, r.ability, r.tgt_c, r.tgt_m,
    r.success, r.damage_type, r.spell_slot, p.id, false, v_t0 + make_interval(secs => r.seq * 20)
  from raw r join ids i on i.tag = r.tag left join ids p on p.tag = r.parent
  order by r.seq;

  -- HP changes linked to the rolls (half damage on Shatter, Brakka's rage resistance, knockouts)
  insert into public.effects (campaign_id, session_id, combat_id, roll_event_id, round, actor_character_id, actor_monster_id,
    target_character_id, target_monster_id, kind, amount, rolled_amount, damage_type, dropped_to_zero, created_by, created_at)
  select v_c, v_s, v_k, i.id, e.round, e.actor_c, e.actor_m, e.tgt_c, e.tgt_m, e.kind, e.amount, e.rolled, e.damage_type, e.drops, v_dm,
    v_t0 + make_interval(secs => e.seq * 20 + 1)
  from (values
  ('r7', (select id from ch where name = 'Vex'), null, null, (select id from mo where name = 'Goblin Warrior A'), 'damage', 16, 16, 'Piercing', true, 1, 7),
  ('r9', (select id from ch where name = 'Brakka Stonehew'), null, null, (select id from mo where name = 'Grub (Ogre)'), 'damage', 24, 24, 'Slashing', false, 1, 9),
  ('r11', null, (select id from mo where name = 'Grub (Ogre)'), (select id from ch where name = 'Brakka Stonehew'), null, 'damage', 8, 16, 'Bludgeoning', false, 1, 11),
  ('r14', null, (select id from mo where name = 'Goblin Warrior B'), (select id from ch where name = 'Orrin Ashby'), null, 'damage', 6, 6, 'Piercing', false, 1, 14),
  ('r17', (select id from ch where name = 'Lyra Venn'), null, null, (select id from mo where name = 'Goblin Warrior B'), 'damage', 8, 8, 'Radiant', false, 1, 17),
  ('r20', (select id from ch where name = 'Orrin Ashby'), null, null, (select id from mo where name = 'Grub (Ogre)'), 'damage', 8, 16, 'Thunder', false, 1, 20),
  ('r22', (select id from ch where name = 'Vex'), null, null, (select id from mo where name = 'Grub (Ogre)'), 'damage', 11, 11, 'Piercing', false, 2, 22),
  ('r26', null, (select id from mo where name = 'Grub (Ogre)'), (select id from ch where name = 'Orrin Ashby'), null, 'damage', 14, 14, 'Bludgeoning', true, 2, 26),
  ('r27', (select id from ch where name = 'Lyra Venn'), null, (select id from ch where name = 'Orrin Ashby'), null, 'heal', 8, 8, null, false, 2, 27),
  ('r29', (select id from ch where name = 'Orrin Ashby'), null, null, (select id from mo where name = 'Grub (Ogre)'), 'damage', 8, 8, 'Fire', false, 2, 29),
  ('r31', (select id from ch where name = 'Vex'), null, null, (select id from mo where name = 'Grub (Ogre)'), 'damage', 17, 17, 'Piercing', true, 3, 31)
  ) as e(tag, actor_c, actor_m, tgt_c, tgt_m, kind, amount, rolled, damage_type, drops, round, seq)
  join ids i on i.tag = e.tag;

  -- The fight as the DM planned it (shows "planned: Medium" next to how it went)
  if to_regclass('public.encounters') is not null and to_regclass('public.srd_monsters') is not null
     and not exists (select 1 from public.encounters where campaign_id = v_c and name = 'Ogre at the bridge') then
    insert into public.encounters (campaign_id, name, data, summary, created_by)
    select v_c, 'Ogre at the bridge',
      jsonb_build_object('fresh', true, 'characterIds', null, 'entries', jsonb_build_array(
        jsonb_build_object('id', 'ogre', 'source', 'srd', 'ref', 'Ogre', 'count', 1, 'side', 'enemy',
          'stats', (select data from public.srd_monsters where name = 'Ogre')),
        jsonb_build_object('id', 'gob', 'source', 'srd', 'ref', 'Goblin Warrior', 'count', 2, 'side', 'enemy',
          'stats', (select data from public.srd_monsters where name = 'Goblin Warrior')))),
      '{"tier":"Medium","pWin":1,"pAnyDown":0.16,"pDeath":0.003,"avgRounds":2.5,"xp":550}'::jsonb, v_dm;
  end if;

  raise notice 'Session 3 now has % rolls.', (select count(*) from public.roll_events where session_id = v_s);
end $$;
