-- =====================================================================
-- D&D AI — Example campaign notes for The Ashen Crown (from 05-campaign-info.md)
-- Fills the Campaign page with NPCs, places, factions, goals, lore and a session plan.
-- Public facts are shared with players; every [DM ONLY] secret sits in a secret block.
-- Safe to run again: it replaces these example documents (your own documents stay).
-- Needs 11-campaign-vault.sql.
-- =====================================================================
do $$
declare
  v_c uuid;
  v_dm uuid;
begin
  select id, dm_user_id into v_c, v_dm from public.campaigns where name = 'The Ashen Crown' order by created_at limit 1;
  if v_c is null then raise exception 'Run 02-seed-ashen-crown.sql first.'; end if;

  -- standard folders (same as the app creates)
  insert into public.vault_folders (campaign_id, kind, name, sort)
  select v_c, f.kind, f.name, f.sort from (values

    ('plans', 'Session plans', 0),
    ('npcs', 'NPCs', 1),
    ('maps', 'Maps', 2),
    ('places', 'Towns & places', 3),
    ('shops', 'Shops', 4),
    ('fights', 'Fights', 5),
    ('goals', 'Goals & milestones', 6),
    ('factions', 'Factions', 7),
    ('lore', 'Lore & notes', 8),
    ('handouts', 'Handouts', 9)
  ) as f(kind, name, sort)
  where not exists (select 1 from public.vault_folders x where x.campaign_id = v_c and x.kind = f.kind);

  create temp table ex (kind text, title text, doc jsonb, txt text, pub jsonb, pubtxt text, shared boolean, status text, n int) on commit drop;
  insert into ex values
  ('npcs', 'Abbess Morwen', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Abbess Morwen"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Quest giver, seems to be an ally"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Order of Saint Aldric"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Saint Aldric''s Abbey"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hired the party to recover the Crown. Lyra''s mentor."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Old, calm, speaks softly, never raises her voice."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets / real goal"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "She arranged the theft herself. She believes the empire must return, with her controlling the dead army."}]}, {"type": "paragraph", "content": [{"type": "text", "text": "She is secretly allied with Lord Varn Malchor, who plans to betray her."}]}]}]}'::jsonb, 'Abbess Morwen
Role: Quest giver, seems to be an ally
Faction: Order of Saint Aldric
Lives in: Saint Aldric''s Abbey
Relationship to the party: Hired the party to recover the Crown. Lyra''s mentor.
Description
Old, calm, speaks softly, never raises her voice.
Secrets / real goal
She arranged the theft herself. She believes the empire must return, with her controlling the dead army.
She is secretly allied with Lord Varn Malchor, who plans to betray her.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Abbess Morwen"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Quest giver, seems to be an ally"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Order of Saint Aldric"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Saint Aldric''s Abbey"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hired the party to recover the Crown. Lyra''s mentor."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Old, calm, speaks softly, never raises her voice."}]}]}'::jsonb, 'Abbess Morwen
Role: Quest giver, seems to be an ally
Faction: Order of Saint Aldric
Lives in: Saint Aldric''s Abbey
Relationship to the party: Hired the party to recover the Crown. Lyra''s mentor.
Description
Old, calm, speaks softly, never raises her voice.', true, null, 0),
  ('npcs', 'Mayor Edda Thorne', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Mayor Edda Thorne"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Ally"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hollowford town council"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hollowford"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Pays bounties for monsters on the roads."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Practical, tired, always carrying a ledger."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Takes a cut from the Lanternhands so she looks the other way."}]}]}]}'::jsonb, 'Mayor Edda Thorne
Role: Ally
Faction: Hollowford town council
Lives in: Hollowford
Relationship to the party: Pays bounties for monsters on the roads.
Description
Practical, tired, always carrying a ledger.
Secrets
Takes a cut from the Lanternhands so she looks the other way.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Mayor Edda Thorne"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Ally"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hollowford town council"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hollowford"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Pays bounties for monsters on the roads."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Practical, tired, always carrying a ledger."}]}]}'::jsonb, 'Mayor Edda Thorne
Role: Ally
Faction: Hollowford town council
Lives in: Hollowford
Relationship to the party: Pays bounties for monsters on the roads.
Description
Practical, tired, always carrying a ledger.', true, null, 1),
  ('npcs', 'Pell', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Pell"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Barkeep, information broker"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "None that anyone knows of"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Drowned Lantern"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Friendly; sells rumors for a few silver. Vex owes him money."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "One-eyed, cheerful, remembers every name."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Second-in-command of the Lanternhands, and in truth their leader: \"The Wick\" doesn''t exist. He is the one Vex owes 80 gp to."}]}]}]}'::jsonb, 'Pell
Role: Barkeep, information broker
Faction: None that anyone knows of
Lives in: The Drowned Lantern
Relationship to the party: Friendly; sells rumors for a few silver. Vex owes him money.
Description
One-eyed, cheerful, remembers every name.
Secrets
Second-in-command of the Lanternhands, and in truth their leader: "The Wick" doesn''t exist. He is the one Vex owes 80 gp to.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Pell"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Barkeep, information broker"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "None that anyone knows of"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Drowned Lantern"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Friendly; sells rumors for a few silver. Vex owes him money."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "One-eyed, cheerful, remembers every name."}]}]}'::jsonb, 'Pell
Role: Barkeep, information broker
Faction: None that anyone knows of
Lives in: The Drowned Lantern
Relationship to the party: Friendly; sells rumors for a few silver. Vex owes him money.
Description
One-eyed, cheerful, remembers every name.', true, null, 2),
  ('npcs', 'Kessa Nightvane', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Kessa Nightvane"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Rival / possible ally"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Lanternhands"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Unknown"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Met once in session 2; she''s also looking for the Crown. Escaped with a stolen abbey map."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Elf thief, sharp humor, dual daggers."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets / real goal"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Wants to sell the Crown to the highest bidder, but she will turn on Morwen if she learns about the dead army."}]}]}]}'::jsonb, 'Kessa Nightvane
Role: Rival / possible ally
Faction: Lanternhands
Lives in: Unknown
Relationship to the party: Met once in session 2; she''s also looking for the Crown. Escaped with a stolen abbey map.
Description
Elf thief, sharp humor, dual daggers.
Secrets / real goal
Wants to sell the Crown to the highest bidder, but she will turn on Morwen if she learns about the dead army.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Kessa Nightvane"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Rival / possible ally"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Lanternhands"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Unknown"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Met once in session 2; she''s also looking for the Crown. Escaped with a stolen abbey map."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Elf thief, sharp humor, dual daggers."}]}]}'::jsonb, 'Kessa Nightvane
Role: Rival / possible ally
Faction: Lanternhands
Lives in: Unknown
Relationship to the party: Met once in session 2; she''s also looking for the Crown. Escaped with a stolen abbey map.
Description
Elf thief, sharp humor, dual daggers.', true, null, 3),
  ('npcs', 'Lord Varn Malchor', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Lord Varn Malchor"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Main villain (unknown to players so far)"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Grey Court"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Beyond the mountains, inside the Grey"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "None yet; mentioned in rumors as \"the Fog Lord\"."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Last living general of the old empire, kept alive by necromancy."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets / real goal"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "He''s the one actually spreading the Grey. He wants the Crown to wake the army himself and is using Morwen. Once the army wakes, he plans to betray her."}]}]}]}'::jsonb, 'Lord Varn Malchor
Role: Main villain (unknown to players so far)
Faction: The Grey Court
Lives in: Beyond the mountains, inside the Grey
Relationship to the party: None yet; mentioned in rumors as "the Fog Lord".
Description
Last living general of the old empire, kept alive by necromancy.
Secrets / real goal
He''s the one actually spreading the Grey. He wants the Crown to wake the army himself and is using Morwen. Once the army wakes, he plans to betray her.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Lord Varn Malchor"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Main villain (unknown to players so far)"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Grey Court"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lives in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Beyond the mountains, inside the Grey"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Relationship to the party: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "None yet; mentioned in rumors as \"the Fog Lord\"."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Last living general of the old empire, kept alive by necromancy."}]}]}'::jsonb, 'Lord Varn Malchor
Role: Main villain (unknown to players so far)
Faction: The Grey Court
Lives in: Beyond the mountains, inside the Grey
Relationship to the party: None yet; mentioned in rumors as "the Fog Lord".
Description
Last living general of the old empire, kept alive by necromancy.', false, null, 4),
  ('npcs', 'Grub (deceased)', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Grub"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Monster (ogre)"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hired by the Grey Court"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Ogre who blocked the Old Bridge. Killed by the party in session 3 (Vex got the final hit). Carried Grub''s Iron Key."}]}]}'::jsonb, 'Grub
Role: Monster (ogre)
Faction: Hired by the Grey Court
Description
Ogre who blocked the Old Bridge. Killed by the party in session 3 (Vex got the final hit). Carried Grub''s Iron Key.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Grub"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Role: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Monster (ogre)"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Faction: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hired by the Grey Court"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Ogre who blocked the Old Bridge. Killed by the party in session 3 (Vex got the final hit). Carried Grub''s Iron Key."}]}]}'::jsonb, 'Grub
Role: Monster (ogre)
Faction: Hired by the Grey Court
Description
Ogre who blocked the Old Bridge. Killed by the party in session 3 (Vex got the final hit). Carried Grub''s Iron Key.', true, null, 5),
  ('places', 'The Vale of Morrow', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Vale of Morrow"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Region"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Green river valley with farms, ruined imperial forts and misty forests. The river Wend runs through it. A fog called the Grey rolls down from the mountains."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "About 3,000 imperial soldiers are buried in mass graves under the valley floor."}]}]}]}'::jsonb, 'The Vale of Morrow
Type: Region
Description
Green river valley with farms, ruined imperial forts and misty forests. The river Wend runs through it. A fog called the Grey rolls down from the mountains.
Secrets
About 3,000 imperial soldiers are buried in mass graves under the valley floor.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Vale of Morrow"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Region"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Green river valley with farms, ruined imperial forts and misty forests. The river Wend runs through it. A fog called the Grey rolls down from the mountains."}]}]}'::jsonb, 'The Vale of Morrow
Type: Region
Description
Green river valley with farms, ruined imperial forts and misty forests. The river Wend runs through it. A fog called the Grey rolls down from the mountains.', true, null, 6),
  ('places', 'Hollowford', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Hollowford"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Market town"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Vale of Morrow"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "The party''s home base. A stone bridge, a busy market and the Drowned Lantern tavern."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Important NPCs here"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Mayor Edda Thorne"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Pell the barkeep"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "The Lanternhands run their smuggling out of the tavern cellar."}]}]}]}'::jsonb, 'Hollowford
Type: Market town
Located in: The Vale of Morrow
Description
The party''s home base. A stone bridge, a busy market and the Drowned Lantern tavern.
Important NPCs here
Mayor Edda Thorne
Pell the barkeep
Secrets
The Lanternhands run their smuggling out of the tavern cellar.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Hollowford"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Market town"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Vale of Morrow"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "The party''s home base. A stone bridge, a busy market and the Drowned Lantern tavern."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Important NPCs here"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Mayor Edda Thorne"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Pell the barkeep"}]}]}]}]}'::jsonb, 'Hollowford
Type: Market town
Located in: The Vale of Morrow
Description
The party''s home base. A stone bridge, a busy market and the Drowned Lantern tavern.
Important NPCs here
Mayor Edda Thorne
Pell the barkeep', true, null, 7),
  ('places', 'The Drowned Lantern', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Drowned Lantern"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Tavern"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hollowford"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "A crooked tavern on the river with a lantern hanging underwater by the dock."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Important NPCs here"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Pell the barkeep"}]}]}]}]}'::jsonb, 'The Drowned Lantern
Type: Tavern
Located in: Hollowford
Description
A crooked tavern on the river with a lantern hanging underwater by the dock.
Important NPCs here
Pell the barkeep', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Drowned Lantern"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Tavern"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Hollowford"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "A crooked tavern on the river with a lantern hanging underwater by the dock."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Important NPCs here"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Pell the barkeep"}]}]}]}]}'::jsonb, 'The Drowned Lantern
Type: Tavern
Located in: Hollowford
Description
A crooked tavern on the river with a lantern hanging underwater by the dock.
Important NPCs here
Pell the barkeep', true, null, 8),
  ('places', 'Saint Aldric''s Abbey', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Saint Aldric''s Abbey"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Monastery"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Vale of Morrow, on a cliff above the river"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Where the Ashen Crown was kept for 200 years. Now half-empty after the theft."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Important NPCs here"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Abbess Morwen"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "The theft was an inside job."}]}]}]}'::jsonb, 'Saint Aldric''s Abbey
Type: Monastery
Located in: The Vale of Morrow, on a cliff above the river
Description
Where the Ashen Crown was kept for 200 years. Now half-empty after the theft.
Important NPCs here
Abbess Morwen
Secrets
The theft was an inside job.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Saint Aldric''s Abbey"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Monastery"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Vale of Morrow, on a cliff above the river"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Where the Ashen Crown was kept for 200 years. Now half-empty after the theft."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Important NPCs here"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Abbess Morwen"}]}]}]}]}'::jsonb, 'Saint Aldric''s Abbey
Type: Monastery
Located in: The Vale of Morrow, on a cliff above the river
Description
Where the Ashen Crown was kept for 200 years. Now half-empty after the theft.
Important NPCs here
Abbess Morwen', true, null, 9),
  ('places', 'Greyspire Watchtower', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Greyspire Watchtower"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Ruined fort / dungeon"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Northern Vale, at the edge of the Grey"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "A collapsed imperial tower. Goblins have been seen there."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Secrets"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "The Ashen Crown is hidden in the vault under the tower. Grub''s Iron Key opens the vault. Grub guarded the road to it until the party killed him."}]}]}]}'::jsonb, 'Greyspire Watchtower
Type: Ruined fort / dungeon
Located in: Northern Vale, at the edge of the Grey
Description
A collapsed imperial tower. Goblins have been seen there.
Secrets
The Ashen Crown is hidden in the vault under the tower. Grub''s Iron Key opens the vault. Grub guarded the road to it until the party killed him.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Greyspire Watchtower"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Ruined fort / dungeon"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Northern Vale, at the edge of the Grey"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "A collapsed imperial tower. Goblins have been seen there."}]}]}'::jsonb, 'Greyspire Watchtower
Type: Ruined fort / dungeon
Located in: Northern Vale, at the edge of the Grey
Description
A collapsed imperial tower. Goblins have been seen there.', true, null, 10),
  ('places', 'The Old Bridge', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Old Bridge"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Landmark"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Road between Hollowford and Greyspire Watchtower"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Where the party fought Grub the ogre and two goblins in session 3."}]}]}'::jsonb, 'The Old Bridge
Type: Landmark
Located in: Road between Hollowford and Greyspire Watchtower
Description
Where the party fought Grub the ogre and two goblins in session 3.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Old Bridge"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Type: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Landmark"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Located in: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Road between Hollowford and Greyspire Watchtower"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Description"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Where the party fought Grub the ogre and two goblins in session 3."}]}]}'::jsonb, 'The Old Bridge
Type: Landmark
Located in: Road between Hollowford and Greyspire Watchtower
Description
Where the party fought Grub the ogre and two goblins in session 3.', true, null, 11),
  ('factions', 'Order of Saint Aldric', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Order of Saint Aldric"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Goal: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Protect the Vale and guard the Crown"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Leader: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Abbess Morwen"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Allies / enemies: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Allied with Hollowford; distrusts the Lanternhands"}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Hidden plans"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Morwen is secretly corrupting the order from inside."}]}]}]}'::jsonb, 'Order of Saint Aldric
Goal: Protect the Vale and guard the Crown
Leader: Abbess Morwen
Allies / enemies: Allied with Hollowford; distrusts the Lanternhands
Hidden plans
Morwen is secretly corrupting the order from inside.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Order of Saint Aldric"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Goal: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Protect the Vale and guard the Crown"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Leader: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Abbess Morwen"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Allies / enemies: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Allied with Hollowford; distrusts the Lanternhands"}]}]}'::jsonb, 'Order of Saint Aldric
Goal: Protect the Vale and guard the Crown
Leader: Abbess Morwen
Allies / enemies: Allied with Hollowford; distrusts the Lanternhands', true, null, 12),
  ('factions', 'The Lanternhands', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Lanternhands"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Goal: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Control smuggling on the river Wend and make money"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Leader: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "\"The Wick\" (never seen)"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Allies / enemies: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Rivals of the Order"}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Hidden plans"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "\"The Wick\" doesn''t exist; Pell invented him so nobody targets the real leadership. They pay off Mayor Edda Thorne."}]}]}]}'::jsonb, 'The Lanternhands
Goal: Control smuggling on the river Wend and make money
Leader: "The Wick" (never seen)
Allies / enemies: Rivals of the Order
Hidden plans
"The Wick" doesn''t exist; Pell invented him so nobody targets the real leadership. They pay off Mayor Edda Thorne.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Lanternhands"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Goal: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Control smuggling on the river Wend and make money"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Leader: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "\"The Wick\" (never seen)"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Allies / enemies: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Rivals of the Order"}]}]}'::jsonb, 'The Lanternhands
Goal: Control smuggling on the river Wend and make money
Leader: "The Wick" (never seen)
Allies / enemies: Rivals of the Order', true, null, 13),
  ('factions', 'The Grey Court', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Grey Court"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Goal: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Restore the dead empire"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Leader: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Lord Varn Malchor"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Allies / enemies: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Secret deal with Abbess Morwen; enemy of everyone else"}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Hidden plans"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Once the army wakes, Varn plans to betray Morwen."}]}]}]}'::jsonb, 'The Grey Court
Goal: Restore the dead empire
Leader: Lord Varn Malchor
Allies / enemies: Secret deal with Abbess Morwen; enemy of everyone else
Hidden plans
Once the army wakes, Varn plans to betray Morwen.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Grey Court"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Goal: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Restore the dead empire"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Leader: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Lord Varn Malchor"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Allies / enemies: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Secret deal with Abbess Morwen; enemy of everyone else"}]}]}'::jsonb, 'The Grey Court
Goal: Restore the dead empire
Leader: Lord Varn Malchor
Allies / enemies: Secret deal with Abbess Morwen; enemy of everyone else', false, null, 14),
  ('goals', 'Recover the Ashen Crown', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Recover the Ashen Crown"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Given by: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Abbess Morwen"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Reward: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "500 gp + the Order''s favor"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Find out who stole the Crown"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Find where it is hidden"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Bring it back to the abbey"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "DM notes"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "The Crown is in the vault under Greyspire Watchtower. Bringing it back to Morwen is exactly what she wants."}]}]}]}'::jsonb, 'Recover the Ashen Crown
Given by: Abbess Morwen
Reward: 500 gp + the Order''s favor
What needs to happen
Find out who stole the Crown
Find where it is hidden
Bring it back to the abbey
DM notes
The Crown is in the vault under Greyspire Watchtower. Bringing it back to Morwen is exactly what she wants.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Recover the Ashen Crown"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Given by: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Abbess Morwen"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Reward: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "500 gp + the Order''s favor"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Find out who stole the Crown"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Find where it is hidden"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Bring it back to the abbey"}]}]}]}]}'::jsonb, 'Recover the Ashen Crown
Given by: Abbess Morwen
Reward: 500 gp + the Order''s favor
What needs to happen
Find out who stole the Crown
Find where it is hidden
Bring it back to the abbey', true, 'open', 15),
  ('goals', 'Clear the Old Bridge', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Clear the Old Bridge"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Given by: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Mayor Edda Thorne"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Reward: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "50 gp"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Get rid of whatever blocks the road north"}]}]}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Done in session 3: Grub the ogre and two goblins defeated."}]}]}'::jsonb, 'Clear the Old Bridge
Given by: Mayor Edda Thorne
Reward: 50 gp
What needs to happen
Get rid of whatever blocks the road north
Done in session 3: Grub the ogre and two goblins defeated.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Clear the Old Bridge"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Given by: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Mayor Edda Thorne"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Reward: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "50 gp"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Get rid of whatever blocks the road north"}]}]}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Done in session 3: Grub the ogre and two goblins defeated."}]}]}'::jsonb, 'Clear the Old Bridge
Given by: Mayor Edda Thorne
Reward: 50 gp
What needs to happen
Get rid of whatever blocks the road north
Done in session 3: Grub the ogre and two goblins defeated.', true, 'done', 16),
  ('goals', 'Pay back Vex''s debt (80 gp)', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Pay back Vex''s debt"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Given by: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Pell"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Reward: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Lanternhands stop following Vex"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Pay Pell 80 gp, or do a job for him"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "DM notes"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Pell will offer to wipe the debt if Vex steals Kessa''s abbey map back for him."}]}]}]}'::jsonb, 'Pay back Vex''s debt
Given by: Pell
Reward: The Lanternhands stop following Vex
What needs to happen
Pay Pell 80 gp, or do a job for him
DM notes
Pell will offer to wipe the debt if Vex steals Kessa''s abbey map back for him.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Pay back Vex''s debt"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Given by: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Pell"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Reward: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "The Lanternhands stop following Vex"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Pay Pell 80 gp, or do a job for him"}]}]}]}]}'::jsonb, 'Pay back Vex''s debt
Given by: Pell
Reward: The Lanternhands stop following Vex
What needs to happen
Pay Pell 80 gp, or do a job for him', true, 'open', 17),
  ('goals', 'Find the source of the Grey', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Find the source of the Grey"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Given by: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Orrin''s own goal"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Reward: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Knowledge"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Learn what the Grey is"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Follow it to where it starts"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "DM notes"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "It leads to Lord Varn Malchor beyond the mountains."}]}]}]}'::jsonb, 'Find the source of the Grey
Given by: Orrin''s own goal
Reward: Knowledge
What needs to happen
Learn what the Grey is
Follow it to where it starts
DM notes
It leads to Lord Varn Malchor beyond the mountains.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Find the source of the Grey"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Given by: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Orrin''s own goal"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Reward: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Knowledge"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Learn what the Grey is"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Follow it to where it starts"}]}]}]}]}'::jsonb, 'Find the source of the Grey
Given by: Orrin''s own goal
Reward: Knowledge
What needs to happen
Learn what the Grey is
Follow it to where it starts', true, 'open', 18),
  ('goals', 'Milestone: the party opens the Greyspire vault', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The party opens the Greyspire vault"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Party reaches Greyspire Watchtower"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "They use Grub''s Iron Key on the vault door"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "They find the Ashen Crown, and the first sign of the dead army"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "DM notes"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Must happen before session 6. Lyra''s Abbey Medallion glows when they get close."}]}]}]}'::jsonb, 'The party opens the Greyspire vault
What needs to happen
Party reaches Greyspire Watchtower
They use Grub''s Iron Key on the vault door
They find the Ashen Crown, and the first sign of the dead army
DM notes
Must happen before session 6. Lyra''s Abbey Medallion glows when they get close.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The party opens the Greyspire vault"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Party reaches Greyspire Watchtower"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "They use Grub''s Iron Key on the vault door"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "They find the Ashen Crown, and the first sign of the dead army"}]}]}]}]}'::jsonb, 'The party opens the Greyspire vault
What needs to happen
Party reaches Greyspire Watchtower
They use Grub''s Iron Key on the vault door
They find the Ashen Crown, and the first sign of the dead army', false, 'open', 19),
  ('goals', 'Milestone: Morwen''s betrayal is revealed', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Morwen''s betrayal is revealed"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Clues point to an inside job at the abbey"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The party learns Morwen arranged the theft"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Kessa may turn on Morwen if she learns about the dead army"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "DM notes"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Big twist for the middle of the campaign. Don''t reveal before the vault is opened."}]}]}]}'::jsonb, 'Morwen''s betrayal is revealed
What needs to happen
Clues point to an inside job at the abbey
The party learns Morwen arranged the theft
Kessa may turn on Morwen if she learns about the dead army
DM notes
Big twist for the middle of the campaign. Don''t reveal before the vault is opened.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Morwen''s betrayal is revealed"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Clues point to an inside job at the abbey"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The party learns Morwen arranged the theft"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Kessa may turn on Morwen if she learns about the dead army"}]}]}]}]}'::jsonb, 'Morwen''s betrayal is revealed
What needs to happen
Clues point to an inside job at the abbey
The party learns Morwen arranged the theft
Kessa may turn on Morwen if she learns about the dead army', false, 'open', 20),
  ('goals', 'Milestone: the Fog Lord shows himself', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Fog Lord shows himself"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Rumors of \"the Fog Lord\" grow"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Lord Varn Malchor appears in the Grey"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "DM notes"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Final act. Varn wants the Crown to wake the army himself."}]}]}]}'::jsonb, 'The Fog Lord shows himself
What needs to happen
Rumors of "the Fog Lord" grow
Lord Varn Malchor appears in the Grey
DM notes
Final act. Varn wants the Crown to wake the army himself.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Fog Lord shows himself"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What needs to happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Rumors of \"the Fog Lord\" grow"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Lord Varn Malchor appears in the Grey"}]}]}]}]}'::jsonb, 'The Fog Lord shows himself
What needs to happen
Rumors of "the Fog Lord" grow
Lord Varn Malchor appears in the Grey', false, 'open', 21),
  ('lore', 'The Ashen Crown', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Ashen Crown"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Owner / location: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Stolen; location unknown"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What it does"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Legendary crown of the last emperor."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Hidden properties"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "The wearer can command the undead soldiers under the Vale. Each use costs the wearer a level of Exhaustion. Hidden in the vault under Greyspire Watchtower."}]}]}]}'::jsonb, 'The Ashen Crown
Owner / location: Stolen; location unknown
What it does
Legendary crown of the last emperor.
Hidden properties
The wearer can command the undead soldiers under the Vale. Each use costs the wearer a level of Exhaustion. Hidden in the vault under Greyspire Watchtower.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The Ashen Crown"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Owner / location: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Stolen; location unknown"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What it does"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Legendary crown of the last emperor."}]}]}'::jsonb, 'The Ashen Crown
Owner / location: Stolen; location unknown
What it does
Legendary crown of the last emperor.', true, null, 22),
  ('lore', 'Grub''s Iron Key', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Grub''s Iron Key"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Owner / location: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Brakka (looted from the ogre in session 3)"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What it does"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "A heavy iron key with an imperial seal. Unknown purpose."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Hidden properties"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "It opens the vault under Greyspire Watchtower."}]}]}]}'::jsonb, 'Grub''s Iron Key
Owner / location: Brakka (looted from the ogre in session 3)
What it does
A heavy iron key with an imperial seal. Unknown purpose.
Hidden properties
It opens the vault under Greyspire Watchtower.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Grub''s Iron Key"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Owner / location: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Brakka (looted from the ogre in session 3)"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What it does"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "A heavy iron key with an imperial seal. Unknown purpose."}]}]}'::jsonb, 'Grub''s Iron Key
Owner / location: Brakka (looted from the ogre in session 3)
What it does
A heavy iron key with an imperial seal. Unknown purpose.', true, null, 23),
  ('lore', 'Lyra''s Abbey Medallion', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Lyra''s Abbey Medallion"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Owner / location: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Lyra"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What it does"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Holy symbol; lets Lyra enter the abbey''s inner halls."}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Hidden properties"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "It glows faintly when near the Crown."}]}]}]}'::jsonb, 'Lyra''s Abbey Medallion
Owner / location: Lyra
What it does
Holy symbol; lets Lyra enter the abbey''s inner halls.
Hidden properties
It glows faintly when near the Crown.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Lyra''s Abbey Medallion"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Owner / location: ", "marks": [{"type": "bold"}]}, {"type": "text", "text": "Lyra"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What it does"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Holy symbol; lets Lyra enter the abbey''s inner halls."}]}]}'::jsonb, 'Lyra''s Abbey Medallion
Owner / location: Lyra
What it does
Holy symbol; lets Lyra enter the abbey''s inner halls.', true, null, 24),
  ('lore', 'Timeline of past sessions', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Timeline of past sessions"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Session 1 \u00b7 19 Sep"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Party meets in the Drowned Lantern. Abbess Morwen hires them to find the stolen Crown."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Session 2 \u00b7 26 Sep"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Investigated the abbey. Met Kessa Nightvane, who escaped with a stolen abbey map. Vex''s debt to Pell revealed."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Session 3 \u00b7 3 Oct"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Fought Grub the ogre and two goblins at the Old Bridge. Orrin dropped to 0 HP and was saved by Lyra. Found Grub''s Iron Key."}]}]}'::jsonb, 'Timeline of past sessions
Session 1 · 19 Sep
Party meets in the Drowned Lantern. Abbess Morwen hires them to find the stolen Crown.
Session 2 · 26 Sep
Investigated the abbey. Met Kessa Nightvane, who escaped with a stolen abbey map. Vex''s debt to Pell revealed.
Session 3 · 3 Oct
Fought Grub the ogre and two goblins at the Old Bridge. Orrin dropped to 0 HP and was saved by Lyra. Found Grub''s Iron Key.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Timeline of past sessions"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Session 1 \u00b7 19 Sep"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Party meets in the Drowned Lantern. Abbess Morwen hires them to find the stolen Crown."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Session 2 \u00b7 26 Sep"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Investigated the abbey. Met Kessa Nightvane, who escaped with a stolen abbey map. Vex''s debt to Pell revealed."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Session 3 \u00b7 3 Oct"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Fought Grub the ogre and two goblins at the Old Bridge. Orrin dropped to 0 HP and was saved by Lyra. Found Grub''s Iron Key."}]}]}'::jsonb, 'Timeline of past sessions
Session 1 · 19 Sep
Party meets in the Drowned Lantern. Abbess Morwen hires them to find the stolen Crown.
Session 2 · 26 Sep
Investigated the abbey. Met Kessa Nightvane, who escaped with a stolen abbey map. Vex''s debt to Pell revealed.
Session 3 · 3 Oct
Fought Grub the ogre and two goblins at the Old Bridge. Orrin dropped to 0 HP and was saved by Lyra. Found Grub''s Iron Key.', true, null, 25),
  ('plans', 'Session 4 plan: Into the Grey', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Session 4: Into the Grey"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Must happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The party learns Grub''s Iron Key carries the imperial seal of Greyspire"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Kessa Nightvane shows up again, wanting the key"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The Grey creeps closer to Hollowford"}]}]}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Scenes"}]}, {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Scene 1: Back at the Drowned Lantern"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Pell offers to wipe Vex''s debt if they bring him Kessa''s stolen abbey map. Orrin can recognize the seal on the key (Arcana DC 12)."}]}, {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Scene 2: The road north"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Fog on the road. Goblin scouts from Greyspire watch the party."}]}, {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Scene 3: Kessa''s offer"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Kessa ambushes them at the ruined milestone, then offers a deal: the map for the key."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "If the party goes off track"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "If they go to the abbey instead: Morwen pushes them north, a little too eagerly"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "If they ignore Kessa: she follows them to Greyspire"}]}]}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Loot & rewards"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Kessa''s abbey map (shows a hidden stair under Greyspire)"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "40 gp from the goblin scouts"}]}]}]}, {"type": "secret", "content": [{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "DM only"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Lyra''s medallion glows faintly when they look north toward Greyspire. Don''t explain it yet."}]}]}]}'::jsonb, 'Session 4: Into the Grey
Must happen
The party learns Grub''s Iron Key carries the imperial seal of Greyspire
Kessa Nightvane shows up again, wanting the key
The Grey creeps closer to Hollowford
Scenes
Scene 1: Back at the Drowned Lantern
Pell offers to wipe Vex''s debt if they bring him Kessa''s stolen abbey map. Orrin can recognize the seal on the key (Arcana DC 12).
Scene 2: The road north
Fog on the road. Goblin scouts from Greyspire watch the party.
Scene 3: Kessa''s offer
Kessa ambushes them at the ruined milestone, then offers a deal: the map for the key.
If the party goes off track
If they go to the abbey instead: Morwen pushes them north, a little too eagerly
If they ignore Kessa: she follows them to Greyspire
Loot & rewards
Kessa''s abbey map (shows a hidden stair under Greyspire)
40 gp from the goblin scouts
DM only
Lyra''s medallion glows faintly when they look north toward Greyspire. Don''t explain it yet.', '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Session 4: Into the Grey"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Must happen"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The party learns Grub''s Iron Key carries the imperial seal of Greyspire"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Kessa Nightvane shows up again, wanting the key"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The Grey creeps closer to Hollowford"}]}]}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Scenes"}]}, {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Scene 1: Back at the Drowned Lantern"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Pell offers to wipe Vex''s debt if they bring him Kessa''s stolen abbey map. Orrin can recognize the seal on the key (Arcana DC 12)."}]}, {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Scene 2: The road north"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Fog on the road. Goblin scouts from Greyspire watch the party."}]}, {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Scene 3: Kessa''s offer"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Kessa ambushes them at the ruined milestone, then offers a deal: the map for the key."}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "If the party goes off track"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "If they go to the abbey instead: Morwen pushes them north, a little too eagerly"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "If they ignore Kessa: she follows them to Greyspire"}]}]}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Loot & rewards"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Kessa''s abbey map (shows a hidden stair under Greyspire)"}]}]}, {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "40 gp from the goblin scouts"}]}]}]}]}'::jsonb, 'Session 4: Into the Grey
Must happen
The party learns Grub''s Iron Key carries the imperial seal of Greyspire
Kessa Nightvane shows up again, wanting the key
The Grey creeps closer to Hollowford
Scenes
Scene 1: Back at the Drowned Lantern
Pell offers to wipe Vex''s debt if they bring him Kessa''s stolen abbey map. Orrin can recognize the seal on the key (Arcana DC 12).
Scene 2: The road north
Fog on the road. Goblin scouts from Greyspire watch the party.
Scene 3: Kessa''s offer
Kessa ambushes them at the ruined milestone, then offers a deal: the map for the key.
If the party goes off track
If they go to the abbey instead: Morwen pushes them north, a little too eagerly
If they ignore Kessa: she follows them to Greyspire
Loot & rewards
Kessa''s abbey map (shows a hidden stair under Greyspire)
40 gp from the goblin scouts', false, null, 26);

  -- replace earlier copies of the examples
  delete from public.vault_entries e using ex
   where e.campaign_id = v_c and e.title = ex.title and e.created_by is not distinct from v_dm and e.kind = 'doc'
     and e.folder_id = (select id from public.vault_folders where campaign_id = v_c and kind = ex.kind);

  create temp table made (id uuid, title text) on commit drop;
  with ins as (
    insert into public.vault_entries (campaign_id, folder_id, kind, title, public_doc, public_text, shared, status, sort, created_by, updated_at)
    select v_c, f.id, 'doc', ex.title, ex.pub, ex.pubtxt, ex.shared, ex.status, ex.n, v_dm, now() - make_interval(mins => 100 - ex.n)
    from ex join public.vault_folders f on f.campaign_id = v_c and f.kind = ex.kind
    returning id, title
  )
  insert into made select id, title from ins;

  insert into public.vault_docs (entry_id, campaign_id, doc, text)
  select m.id, v_c, ex.doc, ex.txt from made m join ex on ex.title = m.title;

  raise notice 'Campaign notes: % documents.', (select count(*) from made);
end $$;
