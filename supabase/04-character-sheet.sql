-- =====================================================================
-- D&D AI — Step 5: character sheet data
-- Adds an "attacks" list to characters and fills in the Ashen Crown party.
-- Paste into Supabase → SQL Editor → Run. Run it ONCE.
-- =====================================================================

-- Each attack/spell on the sheet:
-- {"name","kind":"weapon|spell_attack|save|heal","ability":"STR|DEX|finesse|spell",
--  "damage":"1d12","damage_type":"slashing","add_mod":true,"range":"20/60",
--  "save_ability":"DEX","slot":1,"note":"..."}
alter table public.characters add column if not exists attacks jsonb not null default '[]'::jsonb;

-- Brakka Stonehew — Goliath Barbarian 3 (Berserker)
update public.characters set
  proficiencies = '{"saves":["STR","CON"],"skills":["Athletics","Intimidation","Perception","Survival"],"expertise":[],
                    "armor":["Light","Medium","Shields"],"weapons":["Simple","Martial"],"languages":["Common","Giant"]}',
  attacks = '[{"name":"Greataxe","kind":"weapon","ability":"STR","damage":"1d12","damage_type":"slashing","add_mod":true,"note":"+2 while raging"},
              {"name":"Handaxe","kind":"weapon","ability":"STR","damage":"1d6","damage_type":"slashing","add_mod":true,"range":"20/60"}]',
  features = '["Rage (3/long rest, +2 damage, resistance to bludgeoning/piercing/slashing)","Unarmored Defense","Weapon Mastery","Danger Sense","Reckless Attack","Primal Knowledge","Frenzy (Berserker)","Giant Ancestry","Powerful Build"]',
  inventory = '["Greataxe","Handaxe x4","Explorer''s Pack","Grub''s Iron Key","15 gp"]'
where name = 'Brakka Stonehew';

-- Lyra Venn — Human Cleric 3 (Life Domain)
update public.characters set
  proficiencies = '{"saves":["WIS","CHA"],"skills":["Insight","Medicine","Religion","Persuasion"],"expertise":[],
                    "armor":["Light","Medium","Heavy","Shields"],"weapons":["Simple"],"languages":["Common","Celestial"]}',
  spells = '{"ability":"WIS","slots":{"1":4,"2":2}}',
  attacks = '[{"name":"Mace","kind":"weapon","ability":"STR","damage":"1d6","damage_type":"bludgeoning","add_mod":true},
              {"name":"Sacred Flame","kind":"save","ability":"spell","save_ability":"DEX","damage":"1d8","damage_type":"radiant","add_mod":false,"range":"60 ft"},
              {"name":"Healing Word","kind":"heal","ability":"spell","damage":"2d4","add_mod":true,"slot":1,"range":"60 ft","note":"bonus action"},
              {"name":"Cure Wounds","kind":"heal","ability":"spell","damage":"2d8","add_mod":true,"slot":1,"range":"touch"}]',
  features = '["Spellcasting (WIS)","Divine Order","Channel Divinity (2/short rest)","Disciple of Life","Preserve Life","Life Domain Spells"]',
  inventory = '["Chain Mail","Shield","Mace","Holy Symbol (Abbey Medallion)","Priest''s Pack","10 gp"]'
where name = 'Lyra Venn';

-- Vex — Halfling Rogue 3 (Thief)
update public.characters set
  proficiencies = '{"saves":["DEX","INT"],"skills":["Stealth","Sleight of Hand","Acrobatics","Perception","Deception"],"expertise":["Stealth","Sleight of Hand"],
                    "armor":["Light"],"weapons":["Simple","Martial (Finesse or Light)"],"tools":["Thieves'' Tools"],"languages":["Common","Halfling","Thieves'' Cant"]}',
  attacks = '[{"name":"Shortbow","kind":"weapon","ability":"DEX","damage":"1d6","damage_type":"piercing","add_mod":true,"range":"80/320"},
              {"name":"Shortsword","kind":"weapon","ability":"finesse","damage":"1d6","damage_type":"piercing","add_mod":true},
              {"name":"Sneak Attack","kind":"weapon","ability":"DEX","damage":"2d6","damage_type":"piercing","add_mod":false,"damage_only":true,"note":"once per turn, with advantage or an ally nearby"}]',
  features = '["Expertise","Sneak Attack (2d6)","Thieves'' Cant","Weapon Mastery","Cunning Action","Fast Hands (Thief)","Second-Story Work (Thief)","Luck (Halfling)","Brave","Halfling Nimbleness"]',
  inventory = '["Leather Armor","Shortbow + 20 arrows","Shortsword","Thieves'' Tools","Burglar''s Pack","Debt to Pell: 80 gp"]'
where name = 'Vex';

-- Orrin Ashby — Gnome Wizard 3 (Evoker)
update public.characters set
  proficiencies = '{"saves":["INT","WIS"],"skills":["Arcana","History","Investigation","Insight"],"expertise":[],
                    "armor":[],"weapons":["Simple"],"languages":["Common","Gnomish","Draconic"]}',
  spells = '{"ability":"INT","slots":{"1":4,"2":2}}',
  attacks = '[{"name":"Fire Bolt","kind":"spell_attack","ability":"spell","damage":"1d10","damage_type":"fire","add_mod":false,"range":"120 ft"},
              {"name":"Shatter","kind":"save","ability":"spell","save_ability":"CON","damage":"3d8","damage_type":"thunder","add_mod":false,"slot":2,"range":"60 ft","note":"half on a save"},
              {"name":"Magic Missile","kind":"weapon","ability":"spell","damage":"3d4+3","damage_type":"force","add_mod":false,"damage_only":true,"slot":1,"note":"always hits"},
              {"name":"Dagger","kind":"weapon","ability":"finesse","damage":"1d4","damage_type":"piercing","add_mod":true,"range":"20/60"}]',
  features = '["Spellcasting (INT)","Ritual Adept","Arcane Recovery","Scholar","Evocation Savant","Potent Cantrip","Gnomish Cunning"]',
  inventory = '["Spellbook","Quarterstaff","Dagger","Arcane Focus (crystal)","Scholar''s Pack","Notes on the old empire"]'
where name = 'Orrin Ashby';
