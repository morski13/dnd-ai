-- =====================================================================
-- D&D AI — Item library, 2014 rules, part 1 of 3 (310 items)
-- Item text: System Reference Document 5.1 by Wizards of the Coast LLC,
-- https://www.dndbeyond.com/srd, licensed under CC-BY-4.0.
-- Data prepared by the 5e-bits 5e-database project (MIT license).
-- Run 13-items-shops.sql first. Then the parts, in any order. Each part is safe to run again.
-- Paste the WHOLE file (Ctrl+A, Ctrl+C) into a new query; nothing highlighted when you press Run.
-- =====================================================================

insert into public.srd_items (id, rules, name, kind, category, rarity, attunement, cost_cp, weight, bundle, summary, description, data) values
('2014:club', '2014', 'Club', 'weapon', 'Simple Melee Weapon', null, false, 10, 2, null, '1d4 Bludgeoning · Light', '', '{"damage": "1d4", "type": "Bludgeoning", "props": ["Light"], "range": {"normal": 5}}'::jsonb),
('2014:dagger', '2014', 'Dagger', 'weapon', 'Simple Melee Weapon', null, false, 200, 1, null, '1d4 Piercing · Finesse · Light · Thrown (20/60)', '', '{"damage": "1d4", "type": "Piercing", "props": ["Finesse", "Light", "Thrown"], "range": {"normal": 5}}'::jsonb),
('2014:greatclub', '2014', 'Greatclub', 'weapon', 'Simple Melee Weapon', null, false, 20, 10, null, '1d8 Bludgeoning · Two-Handed', '', '{"damage": "1d8", "type": "Bludgeoning", "props": ["Two-Handed"], "range": {"normal": 5}}'::jsonb),
('2014:handaxe', '2014', 'Handaxe', 'weapon', 'Simple Melee Weapon', null, false, 500, 2, null, '1d6 Slashing · Light · Thrown (20/60)', '', '{"damage": "1d6", "type": "Slashing", "props": ["Light", "Thrown"], "range": {"normal": 5}}'::jsonb),
('2014:javelin', '2014', 'Javelin', 'weapon', 'Simple Melee Weapon', null, false, 50, 2, null, '1d6 Piercing · Thrown (30/120)', '', '{"damage": "1d6", "type": "Piercing", "props": ["Thrown"], "range": {"normal": 5}}'::jsonb),
('2014:light-hammer', '2014', 'Light hammer', 'weapon', 'Simple Melee Weapon', null, false, 200, 2, null, '1d4 Bludgeoning · Light · Thrown (20/60)', '', '{"damage": "1d4", "type": "Bludgeoning", "props": ["Light", "Thrown"], "range": {"normal": 5}}'::jsonb),
('2014:mace', '2014', 'Mace', 'weapon', 'Simple Melee Weapon', null, false, 500, 4, null, '1d6 Bludgeoning', '', '{"damage": "1d6", "type": "Bludgeoning", "props": [], "range": {"normal": 5}}'::jsonb),
('2014:quarterstaff', '2014', 'Quarterstaff', 'weapon', 'Simple Melee Weapon', null, false, 20, 4, null, '1d6 Bludgeoning · Versatile (1d8)', '', '{"damage": "1d6", "type": "Bludgeoning", "twoHanded": "1d8", "props": ["Versatile"], "range": {"normal": 5}}'::jsonb),
('2014:sickle', '2014', 'Sickle', 'weapon', 'Simple Melee Weapon', null, false, 100, 2, null, '1d4 Slashing · Light', '', '{"damage": "1d4", "type": "Slashing", "props": ["Light"], "range": {"normal": 5}}'::jsonb),
('2014:spear', '2014', 'Spear', 'weapon', 'Simple Melee Weapon', null, false, 100, 3, null, '1d6 Piercing · Thrown (20/60) · Versatile (1d8)', '', '{"damage": "1d6", "type": "Piercing", "twoHanded": "1d8", "props": ["Thrown", "Versatile"], "range": {"normal": 5}}'::jsonb),
('2014:crossbow-light', '2014', 'Crossbow, light', 'weapon', 'Simple Ranged Weapon', null, false, 2500, 5, null, '1d8 Piercing · Ammunition (80/320) · Loading · Two-Handed', '', '{"damage": "1d8", "type": "Piercing", "props": ["Ammunition", "Loading", "Two-Handed"], "range": {"normal": 80, "long": 320}}'::jsonb),
('2014:dart', '2014', 'Dart', 'weapon', 'Simple Ranged Weapon', null, false, 5, 0.25, null, '1d4 Piercing · Finesse · Thrown (20/60)', '', '{"damage": "1d4", "type": "Piercing", "props": ["Finesse", "Thrown"], "range": {"normal": 20, "long": 60}}'::jsonb),
('2014:shortbow', '2014', 'Shortbow', 'weapon', 'Simple Ranged Weapon', null, false, 2500, 2, null, '1d6 Piercing · Ammunition (80/320) · Two-Handed', '', '{"damage": "1d6", "type": "Piercing", "props": ["Ammunition", "Two-Handed"], "range": {"normal": 80, "long": 320}}'::jsonb),
('2014:sling', '2014', 'Sling', 'weapon', 'Simple Ranged Weapon', null, false, 10, 0, null, '1d4 Bludgeoning · Ammunition (30/120)', '', '{"damage": "1d4", "type": "Bludgeoning", "props": ["Ammunition"], "range": {"normal": 30, "long": 120}}'::jsonb),
('2014:battleaxe', '2014', 'Battleaxe', 'weapon', 'Martial Melee Weapon', null, false, 1000, 4, null, '1d8 Slashing · Versatile (1d10)', '', '{"damage": "1d8", "type": "Slashing", "twoHanded": "1d10", "props": ["Versatile"], "range": {"normal": 5}}'::jsonb),
('2014:flail', '2014', 'Flail', 'weapon', 'Martial Melee Weapon', null, false, 1000, 2, null, '1d8 Bludgeoning', '', '{"damage": "1d8", "type": "Bludgeoning", "range": {"normal": 5}}'::jsonb),
('2014:glaive', '2014', 'Glaive', 'weapon', 'Martial Melee Weapon', null, false, 2000, 6, null, '1d10 Slashing · Heavy · Reach · Two-Handed', '', '{"damage": "1d10", "type": "Slashing", "props": ["Heavy", "Reach", "Two-Handed"], "range": {"normal": 5}}'::jsonb),
('2014:greataxe', '2014', 'Greataxe', 'weapon', 'Martial Melee Weapon', null, false, 3000, 7, null, '1d12 Slashing · Heavy · Two-Handed', '', '{"damage": "1d12", "type": "Slashing", "props": ["Heavy", "Two-Handed"], "range": {"normal": 5}}'::jsonb),
('2014:greatsword', '2014', 'Greatsword', 'weapon', 'Martial Melee Weapon', null, false, 5000, 6, null, '2d6 Slashing · Heavy · Two-Handed', '', '{"damage": "2d6", "type": "Slashing", "props": ["Heavy", "Two-Handed"], "range": {"normal": 5}}'::jsonb),
('2014:halberd', '2014', 'Halberd', 'weapon', 'Martial Melee Weapon', null, false, 2000, 6, null, '1d10 Slashing · Heavy · Reach · Two-Handed', '', '{"damage": "1d10", "type": "Slashing", "props": ["Heavy", "Reach", "Two-Handed"], "range": {"normal": 5}}'::jsonb),
('2014:lance', '2014', 'Lance', 'weapon', 'Martial Melee Weapon', null, false, 1000, 6, null, '1d12 Piercing · Reach · Special', 'You have disadvantage when you use a lance to attack a target within 5 feet of you. Also, a lance requires two hands to wield when you aren''t mounted.', '{"damage": "1d12", "type": "Piercing", "props": ["Reach", "Special"], "range": {"normal": 5}}'::jsonb),
('2014:longsword', '2014', 'Longsword', 'weapon', 'Martial Melee Weapon', null, false, 1500, 3, null, '1d8 Slashing · Versatile (1d10)', '', '{"damage": "1d8", "type": "Slashing", "twoHanded": "1d10", "props": ["Versatile"], "range": {"normal": 5}}'::jsonb),
('2014:maul', '2014', 'Maul', 'weapon', 'Martial Melee Weapon', null, false, 1000, 10, null, '2d6 Bludgeoning · Heavy · Two-Handed', '', '{"damage": "2d6", "type": "Bludgeoning", "props": ["Heavy", "Two-Handed"], "range": {"normal": 5}}'::jsonb),
('2014:morningstar', '2014', 'Morningstar', 'weapon', 'Martial Melee Weapon', null, false, 1500, 4, null, '1d8 Piercing', '', '{"damage": "1d8", "type": "Piercing", "range": {"normal": 5}}'::jsonb),
('2014:pike', '2014', 'Pike', 'weapon', 'Martial Melee Weapon', null, false, 500, 18, null, '1d10 Piercing · Heavy · Reach · Two-Handed', '', '{"damage": "1d10", "type": "Piercing", "props": ["Heavy", "Reach", "Two-Handed"], "range": {"normal": 5}}'::jsonb),
('2014:rapier', '2014', 'Rapier', 'weapon', 'Martial Melee Weapon', null, false, 2500, 2, null, '1d8 Piercing · Finesse', '', '{"damage": "1d8", "type": "Piercing", "props": ["Finesse"], "range": {"normal": 5}}'::jsonb),
('2014:scimitar', '2014', 'Scimitar', 'weapon', 'Martial Melee Weapon', null, false, 2500, 3, null, '1d6 Slashing · Finesse · Light', '', '{"damage": "1d6", "type": "Slashing", "props": ["Finesse", "Light"], "range": {"normal": 5}}'::jsonb),
('2014:shortsword', '2014', 'Shortsword', 'weapon', 'Martial Melee Weapon', null, false, 1000, 2, null, '1d6 Piercing · Finesse · Light', '', '{"damage": "1d6", "type": "Piercing", "props": ["Finesse", "Light"], "range": {"normal": 5}}'::jsonb),
('2014:trident', '2014', 'Trident', 'weapon', 'Martial Melee Weapon', null, false, 500, 4, null, '1d6 Piercing · Thrown (20/60) · Versatile (1d8)', '', '{"damage": "1d6", "type": "Piercing", "twoHanded": "1d8", "props": ["Thrown", "Versatile"], "range": {"normal": 5}}'::jsonb),
('2014:war-pick', '2014', 'War pick', 'weapon', 'Martial Melee Weapon', null, false, 500, 2, null, '1d8 Piercing', '', '{"damage": "1d8", "type": "Piercing", "range": {"normal": 5}}'::jsonb),
('2014:warhammer', '2014', 'Warhammer', 'weapon', 'Martial Melee Weapon', null, false, 1500, 2, null, '1d8 Bludgeoning · Versatile (1d10)', '', '{"damage": "1d8", "type": "Bludgeoning", "twoHanded": "1d10", "props": ["Versatile"], "range": {"normal": 5}}'::jsonb),
('2014:whip', '2014', 'Whip', 'weapon', 'Martial Melee Weapon', null, false, 200, 3, null, '1d4 Slashing · Finesse · Reach', '', '{"damage": "1d4", "type": "Slashing", "props": ["Finesse", "Reach"], "range": {"normal": 5}}'::jsonb),
('2014:blowgun', '2014', 'Blowgun', 'weapon', 'Martial Ranged Weapon', null, false, 1000, 1, null, '1 Piercing · Ammunition (25/100) · Loading', '', '{"damage": "1", "type": "Piercing", "props": ["Ammunition", "Loading"], "range": {"normal": 25, "long": 100}}'::jsonb),
('2014:crossbow-hand', '2014', 'Crossbow, hand', 'weapon', 'Martial Ranged Weapon', null, false, 7500, 3, null, '1d6 Piercing · Ammunition (30/120) · Light · Loading', '', '{"damage": "1d6", "type": "Piercing", "props": ["Ammunition", "Light", "Loading"], "range": {"normal": 30, "long": 120}}'::jsonb),
('2014:crossbow-heavy', '2014', 'Crossbow, heavy', 'weapon', 'Martial Ranged Weapon', null, false, 5000, 18, null, '1d10 Piercing · Ammunition (100/400) · Heavy · Loading · Two-Handed', '', '{"damage": "1d10", "type": "Piercing", "props": ["Ammunition", "Heavy", "Loading", "Two-Handed"], "range": {"normal": 100, "long": 400}}'::jsonb),
('2014:longbow', '2014', 'Longbow', 'weapon', 'Martial Ranged Weapon', null, false, 5000, 2, null, '1d8 Piercing · Ammunition (150/600) · Heavy · Two-Handed', '', '{"damage": "1d8", "type": "Piercing", "props": ["Ammunition", "Heavy", "Two-Handed"], "range": {"normal": 150, "long": 600}}'::jsonb),
('2014:net', '2014', 'Net', 'weapon', 'Martial Ranged Weapon', null, false, 100, 3, null, null, 'A Large or smaller creature hit by a net is restrained until it is freed. A net has no effect on creatures that are formless, or creatures that are Huge or larger. A creature can use its action to make a DC 10 Strength check, freeing itself or another creature within its reach on a success. Dealing 5 slashing damage to the net (AC 10) also frees the creature without harming it, ending the effect and destroying the net. When you use an action, bonus action, or reaction to attack with a net, you can make only one attack regardless of the number of attacks you can normally make.', '{"props": ["Thrown", "Special"], "range": {"normal": 5, "long": 15}}'::jsonb),
('2014:padded-armor', '2014', 'Padded Armor', 'armor', 'Light Armor', null, false, 500, 8, null, 'AC 11 + Dex · Stealth disadvantage', '', '{"ac": {"base": 11, "dex_bonus": true}}'::jsonb),
('2014:leather-armor', '2014', 'Leather Armor', 'armor', 'Light Armor', null, false, 1000, 10, null, 'AC 11 + Dex', '', '{"ac": {"base": 11, "dex_bonus": true}}'::jsonb),
('2014:studded-leather-armor', '2014', 'Studded Leather Armor', 'armor', 'Light Armor', null, false, 4500, 13, null, 'AC 12 + Dex', '', '{"ac": {"base": 12, "dex_bonus": true}}'::jsonb),
('2014:hide-armor', '2014', 'Hide Armor', 'armor', 'Medium Armor', null, false, 1000, 12, null, 'AC 12 + Dex (max 2)', '', '{"ac": {"base": 12, "dex_bonus": true, "max_bonus": 2}}'::jsonb),
('2014:chain-shirt', '2014', 'Chain Shirt', 'armor', 'Medium Armor', null, false, 5000, 20, null, 'AC 13 + Dex (max 2)', '', '{"ac": {"base": 13, "dex_bonus": true, "max_bonus": 2}}'::jsonb),
('2014:scale-mail', '2014', 'Scale Mail', 'armor', 'Medium Armor', null, false, 5000, 45, null, 'AC 14 + Dex (max 2) · Stealth disadvantage', '', '{"ac": {"base": 14, "dex_bonus": true, "max_bonus": 2}}'::jsonb),
('2014:breastplate', '2014', 'Breastplate', 'armor', 'Medium Armor', null, false, 40000, 20, null, 'AC 14 + Dex (max 2)', '', '{"ac": {"base": 14, "dex_bonus": true, "max_bonus": 2}}'::jsonb),
('2014:half-plate-armor', '2014', 'Half Plate Armor', 'armor', 'Medium Armor', null, false, 75000, 40, null, 'AC 15 + Dex (max 2) · Stealth disadvantage', '', '{"ac": {"base": 15, "dex_bonus": true, "max_bonus": 2}}'::jsonb),
('2014:ring-mail', '2014', 'Ring Mail', 'armor', 'Heavy Armor', null, false, 3000, 40, null, 'AC 14 · Stealth disadvantage', '', '{"ac": {"base": 14, "dex_bonus": false}}'::jsonb),
('2014:chain-mail', '2014', 'Chain Mail', 'armor', 'Heavy Armor', null, false, 7500, 55, null, 'AC 16 · Str 13 · Stealth disadvantage', '', '{"ac": {"base": 16, "dex_bonus": false}}'::jsonb),
('2014:splint-armor', '2014', 'Splint Armor', 'armor', 'Heavy Armor', null, false, 20000, 60, null, 'AC 17 · Str 15 · Stealth disadvantage', '', '{"ac": {"base": 17, "dex_bonus": false}}'::jsonb),
('2014:plate-armor', '2014', 'Plate Armor', 'armor', 'Heavy Armor', null, false, 150000, 65, null, 'AC 18 · Str 15 · Stealth disadvantage', '', '{"ac": {"base": 18, "dex_bonus": false}}'::jsonb),
('2014:shield', '2014', 'Shield', 'armor', 'Shield', null, false, 1000, 6, null, '+2 AC', '', '{"ac": {"base": 2, "dex_bonus": false}}'::jsonb),
('2014:abacus', '2014', 'Abacus', 'gear', 'Standard Gear', null, false, 200, 2, null, null, '', null),
('2014:acid-vial', '2014', 'Acid (vial)', 'gear', 'Standard Gear', null, false, 2500, 1, null, null, 'As an action, you can splash the contents of this vial onto a creature within 5 feet of you or throw the vial up to 20 feet, shattering it on impact. In either case, make a ranged attack against a creature or object, treating the acid as an improvised weapon.
On a hit, the target takes 2d6 acid damage.', null),
('2014:alchemists-fire-flask', '2014', 'Alchemist''s fire (flask)', 'gear', 'Standard Gear', null, false, 5000, 1, null, null, 'This sticky, adhesive fluid ignites when exposed to air.
As an action, you can throw this flask up to 20 feet, shattering it on impact. Make a ranged attack against a creature or object, treating the alchemist''s fire as an improvised weapon.
On a hit, the target takes 1d4 fire damage at the start of each of its turns. A creature can end this damage by using its action to make a DC 10 Dexterity check to extinguish the flames.', null),
('2014:alms-box', '2014', 'Alms box', 'gear', 'Standard Gear', null, false, 0, 0, null, null, 'A small box for alms, typically found in a priest''s pack.', null),
('2014:arrow', '2014', 'Arrow', 'gear', 'Ammunition', null, false, 100, 1, 20, 'Bundle of 20', '', null),
('2014:block-of-incense', '2014', 'Block of incense', 'gear', 'Standard Gear', null, false, 0, 0, null, null, 'A block of incense, typically found in a priest''s pack.', null),
('2014:blowgun-needle', '2014', 'Blowgun needle', 'gear', 'Ammunition', null, false, 100, 1, 50, 'Bundle of 50', '', null),
('2014:censer', '2014', 'Censer', 'gear', 'Standard Gear', null, false, 0, 0, null, null, 'A censer, typically found in a priest''s pack.', null),
('2014:crossbow-bolt', '2014', 'Crossbow bolt', 'gear', 'Ammunition', null, false, 100, 1.5, 20, 'Bundle of 20', '', null),
('2014:sling-bullet', '2014', 'Sling bullet', 'gear', 'Ammunition', null, false, 4, 1.5, 20, 'Bundle of 20', '', null),
('2014:amulet', '2014', 'Amulet', 'gear', 'Holy Symbols', null, false, 500, 1, null, null, 'A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.
Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield.', null),
('2014:antitoxin-vial', '2014', 'Antitoxin (vial)', 'gear', 'Standard Gear', null, false, 5000, 0, null, null, 'A creature that drinks this vial of liquid gains advantage on saving throws against poison for 1 hour. It confers no benefit to undead or constructs.', null),
('2014:crystal', '2014', 'Crystal', 'gear', 'Arcane Foci', null, false, 1000, 1, null, null, 'An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus.', null),
('2014:orb', '2014', 'Orb', 'gear', 'Arcane Foci', null, false, 2000, 3, null, null, 'An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus.', null),
('2014:rod', '2014', 'Rod', 'gear', 'Arcane Foci', null, false, 1000, 2, null, null, 'An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus.', null),
('2014:staff', '2014', 'Staff', 'gear', 'Arcane Foci', null, false, 500, 4, null, null, 'An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus.', null),
('2014:wand', '2014', 'Wand', 'gear', 'Arcane Foci', null, false, 1000, 1, null, null, 'An arcane focus is a special item--an orb, a crystal, a rod, a specially constructed staff, a wand-like length of wood, or some similar item--designed to channel the power of arcane spells. A sorcerer, warlock, or wizard can use such an item as a spellcasting focus.', null),
('2014:backpack', '2014', 'Backpack', 'gear', 'Standard Gear', null, false, 200, 5, null, null, '', null),
('2014:ball-bearings-bag-of-1000', '2014', 'Ball bearings (bag of 1,000)', 'gear', 'Standard Gear', null, false, 100, 2, null, null, 'As an action, you can spill these tiny metal balls from their pouch to cover a level, square area that is 10 feet on a side.
A creature moving across the covered area must succeed on a DC 10 Dexterity saving throw or fall prone.
A creature moving through the area at half speed doesn''t need to make the save.', null),
('2014:barrel', '2014', 'Barrel', 'gear', 'Standard Gear', null, false, 200, 70, null, null, '', null),
('2014:basket', '2014', 'Basket', 'gear', 'Standard Gear', null, false, 40, 2, null, null, '', null),
('2014:bedroll', '2014', 'Bedroll', 'gear', 'Standard Gear', null, false, 100, 7, null, null, '', null),
('2014:bell', '2014', 'Bell', 'gear', 'Standard Gear', null, false, 100, 0, null, null, '', null),
('2014:blanket', '2014', 'Blanket', 'gear', 'Standard Gear', null, false, 50, 3, null, null, '', null),
('2014:block-and-tackle', '2014', 'Block and tackle', 'gear', 'Standard Gear', null, false, 100, 5, null, null, 'A set of pulleys with a cable threaded through them and a hook to attach to objects, a block and tackle allows you to hoist up to four times the weight you can normally lift.', null),
('2014:book', '2014', 'Book', 'gear', 'Standard Gear', null, false, 2500, 5, null, null, 'A book might contain poetry, historical accounts, information pertaining to a particular field of lore, diagrams and notes on gnomish contraptions, or just about anything else that can be represented using text or pictures. A book of spells is a spellbook (described later in this section).', null),
('2014:bottle-glass', '2014', 'Bottle, glass', 'gear', 'Standard Gear', null, false, 200, 2, null, null, '', null),
('2014:bucket', '2014', 'Bucket', 'gear', 'Standard Gear', null, false, 5, 2, null, null, '', null),
('2014:caltrops', '2014', 'Caltrops', 'gear', 'Standard Gear', null, false, 5, 2, null, null, 'As an action, you can spread a bag of caltrops to cover a square area that is 5 feet on a side.
Any creature that enters the area must succeed on a DC 15 Dexterity saving throw or stop moving this turn and take 1 piercing damage.
Taking this damage reduces the creature''s walking speed by 10 feet until the creature regains at least 1 hit point.
A creature moving through the area at half speed doesn''t need to make the save.', null),
('2014:candle', '2014', 'Candle', 'gear', 'Standard Gear', null, false, 1, 0, null, null, 'For 1 hour, a candle sheds bright light in a 5-foot radius and dim light for an additional 5 feet.', null),
('2014:case-crossbow-bolt', '2014', 'Case, crossbow bolt', 'gear', 'Standard Gear', null, false, 100, 1, null, null, 'This wooden case can hold up to twenty crossbow bolts.', null),
('2014:case-map-or-scroll', '2014', 'Case, map or scroll', 'gear', 'Standard Gear', null, false, 100, 1, null, null, 'This cylindrical leather case can hold up to ten rolled-up sheets of paper or five rolled-up sheets of parchment.', null),
('2014:chain-10-feet', '2014', 'Chain (10 feet)', 'gear', 'Standard Gear', null, false, 500, 10, null, null, 'A chain has 10 hit points. It can be burst with a successful DC 20 Strength check.', null),
('2014:chalk-1-piece', '2014', 'Chalk (1 piece)', 'gear', 'Standard Gear', null, false, 1, 0, null, null, '', null),
('2014:chest', '2014', 'Chest', 'gear', 'Standard Gear', null, false, 500, 25, null, null, '', null),
('2014:clothes-common', '2014', 'Clothes, common', 'gear', 'Standard Gear', null, false, 50, 3, null, null, '', null),
('2014:clothes-costume', '2014', 'Clothes, costume', 'gear', 'Standard Gear', null, false, 500, 4, null, null, '', null),
('2014:clothes-fine', '2014', 'Clothes, fine', 'gear', 'Standard Gear', null, false, 1500, 6, null, null, '', null),
('2014:clothes-travelers', '2014', 'Clothes, traveler''s', 'gear', 'Standard Gear', null, false, 200, 4, null, null, '', null),
('2014:component-pouch', '2014', 'Component pouch', 'gear', 'Standard Gear', null, false, 2500, 2, null, null, 'A component pouch is a small, watertight leather belt pouch that has compartments to hold all the material components and other special items you need to cast your spells, except for those components that have a specific cost (as indicated in a spell''s description).', null),
('2014:crowbar', '2014', 'Crowbar', 'gear', 'Standard Gear', null, false, 200, 5, null, null, 'Using a crowbar grants advantage to Strength checks where the crowbar''s leverage can be applied.', null),
('2014:sprig-of-mistletoe', '2014', 'Sprig of mistletoe', 'gear', 'Druidic Foci', null, false, 100, 0, null, null, 'A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus.', null),
('2014:totem', '2014', 'Totem', 'gear', 'Druidic Foci', null, false, 100, 0, null, null, 'A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus.', null),
('2014:wooden-staff', '2014', 'Wooden staff', 'gear', 'Druidic Foci', null, false, 500, 4, null, null, 'A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus.', null),
('2014:yew-wand', '2014', 'Yew wand', 'gear', 'Druidic Foci', null, false, 1000, 1, null, null, 'A druidic focus might be a sprig of mistletoe or holly, a wand or scepter made of yew or another special wood, a staff drawn whole out of a living tree, or a totem object incorporating feathers, fur, bones, and teeth from sacred animals. A druid can use such an object as a spellcasting focus.', null),
('2014:emblem', '2014', 'Emblem', 'gear', 'Holy Symbols', null, false, 500, 0, null, null, 'A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.
Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield.', null),
('2014:fishing-tackle', '2014', 'Fishing tackle', 'gear', 'Standard Gear', null, false, 100, 4, null, null, 'This kit includes a wooden rod, silken line, corkwood bobbers, steel hooks, lead sinkers, velvet lures, and narrow netting.', null),
('2014:flask-or-tankard', '2014', 'Flask or tankard', 'gear', 'Standard Gear', null, false, 2, 1, null, null, '', null),
('2014:grappling-hook', '2014', 'Grappling hook', 'gear', 'Standard Gear', null, false, 200, 4, null, null, '', null),
('2014:hammer', '2014', 'Hammer', 'gear', 'Standard Gear', null, false, 100, 3, null, null, '', null),
('2014:hammer-sledge', '2014', 'Hammer, sledge', 'gear', 'Standard Gear', null, false, 200, 10, null, null, '', null),
('2014:holy-water-flask', '2014', 'Holy water (flask)', 'gear', 'Standard Gear', null, false, 2500, 1, null, null, 'As an action, you can splash the contents of this flask onto a creature within 5 feet of you or throw it up to 20 feet, shattering it on impact. In either case, make a ranged attack against a target creature, treating the holy water as an improvised weapon.
If the target is a fiend or undead, it takes 2d6 radiant damage.
A cleric or paladin may create holy water by performing a special ritual.
The ritual takes 1 hour to perform, uses 25 gp worth of powdered silver, and requires the caster to expend a 1st-level spell slot.', null),
('2014:hourglass', '2014', 'Hourglass', 'gear', 'Standard Gear', null, false, 2500, 1, null, null, '', null),
('2014:hunting-trap', '2014', 'Hunting trap', 'gear', 'Standard Gear', null, false, 500, 25, null, null, 'When you use your action to set it, this trap forms a saw-toothed steel ring that snaps shut when a creature steps on a pressure plate in the center. The trap is affixed by a heavy chain to an immobile object, such as a tree or a spike driven into the ground.
A creature that steps on the plate must succeed on a DC 13 Dexterity saving throw or take 1d4 piercing damage and stop moving. Thereafter, until the creature breaks free of the trap, its movement is limited by the length of the chain (typically 3 feet long).
A creature can use its action to make a DC 13 Strength check, freeing itself or another creature within its reach on a success. Each failed check deals 1 piercing damage to the trapped creature.', null),
('2014:ink-1-ounce-bottle', '2014', 'Ink (1 ounce bottle)', 'gear', 'Standard Gear', null, false, 1000, 0, null, null, '', null),
('2014:ink-pen', '2014', 'Ink pen', 'gear', 'Standard Gear', null, false, 2, 0, null, null, '', null),
('2014:jug-or-pitcher', '2014', 'Jug or pitcher', 'gear', 'Standard Gear', null, false, 2, 4, null, null, '', null),
('2014:climbers-kit', '2014', 'Climber''s Kit', 'gear', 'Kits', null, false, 2500, 12, null, null, 'A climber''s kit includes special pitons, boot tips, gloves, and a harness. You can use the climber''s kit as an action to anchor yourself; when you do, you can''t fall more than 25 feet from the point where you anchored yourself, and you can''t climb more than 25 feet away from that point without undoing the anchor.', null),
('2014:disguise-kit', '2014', 'Disguise Kit', 'gear', 'Kits', null, false, 2500, 3, null, null, 'This pouch of cosmetics, hair dye, and small props lets you create disguises that change your physical appearance. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to create a visual disguise.', null),
('2014:forgery-kit', '2014', 'Forgery Kit', 'gear', 'Kits', null, false, 1500, 5, null, null, 'This small box contains a variety of papers and parchments, pens and inks, seals and sealing wax, gold and silver leaf, and other supplies necessary to create convincing forgeries of physical documents. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to create a physical forgery of a document.', null),
('2014:herbalism-kit', '2014', 'Herbalism Kit', 'gear', 'Kits', null, false, 500, 3, null, null, 'This kit contains a variety of instruments such as clippers, mortar and pestle, and pouches and vials used by herbalists to create remedies and potions. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to identify or apply herbs. Also, proficiency with this kit is required to create antitoxin and potions of healing.', null),
('2014:healers-kit', '2014', 'Healer''s Kit', 'gear', 'Kits', null, false, 500, 3, null, null, 'This kit is a leather pouch containing bandages, salves, and splints. The kit has ten uses. As an action, you can expend one use of the kit to stabilize a creature that has 0 hit points, without needing to make a Wisdom (Medicine) check.', null),
('2014:mess-kit', '2014', 'Mess Kit', 'gear', 'Kits', null, false, 20, 1, null, null, 'This tin box contains a cup and simple cutlery. The box clamps together, and one side can be used as a cooking pan and the other as a plate or shallow bowl.', null),
('2014:poisoners-kit', '2014', 'Poisoner''s Kit', 'gear', 'Kits', null, false, 5000, 2, null, null, 'A poisoner''s kit includes the vials, chemicals, and other equipment necessary for the creation of poisons. Proficiency with this kit lets you add your proficiency bonus to any ability checks you make to craft or use poisons.', null),
('2014:ladder-10-foot', '2014', 'Ladder (10-foot)', 'gear', 'Standard Gear', null, false, 10, 25, null, null, '', null),
('2014:lamp', '2014', 'Lamp', 'gear', 'Standard Gear', null, false, 50, 1, null, null, 'A lamp casts bright light in a 15-foot radius and dim light for an additional 30 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil.', null),
('2014:lantern-bullseye', '2014', 'Lantern, bullseye', 'gear', 'Standard Gear', null, false, 1000, 2, null, null, 'A bullseye lantern casts bright light in a 60-foot cone and dim light for an additional 60 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil.', null),
('2014:lantern-hooded', '2014', 'Lantern, hooded', 'gear', 'Standard Gear', null, false, 500, 2, null, null, 'A hooded lantern casts bright light in a 30-foot radius and dim light for an additional 30 feet. Once lit, it burns for 6 hours on a flask (1 pint) of oil. As an action, you can lower the hood, reducing the light to dim light in a 5-foot radius.', null),
('2014:little-bag-of-sand', '2014', 'Little bag of sand', 'gear', 'Standard Gear', null, false, 0, 0, null, null, 'A small bag of sand, typically found in a scholar''s pack.', null),
('2014:lock', '2014', 'Lock', 'gear', 'Standard Gear', null, false, 1000, 1, null, null, 'A key is provided with the lock. Without the key, a creature proficient with thieves'' tools can pick this lock with a successful DC 15 Dexterity check. Your GM may decide that better locks are available for higher prices.', null),
('2014:magnifying-glass', '2014', 'Magnifying glass', 'gear', 'Standard Gear', null, false, 10000, 0, null, null, 'This lens allows a closer look at small objects. It is also useful as a substitute for flint and steel when starting fires. Lighting a fire with a magnifying glass requires light as bright as sunlight to focus, tinder to ignite, and about 5 minutes for the fire to ignite.
A magnifying glass grants advantage on any ability check made to appraise or inspect an item that is small or highly detailed.', null),
('2014:manacles', '2014', 'Manacles', 'gear', 'Standard Gear', null, false, 200, 6, null, null, 'These metal restraints can bind a Small or Medium creature. Escaping the manacles requires a successful DC 20 Dexterity check. Breaking them requires a successful DC 20 Strength check.
Each set of manacles comes with one key. Without the key, a creature proficient with thieves'' tools can pick the manacles'' lock with a successful DC 15 Dexterity check. Manacles have 15 hit points.', null),
('2014:mirror-steel', '2014', 'Mirror, steel', 'gear', 'Standard Gear', null, false, 500, 0.5, null, null, '', null),
('2014:oil-flask', '2014', 'Oil (flask)', 'gear', 'Standard Gear', null, false, 10, 1, null, null, 'Oil usually comes in a clay flask that holds 1 pint.
As an action, you can splash the oil in this flask onto a creature within 5 feet of you or throw it up to 20 feet, shattering it on impact. Make a ranged attack against a target creature or object, treating the oil as an improvised weapon.
On a hit, the target is covered in oil. If the target takes any fire damage before the oil dries (after 1 minute), the target takes an additional 5 fire damage from the burning oil.
You can also pour a flask of oil on the ground to cover a 5-foot-square area, provided that the surface is level.
If lit, the oil burns for 2 rounds and deals 5 fire damage to any creature that enters the area or ends its turn in the area. A creature can take this damage only once per turn.', null),
('2014:paper-one-sheet', '2014', 'Paper (one sheet)', 'gear', 'Standard Gear', null, false, 20, 0, null, null, '', null),
('2014:parchment-one-sheet', '2014', 'Parchment (one sheet)', 'gear', 'Standard Gear', null, false, 10, 0, null, null, '', null),
('2014:perfume-vial', '2014', 'Perfume (vial)', 'gear', 'Standard Gear', null, false, 500, 0, null, null, '', null),
('2014:pick-miners', '2014', 'Pick, miner''s', 'gear', 'Standard Gear', null, false, 200, 10, null, null, '', null),
('2014:piton', '2014', 'Piton', 'gear', 'Standard Gear', null, false, 5, 0.25, null, null, '', null),
('2014:poison-basic-vial', '2014', 'Poison, basic (vial)', 'gear', 'Standard Gear', null, false, 10000, 0, null, null, 'You can use the poison in this vial to coat one slashing or piercing weapon or up to three pieces of ammunition. Applying the poison takes an action. A creature hit by the poisoned weapon or ammunition must make a DC 10 Constitution saving throw or take 1d4 poison damage. Once applied, the poison retains potency for 1 minute before drying.', null),
('2014:pole-10-foot', '2014', 'Pole (10-foot)', 'gear', 'Standard Gear', null, false, 5, 7, null, null, '', null),
('2014:pot-iron', '2014', 'Pot, iron', 'gear', 'Standard Gear', null, false, 200, 10, null, null, '', null),
('2014:pouch', '2014', 'Pouch', 'gear', 'Standard Gear', null, false, 50, 1, null, null, 'A cloth or leather pouch can hold up to 20 sling bullets or 50 blowgun needles, among other things. A compartmentalized pouch for holding spell components is called a component pouch (described earlier in this section).', null),
('2014:quiver', '2014', 'Quiver', 'gear', 'Standard Gear', null, false, 100, 1, null, null, 'A quiver can hold up to 20 arrows.', null),
('2014:ram-portable', '2014', 'Ram, portable', 'gear', 'Standard Gear', null, false, 400, 35, null, null, 'You can use a portable ram to break down doors. When doing so, you gain a +4 bonus on the Strength check. One other character can help you use the ram, giving you advantage on this check.', null),
('2014:rations-1-day', '2014', 'Rations (1 day)', 'gear', 'Standard Gear', null, false, 50, 2, null, null, 'Rations consist of dry foods suitable for extended travel, including jerky, dried fruit, hardtack, and nuts.', null),
('2014:reliquary', '2014', 'Reliquary', 'gear', 'Holy Symbols', null, false, 500, 2, null, null, 'A holy symbol is a representation of a god or pantheon. It might be an amulet depicting a symbol representing a deity, the same symbol carefully engraved or inlaid as an emblem on a shield, or a tiny box holding a fragment of a sacred relic.
Appendix B lists the symbols commonly associated with many gods in the multiverse. A cleric or paladin can use a holy symbol as a spellcasting focus. To use the symbol in this way, the caster must hold it in hand, wear it visibly, or bear it on a shield.', null),
('2014:robes', '2014', 'Robes', 'gear', 'Standard Gear', null, false, 100, 4, null, null, '', null),
('2014:rope-hempen-50-feet', '2014', 'Rope, hempen (50 feet)', 'gear', 'Standard Gear', null, false, 100, 10, null, null, 'Rope, whether made of hemp or silk, has 2 hit points and can be burst with a DC 17 Strength check.', null),
('2014:rope-silk-50-feet', '2014', 'Rope, silk (50 feet)', 'gear', 'Standard Gear', null, false, 1000, 5, null, null, 'Rope, whether made of hemp or silk, has 2 hit points and can be burst with a DC 17 Strength check.', null),
('2014:sack', '2014', 'Sack', 'gear', 'Standard Gear', null, false, 1, 0.5, null, null, '', null),
('2014:scale-merchants', '2014', 'Scale, merchant''s', 'gear', 'Standard Gear', null, false, 500, 3, null, null, 'A scale includes a small balance, pans, and a suitable assortment of weights up to 2 pounds. With it, you can measure the exact weight of small objects, such as raw precious metals or trade goods, to help determine their worth.', null),
('2014:sealing-wax', '2014', 'Sealing wax', 'gear', 'Standard Gear', null, false, 50, 0, null, null, '', null),
('2014:shovel', '2014', 'Shovel', 'gear', 'Standard Gear', null, false, 200, 5, null, null, '', null),
('2014:signal-whistle', '2014', 'Signal whistle', 'gear', 'Standard Gear', null, false, 5, 0, null, null, '', null),
('2014:signet-ring', '2014', 'Signet ring', 'gear', 'Standard Gear', null, false, 500, 0, null, null, '', null),
('2014:small-knife', '2014', 'Small knife', 'gear', 'Standard Gear', null, false, 0, 0, null, null, 'A small knife, typically found in a scholar''s pack.', null),
('2014:soap', '2014', 'Soap', 'gear', 'Standard Gear', null, false, 2, 0, null, null, '', null),
('2014:spellbook', '2014', 'Spellbook', 'gear', 'Standard Gear', null, false, 5000, 3, null, null, 'Essential for wizards, a spellbook is a leather-bound tome with 100 blank vellum pages suitable for recording spells.', null),
('2014:spike-iron', '2014', 'Spike, iron', 'gear', 'Standard Gear', null, false, 10, 5, null, null, '', null),
('2014:spyglass', '2014', 'Spyglass', 'gear', 'Standard Gear', null, false, 100000, 1, null, null, 'Objects viewed through a spyglass are magnified to twice their size.', null),
('2014:string-10-feet', '2014', 'String (10 feet)', 'gear', 'Standard Gear', null, false, 0, 0, null, null, 'A 10-foot length of string, typically found in a burglar''s pack.', null),
('2014:tent-two-person', '2014', 'Tent, two-person', 'gear', 'Standard Gear', null, false, 200, 20, null, null, 'A simple and portable canvas shelter, a tent sleeps two.', null),
('2014:tinderbox', '2014', 'Tinderbox', 'gear', 'Standard Gear', null, false, 50, 1, null, null, 'This small container holds flint, fire steel, and tinder (usually dry cloth soaked in light oil) used to kindle a fire. Using it to light a torch--or anything else with abundant, exposed fuel--takes an action.
Lighting any other fire takes 1 minute.', null),
('2014:torch', '2014', 'Torch', 'gear', 'Standard Gear', null, false, 1, 1, null, null, 'A torch burns for 1 hour, providing bright light in a 20-foot radius and dim light for an additional 20 feet. If you make a melee attack with a burning torch and hit, it deals 1 fire damage.', null),
('2014:vestments', '2014', 'Vestments', 'gear', 'Standard Gear', null, false, 0, 0, null, null, 'Religious clothing, typically found in a priest''s pack.', null),
('2014:vial', '2014', 'Vial', 'gear', 'Standard Gear', null, false, 100, 0, null, null, '', null),
('2014:waterskin', '2014', 'Waterskin', 'gear', 'Standard Gear', null, false, 20, 5, null, null, '', null),
('2014:whetstone', '2014', 'Whetstone', 'gear', 'Standard Gear', null, false, 1, 1, null, null, '', null),
('2014:burglars-pack', '2014', 'Burglar''s Pack', 'gear', 'Equipment Packs', null, false, 1600, null, null, null, '', '{"contents": [{"name": "Backpack", "qty": 1}, {"name": "Ball bearings (bag of 1,000)", "qty": 1}, {"name": "String (10 feet)", "qty": 1}, {"name": "Bell", "qty": 1}, {"name": "Candle", "qty": 5}, {"name": "Crowbar", "qty": 1}, {"name": "Hammer", "qty": 1}, {"name": "Piton", "qty": 10}, {"name": "Lantern, hooded", "qty": 1}, {"name": "Oil (flask)", "qty": 2}, {"name": "Rations (1 day)", "qty": 5}, {"name": "Tinderbox", "qty": 1}, {"name": "Waterskin", "qty": 1}, {"name": "Rope, hempen (50 feet)", "qty": 1}]}'::jsonb),
('2014:diplomats-pack', '2014', 'Diplomat''s Pack', 'gear', 'Equipment Packs', null, false, 3900, null, null, null, '', '{"contents": [{"name": "Chest", "qty": 1}, {"name": "Case, map or scroll", "qty": 2}, {"name": "Clothes, fine", "qty": 1}, {"name": "Ink (1 ounce bottle)", "qty": 1}, {"name": "Ink pen", "qty": 1}, {"name": "Lamp", "qty": 1}, {"name": "Oil (flask)", "qty": 2}, {"name": "Paper (one sheet)", "qty": 5}, {"name": "Perfume (vial)", "qty": 1}, {"name": "Sealing wax", "qty": 1}, {"name": "Soap", "qty": 1}]}'::jsonb),
('2014:dungeoneers-pack', '2014', 'Dungeoneer''s Pack', 'gear', 'Equipment Packs', null, false, 1200, null, null, null, '', '{"contents": [{"name": "Backpack", "qty": 1}, {"name": "Crowbar", "qty": 1}, {"name": "Hammer", "qty": 1}, {"name": "Piton", "qty": 10}, {"name": "Torch", "qty": 10}, {"name": "Tinderbox", "qty": 1}, {"name": "Rations (1 day)", "qty": 10}, {"name": "Waterskin", "qty": 1}, {"name": "Rope, hempen (50 feet)", "qty": 1}]}'::jsonb),
('2014:entertainers-pack', '2014', 'Entertainer''s Pack', 'gear', 'Equipment Packs', null, false, 4000, null, null, null, '', '{"contents": [{"name": "Backpack", "qty": 1}, {"name": "Bedroll", "qty": 1}, {"name": "Clothes, costume", "qty": 2}, {"name": "Candle", "qty": 5}, {"name": "Rations (1 day)", "qty": 5}, {"name": "Waterskin", "qty": 1}, {"name": "Disguise Kit", "qty": 1}]}'::jsonb),
('2014:explorers-pack', '2014', 'Explorer''s Pack', 'gear', 'Equipment Packs', null, false, 1000, null, null, null, '', '{"contents": [{"name": "Backpack", "qty": 1}, {"name": "Bedroll", "qty": 1}, {"name": "Mess Kit", "qty": 1}, {"name": "Tinderbox", "qty": 1}, {"name": "Torch", "qty": 10}, {"name": "Rations (1 day)", "qty": 10}, {"name": "Waterskin", "qty": 1}, {"name": "Rope, hempen (50 feet)", "qty": 1}]}'::jsonb),
('2014:priests-pack', '2014', 'Priest''s Pack', 'gear', 'Equipment Packs', null, false, 1900, null, null, null, '', '{"contents": [{"name": "Backpack", "qty": 1}, {"name": "Blanket", "qty": 1}, {"name": "Candle", "qty": 10}, {"name": "Tinderbox", "qty": 1}, {"name": "Rations (1 day)", "qty": 2}, {"name": "Waterskin", "qty": 1}, {"name": "Alms box", "qty": 1}, {"name": "Block of incense", "qty": 2}, {"name": "Censer", "qty": 1}, {"name": "Vestments", "qty": 1}]}'::jsonb),
('2014:scholars-pack', '2014', 'Scholar''s Pack', 'gear', 'Equipment Packs', null, false, 4000, null, null, null, '', '{"contents": [{"name": "Backpack", "qty": 1}, {"name": "Book", "qty": 1}, {"name": "Ink (1 ounce bottle)", "qty": 1}, {"name": "Ink pen", "qty": 1}, {"name": "Parchment (one sheet)", "qty": 10}, {"name": "Little bag of sand", "qty": 1}, {"name": "Small knife", "qty": 1}]}'::jsonb),
('2014:alchemists-supplies', '2014', 'Alchemist''s Supplies', 'tool', 'Artisan''s Tools', null, false, 5000, 8, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:brewers-supplies', '2014', 'Brewer''s Supplies', 'tool', 'Artisan''s Tools', null, false, 2000, 9, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:calligraphers-supplies', '2014', 'Calligrapher''s Supplies', 'tool', 'Artisan''s Tools', null, false, 1000, 5, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:carpenters-tools', '2014', 'Carpenter''s Tools', 'tool', 'Artisan''s Tools', null, false, 800, 6, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:cartographers-tools', '2014', 'Cartographer''s Tools', 'tool', 'Artisan''s Tools', null, false, 1500, 6, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:cobblers-tools', '2014', 'Cobbler''s Tools', 'tool', 'Artisan''s Tools', null, false, 500, 5, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:cooks-utensils', '2014', 'Cook''s utensils', 'tool', 'Artisan''s Tools', null, false, 100, 8, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:glassblowers-tools', '2014', 'Glassblower''s Tools', 'tool', 'Artisan''s Tools', null, false, 3000, 5, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:jewelers-tools', '2014', 'Jeweler''s Tools', 'tool', 'Artisan''s Tools', null, false, 2500, 2, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:leatherworkers-tools', '2014', 'Leatherworker''s Tools', 'tool', 'Artisan''s Tools', null, false, 500, 5, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:masons-tools', '2014', 'Mason''s Tools', 'tool', 'Artisan''s Tools', null, false, 1000, 8, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:painters-supplies', '2014', 'Painter''s Supplies', 'tool', 'Artisan''s Tools', null, false, 1000, 5, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:potters-tools', '2014', 'Potter''s Tools', 'tool', 'Artisan''s Tools', null, false, 1000, 3, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:smiths-tools', '2014', 'Smith''s Tools', 'tool', 'Artisan''s Tools', null, false, 2000, 8, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:tinkers-tools', '2014', 'Tinker''s Tools', 'tool', 'Artisan''s Tools', null, false, 5000, 10, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:weavers-tools', '2014', 'Weaver''s Tools', 'tool', 'Artisan''s Tools', null, false, 100, 5, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:woodcarvers-tools', '2014', 'Woodcarver''s Tools', 'tool', 'Artisan''s Tools', null, false, 100, 5, null, null, 'These special tools include the items needed to pursue a craft or trade. The table shows examples of the most common types of tools, each providing items related to a single craft. Proficiency with a set of artisan''s tools lets you add your proficiency bonus to any ability checks you make using the tools in your craft. Each type of artisan''s tools requires a separate proficiency.', null),
('2014:dice-set', '2014', 'Dice Set', 'tool', 'Gaming Sets', null, false, 10, 0, null, null, 'This item encompasses a wide range of game pieces, including dice and decks of cards (for games such as Three-Dragon Ante). A few common examples appear on the Tools table, but other kinds of gaming sets exist. If you are proficient with a gaming set, you can add your proficiency bonus to ability checks you make to play a game with that set. Each type of gaming set requires a separate proficiency.', null),
('2014:playing-card-set', '2014', 'Playing Card Set', 'tool', 'Gaming Sets', null, false, 50, 0, null, null, 'This item encompasses a wide range of game pieces, including dice and decks of cards (for games such as Three-Dragon Ante). A few common examples appear on the Tools table, but other kinds of gaming sets exist. If you are proficient with a gaming set, you can add your proficiency bonus to ability checks you make to play a game with that set. Each type of gaming set requires a separate proficiency.', null),
('2014:bagpipes', '2014', 'Bagpipes', 'tool', 'Musical Instrument', null, false, 3000, 6, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:drum', '2014', 'Drum', 'tool', 'Musical Instrument', null, false, 600, 3, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:dulcimer', '2014', 'Dulcimer', 'tool', 'Musical Instrument', null, false, 2500, 10, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:flute', '2014', 'Flute', 'tool', 'Musical Instrument', null, false, 200, 1, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:lute', '2014', 'Lute', 'tool', 'Musical Instrument', null, false, 3500, 2, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:lyre', '2014', 'Lyre', 'tool', 'Musical Instrument', null, false, 3000, 2, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:horn', '2014', 'Horn', 'tool', 'Musical Instrument', null, false, 300, 2, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:pan-flute', '2014', 'Pan flute', 'tool', 'Musical Instrument', null, false, 1200, 2, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:shawm', '2014', 'Shawm', 'tool', 'Musical Instrument', null, false, 200, 1, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:viol', '2014', 'Viol', 'tool', 'Musical Instrument', null, false, 3000, 1, null, null, 'Several of the most common types of musical instruments are shown on the table as examples. If you have proficiency with a given musical instrument, you can add your proficiency bonus to any ability checks you make to play music with the instrument. A bard can use a musical instrument as a spellcasting focus. Each type of musical instrument requires a separate proficiency.', null),
('2014:navigators-tools', '2014', 'Navigator''s Tools', 'tool', 'Other Tools', null, false, 2500, 2, null, null, 'This set of instruments is used for navigation at sea. Proficiency with navigator''s tools lets you chart a ship''s course and follow navigation charts. In addition, these tools allow you to add your proficiency bonus to any ability check you make to avoid getting lost at sea.', null),
('2014:thieves-tools', '2014', 'Thieves'' Tools', 'tool', 'Other Tools', null, false, 2500, 1, null, null, 'This set of tools includes a small file, a set of lock picks, a small mirror mounted on a metal handle, a set of narrow-bladed scissors, and a pair of pliers. Proficiency with these tools lets you add your proficiency bonus to any ability checks you make to disarm traps or open locks.', null),
('2014:camel', '2014', 'Camel', 'mount', 'Mounts and Other Animals', null, false, 5000, null, null, 'Speed 50 ft/round', '', null),
('2014:donkey', '2014', 'Donkey', 'mount', 'Mounts and Other Animals', null, false, 800, null, null, 'Speed 40 ft/round', '', null),
('2014:mule', '2014', 'Mule', 'mount', 'Mounts and Other Animals', null, false, 800, null, null, 'Speed 40 ft/round', '', null),
('2014:elephant', '2014', 'Elephant', 'mount', 'Mounts and Other Animals', null, false, 20000, null, null, 'Speed 40 ft/round', '', null),
('2014:horse-draft', '2014', 'Horse, draft', 'mount', 'Mounts and Other Animals', null, false, 5000, null, null, 'Speed 40 ft/round', '', null),
('2014:horse-riding', '2014', 'Horse, riding', 'mount', 'Mounts and Other Animals', null, false, 7500, null, null, 'Speed 60 ft/round', '', null),
('2014:mastiff', '2014', 'Mastiff', 'mount', 'Mounts and Other Animals', null, false, 2500, null, null, 'Speed 40 ft/round', '', null),
('2014:pony', '2014', 'Pony', 'mount', 'Mounts and Other Animals', null, false, 3000, null, null, 'Speed 40 ft/round', '', null),
('2014:warhorse', '2014', 'Warhorse', 'mount', 'Mounts and Other Animals', null, false, 40000, null, null, 'Speed 60 ft/round', '', null),
('2014:barding-padded', '2014', 'Barding: Padded', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 2000, 16, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-leather', '2014', 'Barding: Leather', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 4000, 20, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-studded-leather', '2014', 'Barding: Studded Leather', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 18000, 26, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-hide', '2014', 'Barding: Hide', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 4000, 24, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-chain-shirt', '2014', 'Barding: Chain shirt', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 20000, 40, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-scale-mail', '2014', 'Barding: Scale mail', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 20000, 90, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-breastplate', '2014', 'Barding: Breastplate', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 160000, 40, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-half-plate', '2014', 'Barding: Half plate', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 300000, 80, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-ring-mail', '2014', 'Barding: Ring mail', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 1200, 80, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-chain-mail', '2014', 'Barding: Chain mail', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 30000, 110, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-splint', '2014', 'Barding: Splint', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 80000, 120, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:barding-plate', '2014', 'Barding: Plate', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 600000, 130, null, null, 'Barding is armor designed to protect an animal''s head, neck, chest, and body. Any type of armor shown on the Armor table can be purchased as barding. The cost is four times the equivalent armor made for humanoids, and it weighs twice as much.', null),
('2014:bit-and-bridle', '2014', 'Bit and bridle', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 200, 1, null, null, '', null),
('2014:carriage', '2014', 'Carriage', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 10000, 600, null, null, '', null),
('2014:cart', '2014', 'Cart', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 1500, 200, null, null, '', null),
('2014:chariot', '2014', 'Chariot', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 25000, 100, null, null, '', null),
('2014:animal-feed-1-day', '2014', 'Animal Feed (1 day)', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 5, 10, null, null, '', null),
('2014:saddle-exotic', '2014', 'Saddle, Exotic', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 6000, 50, null, null, 'An exotic saddle is required for riding any aquatic or flying mount.', null),
('2014:saddle-military', '2014', 'Saddle, Military', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 2000, 30, null, null, 'A military saddle braces the rider, helping you keep your seat on an active mount in battle. It gives you advantage on any check you make to remain mounted.', null),
('2014:saddle-pack', '2014', 'Saddle, Pack', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 500, 15, null, null, '', null),
('2014:saddle-riding', '2014', 'Saddle, Riding', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 1000, 25, null, null, '', null),
('2014:saddlebags', '2014', 'Saddlebags', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 400, 8, null, null, '', null),
('2014:sled', '2014', 'Sled', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 2000, 300, null, null, '', null),
('2014:stabling-1-day', '2014', 'Stabling (1 day)', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 50, 0, null, null, '', null),
('2014:wagon', '2014', 'Wagon', 'mount', 'Tack, Harness, and Drawn Vehicles', null, false, 3500, 400, null, null, '', null),
('2014:galley', '2014', 'Galley', 'mount', 'Waterborne Vehicles', null, false, 3000000, null, null, 'Speed 4 mph', '', null),
('2014:keelboat', '2014', 'Keelboat', 'mount', 'Waterborne Vehicles', null, false, 300000, null, null, 'Speed 1 mph', 'Keelboats and rowboats are used on lakes and rivers. If going downstream, add the speed of the current (typically 3 miles per hour) to the speed of the vehicle. These vehicles can''t be rowed against any significant current, but they can be pulled upstream by draft animals on the shores. A rowboat weighs 100 pounds, in case adventurers carry it over land.', null),
('2014:longship', '2014', 'Longship', 'mount', 'Waterborne Vehicles', null, false, 1000000, null, null, 'Speed 3 mph', '', null),
('2014:rowboat', '2014', 'Rowboat', 'mount', 'Waterborne Vehicles', null, false, 5000, null, null, 'Speed 1.5 mph', 'Keelboats and rowboats are used on lakes and rivers. If going downstream, add the speed of the current (typically 3 miles per hour) to the speed of the vehicle. These vehicles can''t be rowed against any significant current, but they can be pulled upstream by draft animals on the shores. A rowboat weighs 100 pounds, in case adventurers carry it over land.', null),
('2014:sailing-ship', '2014', 'Sailing ship', 'mount', 'Waterborne Vehicles', null, false, 1000000, null, null, 'Speed 2 mph', '', null),
('2014:warship', '2014', 'Warship', 'mount', 'Waterborne Vehicles', null, false, 2500000, null, null, 'Speed 2.5 mph', '', null),
('2014:adamantine-armor', '2014', 'Adamantine Armor', 'magic', 'Armor', 'Uncommon', false, null, null, null, 'Armor (medium or heavy, but not hide), uncommon', 'This suit of armor is reinforced with adamantine, one of the hardest substances in existence. While you''re wearing it, any critical hit against you becomes a normal hit.', null),
('2014:ammunition', '2014', 'Ammunition, +1, +2, or +3', 'magic', 'Ammunition', 'Varies', false, null, null, null, 'Weapon (any ammunition), uncommon (+1), rare (+2), or very rare (+3)', 'You have a bonus to attack and damage rolls made with this piece of magic ammunition. The bonus is determined by the rarity of the ammunition. Once it hits a target, the ammunition is no longer magical.', '{"variants": ["Ammunition, +1", "Ammunition, +2", "Ammunition, +3"]}'::jsonb),
('2014:ammunition-1', '2014', 'Ammunition, +1', 'magic', 'Ammunition', 'Uncommon', false, null, null, null, 'Weapon (any ammunition), uncommon', 'You have a +1 bonus to attack and damage rolls made with this piece of magic ammunition. Once it hits a target, the ammunition is no longer magical.', null),
('2014:ammunition-2', '2014', 'Ammunition, +2', 'magic', 'Ammunition', 'Rare', false, null, null, null, 'Weapon (any ammunition), rare', 'You have a +2 bonus to attack and damage rolls made with this piece of magic ammunition. Once it hits a target, the ammunition is no longer magical.', null),
('2014:ammunition-3', '2014', 'Ammunition, +3', 'magic', 'Ammunition', 'Very Rare', false, null, null, null, 'Weapon (any ammunition), very rare', 'You have a +3 bonus to attack and damage rolls made with this piece of magic ammunition. Once it hits a target, the ammunition is no longer magical.', null),
('2014:amulet-of-health', '2014', 'Amulet of Health', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondrous item, rare (requires attunement)', 'Your Constitution score is 19 while you wear this amulet. It has no effect on you if your Constitution is already 19 or higher', null),
('2014:amulet-of-proof-against-detection-and-location', '2014', 'Amulet of Proof against Detection and Location', 'magic', 'Wondrous Items', 'Uncommon', true, null, null, null, 'Wondrous item, uncommon (requires attunement)', 'While wearing this amulet, you are hidden from divination magic. You can''t be targeted by such magic or perceived through magical scrying sensors.', null),
('2014:amulet-of-the-planes', '2014', 'Amulet of the Planes', 'magic', 'Wondrous Items', 'Very Rare', true, null, null, null, 'Wondrous item, very rare (requires attunement)', 'While wearing this amulet, you can use an action to name a location that you are familiar with on another plane of existence. Then make a DC 15 Intelligence check. On a successful check, you cast the plane shift spell. On a failure, you and each creature and object within 15 feet of you travel to a random destination. Roll a d100. On a 1-60, you travel to a random location on the plane you named. On a 61-100, you travel to a randomly determined plane of existence.', null),
('2014:animated-shield', '2014', 'Animated Shield', 'magic', 'Armor', 'Very Rare', true, null, null, null, 'Armor (shield), very rare (requires attunement)', 'While holding this shield, you can speak its command word as a bonus action to cause it to animate. The shield leaps into the air and hovers in your space to protect you as if you were wielding it, leaving your hands free. The shield remains animated for 1 minute, until you use a bonus action to end this effect, or until you are incapacitated or die, at which point the shield falls to the ground or into your hand if you have one free.', null),
('2014:apparatus-of-the-crab', '2014', 'Apparatus of the Crab', 'magic', 'Wondrous Items', 'Legendary', false, null, null, null, 'Wondrous item, legendary', 'This item first appears to be a Large sealed iron barrel weighing 500 pounds. The barrel has a hidden catch, which can be found with a successful DC 20 Intelligence (Investigation) check. Releasing the catch unlocks a hatch at one end of the barrel, allowing two Medium or smaller creatures to crawl inside. Ten levers are set in a row at the far end, each in a neutral position, able to move either up or down. When certain levers are used, the apparatus transforms to resemble a giant lobster.
The apparatus of the Crab is a Large object with the following statistics:
Armor Class: 20
Hit Points: 200
Speed: 30 ft., swim 30 ft. (or 0 ft. for both if the legs and tail aren''t extended)
Damage Immunities: poison, psychic
To be used as a vehicle, the apparatus requires one pilot. While the apparatus''s hatch is closed, the compartment is airtight and watertight. The compartment holds enough air for 10 hours of breathing, divided by the number of breathing creatures inside.
The apparatus floats on water. It can also go underwater to a depth of 900 feet. Below that, the vehicle takes 2d6 bludgeoning damage per minute from pressure.
A creature in the compartment can use an action to move as many as two of the apparatus''s levers up or down. After each use, a lever goes back to its neutral position. Each lever, from left to right, functions as shown in the Apparatus of the Crab Levers table.
Apparatus of the Crab Levers
| Lever | Up | Down |
|---|---|---|
| 1 | Legs and tail extend, allowing the apparatus to walk and swim. | Legs and tail retract, reducing the apparatus''s speed to 0 and making it unable to benefit from bonuses to speed. |
| 2 | Forward window shutter opens. | Forward window shutter closes. |
| 3 | Side window shutters open (two per side). | Side window shutters close (two per side). |
| 4 | Two claws extend from the front sides of the apparatus. | The claws retract. |
| 5 | Each extended claw makes the following melee weapon attack: +8 to hit, reach 5 ft., one target. Hit: 7 (2d6) bludgeoning damage. | Each extended claw makes the following melee weapon attack: +8 to hit, reach 5 ft., one target. Hit: The target is grappled (escape DC 15). |
| 6 | The apparatus walks or swims forward. | The apparatus walks or swims backward. |
| 7 | The apparatus turns 90 degrees left. | The apparatus turns 90 degrees right. |
| 8 | Eyelike fixtures emit bright light in a 30-foot radius and dim light for an additional 30 feet. | The light turns off. |
| 9 | The apparatus sinks as much as 20 feet in liquid. | The apparatus rises up to 20 feet in liquid. |
| 10 | The rear hatch unseals and opens. |  The rear hatch closes and seals. |', null),
('2014:armor', '2014', 'Armor, +1, +2, or +3', 'magic', 'Armor', 'Varies', false, null, null, null, 'Armor (light, medium, or heavy), rare (+1), very rare (+2), or legendary (+3)', 'You have a bonus to AC while wearing this armor. The bonus is determined by its rarity.', '{"variants": ["Armor, +1", "Armor, +2", "Armor, +3"]}'::jsonb),
('2014:armor-1', '2014', 'Armor, +1', 'magic', 'Armor', 'Rare', false, null, null, null, 'Armor (light, medium, or heavy), rare', 'You have a +1 bonus to AC while wearing this armor.', null),
('2014:armor-2', '2014', 'Armor, +2', 'magic', 'Armor', 'Very Rare', false, null, null, null, 'Armor (light, medium, or heavy), very rare', 'You have a +2 bonus to AC while wearing this armor.', null),
('2014:armor-3', '2014', 'Armor, +3', 'magic', 'Armor', 'Legendary', false, null, null, null, 'Armor (light, medium, or heavy), legendary', 'You have a +3 bonus to AC while wearing this armor.', null),
('2014:armor-of-invulnerability', '2014', 'Armor of Invulnerability', 'magic', 'Armor', 'Legendary', true, null, null, null, 'Armor (plate), legendary (requires attunement)', 'You have resistance to nonmagical damage while you wear this armor. Additionally, you can use an action to make yourself immune to nonmagical damage for 10 minutes or until you are no longer wearing the armor. Once this special action is used, it can''t be used again until the next dawn.', null),
('2014:armor-of-resistance', '2014', 'Armor of Resistance', 'magic', 'Armor', 'Rare', true, null, null, null, 'Armor (light, medium, or heavy), rare (requires attunement)', 'You have resistance to one type of damage while you wear this armor. The GM chooses the type or determines it randomly from the options below.
| d10 | Damage Type |
|---|---|
| 1 | Acid |
| 2 | Cold |
| 3 | Fire |
| 4 | Force |
| 5 | Lightning |
| 6 | Necrotic |
| 7 | Poison |
| 8 | Psychic |
| 9 | Radiant |
| 10 | Thunder |', null),
('2014:armor-of-vulnerability', '2014', 'Armor of Vulnerability', 'magic', 'Armor', 'Rare', true, null, null, null, 'Armor (plate), rare (requires attunement)', 'While wearing this armor, you have resistance to  one of the following damage types: bludgeoning, piercing, or slashing. The GM chooses the type or determines it randomly.
***Curse.*** This armor is cursed, a fact that is revealed only when an identify spell is cast on the armor or you attune to it. Attuning to the armor curses you until you are targeted by the remove curse spell or similar magic; removing the armor fails to end the curse. While cursed, you have vulnerability to two of the three damage types associated with the armor (not the one to which it grants resistance).', null),
('2014:arrow-catching-shield', '2014', 'Arrow-Catching Shield', 'magic', 'Armor', 'Rare', true, null, null, null, 'Armor (shield), rare (requires attunement)', 'You gain a +2 bonus to AC against ranged attacks while you wield this shield. This bonus is in addition to the shield''s normal bonus to AC. In addition, whenever an attacker makes a ranged attack against a target within 5 feet of you, you can use your reaction to become the target of the attack instead.', null),
('2014:arrow-of-slaying', '2014', 'Arrow of Slaying', 'magic', 'Ammunition', 'Very Rare', false, null, null, null, 'Weapon (arrow), very rare', 'An arrow of slaying is a magic weapon meant to slay a particular kind of creature. Some are more focused than others; for example, there are both arrows of dragon slaying and arrows of blue dragon slaying. If a creature belonging to the type, race, or group associated with an arrow of slaying takes damage from the arrow, the creature must make a DC 17 Constitution saving throw, taking an extra 6d10 piercing damage on a failed save, or half as much extra damage on a successful one.
Once an arrow of slaying deals its extra damage to a creature, it becomes a nonmagical arrow.
Other types of magic ammunition of this kind exist, such as bolts of slaying meant for a crossbow, though arrows are most common.', null),
('2014:bag-of-beans', '2014', 'Bag of Beans', 'magic', 'Wondrous Items', 'Rare', false, null, null, null, 'Wondrous item, rare', 'Inside this heavy cloth bag are 3d4 dry beans. The bag weighs 1/2 pound plus 1/4 pound for each bean it contains.
If you dump the bag''s contents out on the ground,  they explode in a 10-foot radius, extending from the beans. Each creature in the area, including you, must  make a DC 15 Dexterity saving throw, taking 5d4 fire  damage on a failed save, or half as much damage on  a successful one. The fire ignites flammable objects  in the area that aren''t being worn or carried.
If you remove a bean from the bag, plant it in dirt  or sand, and then water it, the bean produces an  effect 1 minute later from the ground where it was  planted. The GM can choose an effect from the  following table, determine it randomly, or create an  effect.
| d100 | Effect |
|---|---|
| 01 | 5d4 toadstools sprout. If a creature eats a toadstool, roll any die. On an odd roll, the eater must succeed on a DC 15 Constitution saving throw or take 5d6 poison damage and become poisoned for 1 hour. On an even roll, the eater gains 5d6 temporary hit points for 1 hour. |
| 02-10 | A geyser erupts and spouts water, beer, berry juice, tea, vinegar, wine, or oil (GM''s choice) 30 feet into the air for 1d12 rounds. |
| 11-20 | A treant sprouts. There''s a 50 percent chance that the treant is chaotic evil and attacks. |
| 21-30 | An animate, immobile stone statue in your likeness rises. It makes verbal threats against you. If you leave it and others come near, it describes you as the most heinous of villains and directs the newcomers to find and attack you. If you are on the same plane of existence as the statue, it knows where you are. The statue becomes inanimate after 24 hours. |
| 31-40 | A campfire with blue flames springs forth and burns for 24 hours (or until it is extinguished). |
| 41-50 | 1d6 + 6 shriekers sprout |
| 51-60 | 1d4 + 8 bright pink toads crawl forth. Whenever a toad is touched, it transforms into a Large or smaller monster of the GM''s choice. The monster remains for 1 minute, then disappears in a puff of bright pink smoke. |
| 61-70 | A hungry bulette burrows up and attacks. |
| 71-80 | A fruit tree grows. It has 1d10 + 20 fruit, 1d8 of which act as randomly determined magic potions, while one acts as an ingested poison of the GM''s choice. The tree vanishes after 1 hour. Picked fruit remains, retaining any magic for 30 days. |
| 81-90 | A nest of 1d4 + 3 eggs springs up. Any creature that eats an egg must make a DC 20 Constitution saving throw. On a successful save, a creature permanently increases its lowest ability score by 1, randomly choosing among equally low scores. On a failed save, the creature takes 10d6 force damage from an internal magical explosion. |
| 91-99 | A pyramid with a 60-foot-square base bursts upward. Inside is a sarcophagus containing a mummy lord. The pyramid is treated as the mummy lord''s lair, and its sarcophagus contains treasure of the GM''s choice. |
| 100 | A giant beanstalk sprouts, growing to a height of the GM''s choice. The top leads where the GM chooses, such as to a great view, a cloud giant''s castle, or a different plane of existence. |', null),
('2014:bag-of-devouring', '2014', 'Bag of Devouring', 'magic', 'Wondrous Items', 'Very Rare', false, null, null, null, 'Wondrous item, very rare', 'This bag superficially resembles a bag of holding but is a feeding orifice for a gigantic extradimensional creature. Turning the bag inside out closes the orifice.
The extradimensional creature attached to the bag can sense whatever is placed inside the bag. Animal or vegetable matter placed wholly in the bag is devoured and lost forever. When part of a living creature is placed in the bag, as happens when someone reaches inside it, there is a 50 percent chance that the creature is pulled inside the bag. A creature inside the bag can use its action to try to escape with a successful DC 15 Strength check. Another creature can use its action to reach into the bag to pull a creature out, doing so with a successful DC 20 Strength check (provided it isn''t pulled inside the bag first). Any creature that starts its turn inside the bag is devoured, its body destroyed.
Inanimate objects can be stored in the bag, which can hold a cubic foot of such material. However, once each day, the bag swallows any objects inside it and spits them out into another plane of existence. The GM determines the time and plane.
If the bag is pierced or torn, it is destroyed, and anything contained within it is transported to a random location on the Astral Plane.', null),
('2014:bag-of-holding', '2014', 'Bag of Holding', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'This bag has an interior space considerably larger than its outside dimensions, roughly 2 feet in diameter at the mouth and 4 feet deep. The bag can hold up to 500 pounds, not exceeding a volume of 64 cubic feet. The bag weighs 15 pounds, regardless of its contents. Retrieving an item from the bag requires an action.
If the bag is overloaded, pierced, or torn, it ruptures and is destroyed, and its contents are scattered in the Astral Plane. If the bag is turned inside out, its contents spill forth, unharmed, but the bag must be put right before it can be used again. Breathing creatures inside the bag can survive up to a number of minutes equal to 10 divided by the number of creatures (minimum 1 minute), after which time they begin to suffocate.
Placing a bag of holding inside an extradimensional space created by a Handy Haversack, Portable Hole, or similar item instantly destroys both items and opens a gate to the Astral Plane. The gate originates where the one item was placed inside the other. Any creature within 10 feet of the gate is sucked through it to a random location on the Astral Plane. The gate then closes. The gate is one-way only and can''t be reopened.', null),
('2014:bag-of-tricks', '2014', 'Bag of Tricks', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'This ordinary bag, made from gray, rust, or tan cloth, appears empty. Reaching inside the bag, however, reveals the presence of a small, fuzzy object. The bag weighs 1/2 pound.
You can use an action to pull the fuzzy object from the bag and throw it up to 20 feet. When the object lands, it transforms into a creature you determine by rolling a d8 and consulting the table that corresponds to the bag''s color. The creature vanishes at the next dawn or when it is reduced to 0 hit points.
The creature is friendly to you and your companions, and it acts on Your Turn. You can use a Bonus Action to Command how the creature moves and what action it takes on its next turn, or to give it general orders, such as to Attack your enemies. In the absence of such orders, the creature acts in a fashion appropriate to its Nature.
Once three fuzzy Objects have been pulled from the bag, the bag can''t be used again until the next dawn.
Gray Bag:
| d8 | Creature |
|---|---|
| 01 | Weasel |
| 02 | Giant Rat |
| 03 | Badger |
| 04 | Boar |
| 05 | Panther |
| 06 | Giant Badger |
| 07 | Dire Wolf |
| 08 | Giant Elk |
Rust Bag:
| d8 | Creature |
|---|---|
| 01 | Rat |
| 02 | Owl |
| 03 | Mastiff |
| 04 | Goat |
| 05 | Giant Goat |
| 06 | Giant Boar |
| 07 | Lion |
| 08 | Brown Bear |
Tan Bag:
| d8 | Creature |
|---|---|
| 01 | Jackal |
| 02 | Ape |
| 03 | Baboon |
| 04 | Axe Beak |
| 05 | Black Bear |
| 06 | Giant Weasel |
| 07 | Giant Hyena |
| 08 | Tiger |', '{"variants": ["Gray Bag of Tricks", "Rust Bag of Tricks", "Tan Bag of Tricks"]}'::jsonb),
('2014:bag-of-tricks-gray', '2014', 'Gray Bag of Tricks', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'This ordinary bag, made from gray cloth, appears empty. Reaching inside the bag, however, reveals the presence of a small, fuzzy object. The bag weighs 1/2 pound.
You can use an action to pull the fuzzy object from the bag and throw it up to 20 feet. When the object lands, it transforms into a creature you determine by rolling a d8 and consulting the table that corresponds to the bag''s color. The creature vanishes at the next dawn or when it is reduced to 0 Hit Points.
The creature is friendly to you and your companions, and it acts on Your Turn. You can use a Bonus Action to Command how the creature moves and what action it takes on its next turn, or to give it general orders, such as to Attack your enemies. In the absence of such orders, the creature acts in a fashion appropriate to its Nature.
Once three fuzzy Objects have been pulled from the bag, the bag can''t be used again until the next dawn.
Gray Bag:
| d8 | Creature |
|---|---|
| 01 | Weasel |
| 02 | Giant Rat |
| 03 | Badger |
| 04 | Boar |
| 05 | Panther |
| 06 | Giant Badger |
| 07 | Dire Wolf |
| 08 | Giant Elk |', null),
('2014:bag-of-tricks-rust', '2014', 'Rust Bag of Tricks', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'This ordinary bag, made from rust cloth, appears empty. Reaching inside the bag, however, reveals the presence of a small, fuzzy object. The bag weighs 1/2 pound.
You can use an action to pull the fuzzy object from the bag and throw it up to 20 feet. When the object lands, it transforms into a creature you determine by rolling a d8 and consulting the table that corresponds to the bag''s color. The creature vanishes at the next dawn or when it is reduced to 0 Hit Points.
The creature is friendly to you and your companions, and it acts on Your Turn. You can use a Bonus Action to Command how the creature moves and what action it takes on its next turn, or to give it general orders, such as to Attack your enemies. In the absence of such orders, the creature acts in a fashion appropriate to its Nature.
Once three fuzzy Objects have been pulled from the bag, the bag can''t be used again until the next dawn.
Rust Bag:
| d8 | Creature |
|---|---|
| 01 | Rat |
| 02 | Owl |
| 03 | Mastiff |
| 04 | Goat |
| 05 | Giant Goat |
| 06 | Giant Boar |
| 07 | Lion |
| 08 | Brown Bear |', null),
('2014:bag-of-tricks-tan', '2014', 'Tan Bag of Tricks', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'This ordinary bag, made from tan cloth, appears empty. Reaching inside the bag, however, reveals the presence of a small, fuzzy object. The bag weighs 1/2 pound.
You can use an action to pull the fuzzy object from the bag and throw it up to 20 feet. When the object lands, it transforms into a creature you determine by rolling a d8 and consulting the table that corresponds to the bag''s color. The creature vanishes at the next dawn or when it is reduced to 0 Hit Points.
The creature is friendly to you and your companions, and it acts on Your Turn. You can use a Bonus Action to Command how the creature moves and what action it takes on its next turn, or to give it general orders, such as to Attack your enemies. In the absence of such orders, the creature acts in a fashion appropriate to its Nature.
Once three fuzzy Objects have been pulled from the bag, the bag can''t be used again until the next dawn.
Tan Bag:
| d8 | Creature |
|---|---|
| 01 | Jackal |
| 02 | Ape |
| 03 | Baboon |
| 04 | Axe Beak |
| 05 | Black Bear |
| 06 | Giant Weasel |
| 07 | Giant Hyena |
| 08 | Tiger |', null),
('2014:bead-of-force', '2014', 'Bead of Force', 'magic', 'Wondrous Items', 'Rare', false, null, null, null, 'Wondrous item, rare', 'This small black Sphere measures 3/4 of an inch in diameter and weighs an ounce. Typically, 1d4 + 4 beads of force are found together.
You can use an action to throw the bead up to 60 feet. The bead explodes on impact and is destroyed. Each creature within a 10-foot radius of where the bead landed must succeed on a DC 15 Dexterity saving throw or take 5d4 force damage. A Sphere of transparent force then encloses the area for 1 minute. Any creature that failed the save and is completely within the area is trapped inside this Sphere. Creatures that succeeded on the save, or are partially within the area, are pushed away from the center of the Sphere until they are no longer inside it. Only breathable air can pass through the sphere''s wall. No Attack or other Effect can.
An enclosed creature can use its action to push against the sphere''s wall, moving the Sphere up to half the creature''s walking speed. The Sphere can be picked up, and its magic causes it to weigh only 1 pound, regardless of the weight of creatures inside.', null),
('2014:belt-of-dwarvenkind', '2014', 'Belt of Dwarvenkind', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondrous Items, rare (requires attunement)', 'While wearing this belt, you gain the following benefits:
Your Constitution score increases by 2, to a maximum of 20.
You have advantage on Charisma (Persuasion) checks made to interact with Dwarves.
In addition, while attuned to the belt, you have a 50 percent chance each day at dawn of growing a full beard if you''re capable of growing one, or a visibly thicker beard if you already have one.
If you aren''t a dwarf, you gain the following additional benefits while wearing the belt:
You have advantage on Saving Throws against poison, and you have Resistance against poison damage.
You can speak, read, and write Dwarvish.', null),
('2014:belt-of-giant-strength', '2014', 'Belt of Giant Strength', 'magic', 'Wondrous Items', 'Varies', true, null, null, null, 'Wondrous item, rarity varies (requires attunement)', 'While wearing this belt, your Strength score changes to a score granted by the belt. If your Strength is already equal to or greater than the belt''s score, the item has no Effect on you.
Six varieties of this belt exist, corresponding with and having rarity according to The Six kinds of true Giants. The belt of Stone Giant Strength and the belt of Frost Giant Strength look different, but they have the same Effect.
| Type | Strength | Rarity |
|---|---|---|
| Hill Giant | 21 | Rare |
| Stone Giant / Frost Giant | 23 | Very Rare |
| Fire Giant | 25 | Very Rare |
| Cloud Giant | 27 | Legendary |
| Storm Giant | 29 | Legendary |', '{"variants": ["Belt of Hill Giant Strength", "Belt of Stone Giant Strength", "Belt of Frost Giant Strength", "Belt of Fire Giant Strength", "Belt of Cloud Giant Strength", "Belt of Storm Giant Strength"]}'::jsonb),
('2014:belt-of-giant-strength-hill', '2014', 'Belt of Hill Giant Strength', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondrous item, rare (requires attunement)', 'While wearing this belt, your Strength score changes to a 21. If your Strength is already equal to or greater than the belt''s score, the item has no Effect on you.', null),
('2014:belt-of-giant-strength-stone', '2014', 'Belt of Stone Giant Strength', 'magic', 'Wondrous Items', 'Very Rare', true, null, null, null, 'Wondrous item, very rare (requires attunement)', 'While wearing this belt, your Strength score changes to a 23. If your Strength is already equal to or greater than the belt''s score, the item has no Effect on you.', null),
('2014:belt-of-giant-strength-frost', '2014', 'Belt of Frost Giant Strength', 'magic', 'Wondrous Items', 'Very Rare', true, null, null, null, 'Wondrous item, very rare (requires attunement)', 'While wearing this belt, your Strength score changes to 23. If your Strength is already equal to or greater than the belt''s score, the item has no Effect on you.', null),
('2014:belt-of-giant-strength-fire', '2014', 'Belt of Fire Giant Strength', 'magic', 'Wondrous Items', 'Very Rare', true, null, null, null, 'Wondrous item, very rare (requires attunement)', 'While wearing this belt, your Strength score changes to 25. If your Strength is already equal to or greater than the belt''s score, the item has no Effect on you.', null),
('2014:belt-of-giant-strength-cloud', '2014', 'Belt of Cloud Giant Strength', 'magic', 'Wondrous Items', 'Legendary', true, null, null, null, 'Wondrous item, legendary (requires attunement)', 'While wearing this belt, your Strength score changes to 27. If your Strength is already equal to or greater than the belt''s score, the item has no Effect on you.', null),
('2014:belt-of-giant-strength-storm', '2014', 'Belt of Storm Giant Strength', 'magic', 'Wondrous Items', 'Legendary', true, null, null, null, 'Wondrous item, legendary (requires attunement)', 'While wearing this belt, your Strength score changes to 29. If your Strength is already equal to or greater than the belt''s score, the item has no Effect on you.', null),
('2014:berserker-axe', '2014', 'Berserker Axe', 'magic', 'Weapon', 'Rare', true, null, null, null, 'Weapon (any axe), rare (requires attunement)', 'You gain a +1 bonus to Attack and Damage Rolls made with this Magic Weapon. In addition, while you are attuned to this weapon, your Hit Points maximum increases by 1 for each level you have attained.
***Curse.*** This axe is Cursed, and becoming attuned to it extends the curse to you. As long as you remain Cursed, you are unwilling to part with the axe, keeping it within reach at all times. You also have disadvantage on Attack rolls with Weapons other than this one, unless no foe is within 60 feet of you that you can see or hear.
Whenever a Hostile creature damages you while the axe is in your possession, you must succeed on a DC 15 Wisdom saving throw or go berserk. While berserk, you must use your action each round to Attack the creature nearest to you with the axe. If you can make extra attacks as part of the Attack action, you use those extra attacks, moving to Attack the next nearest creature after you fell your current target. If you have multiple possible Targets, you Attack one at random. You are berserk until you start Your Turn with no creatures within 60 feet of you that you can see or hear.', null),
('2014:boots-of-elvenkind', '2014', 'Boots of Elvenkind', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'While you wear these boots, your steps make no sound, regardless of the surface you are moving across. You also have advantage on Dexterity (Stealth) checks that rely on moving silently.', null),
('2014:boots-of-levitation', '2014', 'Boots of Levitation', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondrous item, rare (requires attunement)', 'While you wear these boots, you can use an action to cast the levitate spell on yourself at will.', null),
('2014:boots-of-speed', '2014', 'Boots of Speed', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondrous item, rare (requires attunement)', 'While you wear these boots, you can use a bonus action and click the boots'' heels together. If you do, the boots double your walking speed, and any creature that makes an opportunity attack against you has disadvantage on the attack roll. If you click your heels together again, you end the effect.
When the boots'' property has been used for a total of 10 minutes, the magic ceases to function until you finish a long rest.', null),
('2014:boots-of-striding-and-springing', '2014', 'Boots of Striding and Springing', 'magic', 'Wondrous Items', 'Uncommon', true, null, null, null, 'Wondrous item, uncommon (requires attunement)', 'While you wear these boots, your walking speed becomes 30 feet, unless your walking speed is higher, and your speed isn''t reduced if you are encumbered or wearing heavy armor. In addition, you can jump three times the normal distance, though you can''t jump farther than your remaining movement would allow.', null),
('2014:boots-of-the-winterlands', '2014', 'Boots of the Winterlands', 'magic', 'Wondrous Items', 'Uncommon', true, null, null, null, 'Wondrous item, uncommon (requires attunement)', 'These furred boots are snug and feel quite warm. While you wear them, you gain the following benefits:
* You have resistance to cold damage.
* You ignore difficult terrain created by ice or snow.
* You can tolerate temperatures as low as -50 degrees Fahrenheit without any additional protection. If you wear heavy clothes, you can tolerate temperatures as low as -100 degrees Fahrenheit.', null),
('2014:bowl-of-commanding-water-elementals', '2014', 'Bowl of Commanding Water Elementals', 'magic', 'Wondrous Items', 'Rare', false, null, null, null, 'Wondrous item, rare', 'While this bowl is filled with water, you can use an action to speak the bowl''s command word and summon a water elemental, as if you had cast the conjure elemental spell. The bowl can''t be used this way again until the next dawn.
The bowl is about 1 foot in diameter and half as deep. It weighs 3 pounds and holds about 3 gallons.', null),
('2014:bracers-of-archery', '2014', 'Bracers of Archery', 'magic', 'Wondrous Items', 'Uncommon', true, null, null, null, 'Wondrous item, uncommon (requires attunement)', 'While wearing these bracers, you have proficiency with the longbow and shortbow, and you gain a +2 bonus to damage rolls on ranged attacks made with such weapons.', null),
('2014:bracers-of-defense', '2014', 'Bracers of Defense', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondous item, rare (requires attunement)', 'While wearing these bracers, you gain a +2 bonus to AC if you are wearing no armor and using no shield.', null),
('2014:brazier-of-commanding-fire-elementals', '2014', 'Brazier of Commanding Fire Elementals', 'magic', 'Wondrous Items', 'Rare', false, null, null, null, 'Wondrous item, rare', 'While a fire burns in this brass brazier, you can use an action to speak the brazier''s command word and summon a fire elemental, as if you had cast the conjure elemental spell. The brazier can''t be used this way again until the next dawn.
The brazier weighs 5 pounds.', null),
('2014:brooch-of-shielding', '2014', 'Brooch of Shielding', 'magic', 'Wondrous Items', 'Uncommon', true, null, null, null, 'Wondrous item, uncommon (requires attunement)', 'While wearing this brooch, you have resistance to force damage, and you have immunity to damage from the magic missile spell.', null),
('2014:broom-of-flying', '2014', 'Broom of Flying', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'This wooden broom, which weighs 3 pounds, functions like a mundane broom until you stand astride it and speak its command word. It then hovers beneath you and can be ridden in the air. It has a flying speed of 50 feet. It can carry up to 400 pounds, but its flying speed becomes 30 feet while carrying over 200 pounds. The broom stops hovering when you land.
You can send the broom to travel alone to a destination within 1 mile of you if you speak the command word, name the location, and are familiar with that place. The broom comes back to you when you speak another command word, provided that the broom is still within 1 mile of you.', null),
('2014:candle-of-invocation', '2014', 'Candle of Invocation', 'magic', 'Wondrous Items', 'Very Rare', true, null, null, null, 'Wondrous item, very rare (requires attunement)', 'This slender taper is dedicated to a deity and shares that deity''s alignment. The candle''s alignment can be detected with the detect evil and good spell. The GM chooses the god and associated alignment or determines the alignment randomly.
| d20 | Alignment |
|---|---|
| 1-2 | Chaotic evil |
| 3-4 | Chaotic neutral |
| 5-7 | Chaotic good |
| 8-9 | Neutral evil |
| 10-11 | Neutral |
| 12-13 | Neutral good |
| 14-15 | Lawful evil |
| 16-17 | Lawful neutral |
| 18-20 | Lawful good |
The candle''s magic is activated when the candle is lit, which requires an action. After burning for 4 hours, the candle is destroyed. You can snuff it out early for use at a later time. Deduct the time it burned in increments of 1 minute from the candle''s total burn time.
While lit, the candle sheds dim light in a 30-foot radius. Any creature within that light whose alignment matches that of the candle makes attack rolls, saving throws, and ability checks with advantage. In addition, a cleric or druid in the light whose alignment matches the candle''s can cast 1stlevel spells he or she has prepared without expending spell slots, though the spell''s effect is as if cast with a 1st-level slot.
Alternatively, when you light the candle for the first time, you can cast the gate spell with it. Doing so destroys the candle.', null),
('2014:cape-of-the-mountebank', '2014', 'Cape of the Mountebank', 'magic', 'Wondrous Items', 'Rare', false, null, null, null, 'Wondrous item, rare', 'This cape smells faintly of brimstone. While wearing it, you can use it to cast the dimension door spell as an action. This property of the cape can''t be used again until the next dawn.
When you disappear, you leave behind a cloud of smoke, and you appear in a similar cloud of smoke at your destination. The smoke lightly obscures the space you left and the space you appear in, and it dissipates at the end of your next turn. A light or stronger wind disperses the smoke.', null),
('2014:carpet-of-flying', '2014', 'Carpet of Flying', 'magic', 'Wondrous Items', 'Very Rare', false, null, null, null, 'Wondrous item, very rare', 'You can speak the carpet''s command word as an  action to make the carpet hover and fly. It moves according to your spoken directions, provided that you are within 30 feet of it.
Four sizes of carpet of flying exist. The GM chooses the size of a given carpet or determines it randomly.
| d100 | Size | Capacity | Flying Speed |
|---|---|---|---|
| 01-20 | 3 ft. × 5 ft. | 200 lb. | 80 feet |
| 21-55 | 4 ft. × 6 ft. | 400 lb. | 60 feet |
| 56-80 | 5 ft. × 7 ft. | 600 lb. | 40 feet |
| 81-100 | 6 ft. × 9 ft. | 800 lb. | 30 feet |
A carpet can carry up to twice the weight shown on the table, but it flies at half speed if it carries more than its normal capacity.', '{"variants": ["Carpet of Flying (3 ft. × 5 ft.)", "Carpet of Flying (4 ft. × 6 ft.)", "Carpet of Flying (5 ft. × 7 ft.)", "Carpet of Flying (6 ft. × 9 ft.)"]}'::jsonb),
('2014:carpet-of-flying-3x5', '2014', 'Carpet of Flying (3 ft. × 5 ft.)', 'magic', 'Wondrous Items', 'Very Rare', false, null, null, null, 'Wondrous item, very rare', 'You can speak the carpet''s command word as an  action to make the carpet hover and fly. It moves according to your spoken directions, provided that you are within 30 feet of it.
This carpet is 3 feet by 5 feet and has a flying speed of 80 feet. It can carry up to 400 pounds, but its flying speed becomes 40 feet while carrying over 200 pounds.', null),
('2014:carpet-of-flying-4x6', '2014', 'Carpet of Flying (4 ft. × 6 ft.)', 'magic', 'Wondrous Items', 'Very Rare', false, null, null, null, 'Wondrous item, very rare', 'You can speak the carpet''s command word as an  action to make the carpet hover and fly. It moves according to your spoken directions, provided that you are within 30 feet of it.
This carpet is 4 feet by 6 feet and has a flying speed of 60 feet. It can carry up to 800 pounds, but its flying speed becomes 30 feet while carrying over 400 pounds.', null),
('2014:carpet-of-flying-5x7', '2014', 'Carpet of Flying (5 ft. × 7 ft.)', 'magic', 'Wondrous Items', 'Very Rare', false, null, null, null, 'Wondrous item, very rare', 'You can speak the carpet''s command word as an  action to make the carpet hover and fly. It moves according to your spoken directions, provided that you are within 30 feet of it.
This carpet is 5 feet by 7 feet and has a flying speed of 40 feet. It can carry up to 1200 pounds, but its flying speed becomes 20 feet while carrying over 600 pounds.', null),
('2014:carpet-of-flying-6x9', '2014', 'Carpet of Flying (6 ft. × 9 ft.)', 'magic', 'Wondrous Items', 'Very Rare', false, null, null, null, 'Wondrous item, very rare', 'You can speak the carpet''s command word as an  action to make the carpet hover and fly. It moves according to your spoken directions, provided that you are within 30 feet of it.
This carpet is 6 feet by 9 feet and has a flying speed of 30 feet. It can carry up to 1600 pounds, but its flying speed becomes 15 feet while carrying over 800 pounds.', null),
('2014:censer-of-controlling-air-elementals', '2014', 'Censer of Controlling Air Elementals', 'magic', 'Wondrous Items', 'Rare', false, null, null, null, 'Wondrous item, rare', 'While incense is burning in this censer, you can use an action to speak the censer''s command word and summon an air elemental, as if you had cast the conjure elemental spell. The censer can''t be used this way again until the next dawn.
This 6-inch-wide, 1-foot-high vessel resembles a chalice with a decorated lid. It weighs 1 pound.', null),
('2014:chime-of-opening', '2014', 'Chime of Opening', 'magic', 'Wondrous Items', 'Rare', false, null, null, null, 'Wondrous item, rare', 'This hollow metal tube measures about 1 foot long and weighs 1 pound. You can strike it as an action, pointing it at an object within 120 feet of you that can be opened, such as a door, lid, or lock. The chime issues a clear tone, and one lock or latch on the object opens unless the sound can''t reach the object. If no locks or latches remain, the object itself opens.
The chime can be used ten times. After the tenth time, it cracks and becomes useless.', null),
('2014:circlet-of-blasting', '2014', 'Circlet of Blasting', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'While wearing this circlet, you can use an action to cast the scorching ray spell with it. When you make the spell''s attacks, you do so with an attack bonus of +5. The circlet can''t be used this way again until the next dawn.', null),
('2014:cloak-of-arachnida', '2014', 'Cloak of Arachnida', 'magic', 'Wondrous Items', 'Very Rare', true, null, null, null, 'Wondrous item, very rare (requires attunement)', 'This fine garment is made of black silk interwoven with faint silvery threads. While wearing it, you gain the following benefits:
* You have resistance to poison damage.
* You have a climbing speed equal to your walking speed.
* You can move up, down, and across vertical surfaces and upside down along ceilings, while leaving your hands free.
* You can''t be caught in webs of any sort and can move through webs as if they were difficult terrain.
* You can use an action to cast the web spell (save DC 13). The web created by the spell fills twice its normal area. Once used, this property of the cloak can''t be used again until the next dawn.', null),
('2014:cloak-of-displacement', '2014', 'Cloak of Displacement', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondrous item, rare (requires attunement)', 'While you wear this cloak, it projects an illusion that makes you appear to be standing in a place near your actual location, causing any creature to have disadvantage on attack rolls against you. If you take damage, the property ceases to function until the start of your next turn. This property is suppressed while you are incapacitated, restrained, or otherwise unable to move.', null),
('2014:cloak-of-elvenkind', '2014', 'Cloak of Elvenkind', 'magic', 'Wondrous Items', 'Uncommon', true, null, null, null, 'Wondrous item, uncommon (requires attunement)', 'While you wear this cloak with its hood up, Wisdom (Perception) checks made to see you have disadvantage, and you have advantage on Dexterity (Stealth) checks made to hide, as the cloak''s color shifts to camouflage you. Pulling the hood up or down requires an action.', null),
('2014:cloak-of-protection', '2014', 'Cloak of Protection', 'magic', 'Wondrous Items', 'Uncommon', true, null, null, null, 'Wondrous item, uncommon (requires attunement)', 'You gain a +1 bonus to AC and saving throws while you wear this cloak.', null),
('2014:cloak-of-the-bat', '2014', 'Cloak of the Bat', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondrous item, rare (requires attunement)', 'While wearing this cloak, you have advantage on Dexterity (Stealth) checks. In an area of dim light or darkness, you can grip the edges of the cloak with both hands and use it to fly at a speed of 40 feet. If you ever fail to grip the cloak''s edges while flying in this way, or if you are no longer in dim light or darkness, you lose this flying speed.
While wearing the cloak in an area of dim light or darkness, you can use your action to cast polymorph on yourself, transforming into a bat. While you are in the form of the bat, you retain your Intelligence, Wisdom, and Charisma scores. The cloak can''t be used this way again until the next dawn.', null),
('2014:cloak-of-the-manta-ray', '2014', 'Cloak of the Manta Ray', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'While wearing this cloak with its hood up, you can breathe underwater, and you have a swimming speed of 60 feet. Pulling the hood up or down requires an action.', null),
('2014:crystal-ball', '2014', 'Crystal Ball', 'magic', 'Wondrous Items', 'Very Rare', true, null, null, null, 'Wondrous item, very rare or legendary (requires attunement)', 'The typical crystal ball, a very rare item, is about 6 inches in diameter. While touching it, you can cast the scrying spell (save DC 17) with it.
The following crystal ball variants are legendary items and have additional properties.
***Crystal Ball of Mind Reading.*** You can use an action to cast the detect thoughts spell (save DC 17) while you are scrying with the crystal ball, targeting creatures you can see within 30 feet of the spell''s sensor. You don''t need to concentrate on this detect thoughts to maintain it during its duration, but it ends if scrying ends.
***Crystal Ball of Telepathy.*** While scrying with the crystal ball, you can communicate telepathically with creatures you can see within 30 feet of the spell''s sensor. You can also use an action to cast the suggestion spell (save DC 17) through the sensor on one of those creatures. You don''t need to concentrate on this suggestion to maintain it during its duration, but it ends if scrying ends. Once used, the suggestion power of the crystal ball can''t be used again until the next dawn.
***Crystal Ball of True Seeing.*** While scrying with the crystal ball, you have truesight with a radius of 120 feet centered on the spell''s sensor.', '{"variants": ["Crystal Ball of Mind Reading", "Crystal Ball of Telepathy", "Crystal Ball of True Seeing"]}'::jsonb),
('2014:crystal-ball-of-mind-reading', '2014', 'Crystal Ball of Mind Reading', 'magic', 'Wondrous Items', 'Legendary', true, null, null, null, 'Wondrous item, legendary (requires attunement)', 'The crystal ball is about 6 inches in diameter. While touching it, you can cast the scrying spell (save DC 17) with it.
***Crystal Ball of Mind Reading.*** You can use an action to cast the detect thoughts spell (save DC 17) while you are scrying with the crystal ball, targeting creatures you can see within 30 feet of the spell''s sensor. You don''t need to concentrate on this detect thoughts to maintain it during its duration, but it ends if scrying ends.', null),
('2014:crystal-ball-of-telepathy', '2014', 'Crystal Ball of Telepathy', 'magic', 'Wondrous Items', 'Legendary', true, null, null, null, 'Wondrous item, legendary (requires attunement)', 'The crystal ball is about 6 inches in diameter. While touching it, you can cast the scrying spell (save DC 17) with it.
***Crystal Ball of Telepathy.*** While scrying with the crystal ball, you can communicate telepathically with creatures you can see within 30 feet of the spell''s sensor. You can also use an action to cast the suggestion spell (save DC 17) through the sensor on one of those creatures. You don''t need to concentrate on this suggestion to maintain it during its duration, but it ends if scrying ends. Once used, the suggestion power of the crystal ball can''t be used again until the next dawn.', null),
('2014:crystal-ball-of-true-seeing', '2014', 'Crystal Ball of True Seeing', 'magic', 'Wondrous Items', 'Legendary', true, null, null, null, 'Wondrous item, legendary (requires attunement)', 'The crystal ball is about 6 inches in diameter. While touching it, you can cast the scrying spell (save DC 17) with it.
***Crystal Ball of True Seeing.*** While scrying with the crystal ball, you have truesight with a radius of 120 feet centered on the spell''s sensor.', null),
('2014:cube-of-force', '2014', 'Cube of Force', 'magic', 'Wondrous Items', 'Rare', true, null, null, null, 'Wondrous item, rare (requires attunement)', 'This cube is about an inch across. Each face has a distinct marking on it that can be pressed. The cube starts with 36 charges, and it regains 1d20 expended charges daily at dawn.
You can use an action to press one of the cube''s faces, expending a number of charges based on the chosen face, as shown in the Cube of Force Faces table. Each face has a different effect. If the cube has insufficient charges remaining, nothing happens. Otherwise, a barrier of invisible force springs into existence, forming a cube 15 feet on a side. The barrier is centered on you, moves with you, and lasts for 1 minute, until you use an action to press the cube''s sixth face, or the cube runs out of charges. You can change the barrier''s effect by pressing a different face of the cube and expending the requisite number of charges, resetting the duration.
If your movement causes the barrier to come into contact with a solid object that can''t pass through the cube, you can''t move any closer to that object as long as the barrier remains.
Cube of Force Faces
| Face | Charges | Effect |
|---|---|---|
| 1 | 1 | Gases, wind, and fog can''t pass through the barrier.
| 2 | 2 | Nonliving matter can''t pass through the barrier. Walls, floors, and ceilings can pass through at your discretion.
| 3 | 3 | Living matter can''t pass through the barrier.
| 4 | 4 | Spell effects can''t pass through the barrier.
| 5 | 5 | Nothing can pass through the barrier. Walls, floors, and ceilings can pass through at your discretion.
| 6 | 0 | The barrier deactivates.
The cube loses charges when the barrier is targeted by certain spells or comes into contact with certain spell or magic item effects, as shown in the table below.
| Spell or Item | Charges Lost |
|---|---|
| Disintegrate | 1d12 |
| Horn of blasting | 1d10 |
| Passwall | 1d6 |
| Prismatic spray | 1d20 |
| Wall of fire | 1d4 |', null),
('2014:cubic-gate', '2014', 'Cubic Gate', 'magic', 'Wondrous Items', 'Legendary', false, null, null, null, 'Wondrous item, legendary', 'This cube is 3 inches across and radiates palpable magical energy. The six sides of the cube are each keyed to a different plane of existence, one of which is the Material Plane. The other sides are linked to planes determined by the GM.
You can use an action to press one side of the cube to cast the gate spell with it, opening a portal to the plane keyed to that side. Alternatively, if you use an action to press one side twice, you can cast the plane shift spell (save DC 17) with the cube and transport the targets to the plane keyed to that side.
The cube has 3 charges. Each use of the cube expends 1 charge. The cube regains 1d3 expended charges daily at dawn.', null),
('2014:dagger-of-venom', '2014', 'Dagger of Venom', 'magic', 'Weapon', 'Rare', false, null, null, null, 'Weapon (dagger), rare', 'You gain a +1 bonus to attack and damage rolls made with this magic weapon.
You can use an action to cause thick, black poison to coat the blade. The poison remains for 1 minute or until an attack using this weapon hits a creature. That creature must succeed on a DC 15 Constitution saving throw or take 2d10 poison damage and become poisoned for 1 minute. The dagger can''t be used this way again until the next dawn.', null),
('2014:dancing-sword', '2014', 'Dancing Sword', 'magic', 'Weapon', 'Very Rare', true, null, null, null, 'Weapon (any sword), very rare (requires attunement)', 'You can use a bonus action to toss this magic sword into the air and speak the command word. When you do so, the sword begins to hover, flies up to 30 feet, and attacks one creature of your choice within 5 feet of it. The sword uses your attack roll and ability score modifier to damage rolls.
While the sword hovers, you can use a bonus action to cause it to fly up to 30 feet to another spot within 30 feet of you. As part of the same bonus action, you can cause the sword to attack one creature within 5 feet of it.
After the hovering sword attacks for the fourth time, it flies up to 30 feet and tries to return to your hand. If you have no hand free, it falls to the ground at your feet. If the sword has no unobstructed path to you, it moves as close to you as it can and then falls to the ground. It also ceases to hover if you grasp it or move more than 30 feet away from it.', null),
('2014:decanter-of-endless-water', '2014', 'Decanter of Endless Water', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'This stoppered flask sloshes when shaken, as if it contains water. The decanter weighs 2 pounds.
You can use an action to remove the stopper and speak one of three command words, whereupon an amount of fresh water or salt water (your choice) pours out of the flask. The water stops pouring out at the start of your next turn. Choose from the following options:
"Stream" produces 1 gallon of water.
"Fountain" produces 5 gallons of water.
"Geyser" produces 30 gallons of water that gushes forth in a geyser 30 feet long and 1 foot wide. As a bonus action while holding the decanter, you can aim the geyser at a creature you can see within 30 feet of you. The target must succeed on a DC 13 Strength saving throw or take 1d4 bludgeoning damage and fall prone. Instead of a creature, you can target an object that isn''t being worn or carried and that weighs no more than 200 pounds. The object is either knocked over or pushed up to 15 feet away from you.', null),
('2014:deck-of-illusions', '2014', 'Deck of Illusions', 'magic', 'Wondrous Items', 'Uncommon', false, null, null, null, 'Wondrous item, uncommon', 'This box contains a set of parchment cards. A full deck has 34 cards. A deck found as treasure is usually missing 1d20 - 1 cards.
The magic of the deck functions only if cards are drawn at random (you can use an altered deck of playing cards to simulate the deck). You can use an action to draw a card at random from the deck and throw it to the ground at a point within 30 feet of you.
An illusion of one or more creatures forms over the thrown card and remains until dispelled. An illusory creature appears real, of the appropriate size, and behaves as if it were a real creature except that it can do no harm. While you are within 120 feet of the illusory creature and can see it, you can use an action to move it magically anywhere within 30 feet of its card. Any physical interaction with the illusory creature reveals it to be an illusion, because objects pass through it. Someone who uses an action to visually inspect the creature identifies it as illusory with a successful DC 15 Intelligence (Investigation) check. The creature then appears translucent.
The illusion lasts until its card is moved or the illusion is dispelled. When the illusion ends, the image on its card disappears, and that card can''t be used again.
| Playing Card | Illusion |
|---|---|
| Ace of hearts | Red dragon |
| King of hearts | Knight and four guards |
| Queen of hearts | Succubus or incubus |
| Jack of hearts | Druid |
| Ten of hearts | Cloud giant |
| Nine of hearts | Ettin |
| Eight of hearts | Bugbear |
| Two of hearts | Goblin |
| Ace of diamonds | Beholder |
| King of diamonds | Archmage and mage apprentice |
| Queen of diamonds | Night hag |
| Jack of diamonds | Assassin |
| Ten of diamonds | Fire giant |
| Nine of diamonds | Ogre mage |
| Eight of diamonds | Gnoll |
| Two of diamonds | Kobold |
| Ace of spades | Lich |
| King of spades | Priest and two acolytes |
| Queen of spades | Medusa |
| Jack of spades | Veteran |
| Ten of spades | Frost giant |
| Nine of spades | Troll |
| Eight of spades | Hobgoblin |
| Two of spades | Goblin |
| Ace of clubs | Iron golem |
| King of clubs | Bandit captain and three bandits |
| Queen of clubs | Erinyes |
| Jack of clubs | Berserker |
| Ten of clubs | Hill giant |
| Nine of clubs | Ogre |
| Eight of clubs | Orc |
| Two of clubs | Kobold |
| Jokers (2) | You (the deck''s owner) |', null)
on conflict (id) do update set
  rules = excluded.rules, name = excluded.name, kind = excluded.kind, category = excluded.category, rarity = excluded.rarity,
  attunement = excluded.attunement, cost_cp = excluded.cost_cp, weight = excluded.weight, bundle = excluded.bundle,
  summary = excluded.summary, description = excluded.description, data = excluded.data;

-- Link gear that was typed in by hand (old sheets) to the library, by exact name
update public.character_items ci set srd_id = s.id
from public.characters c, public.srd_items s
where ci.character_id = c.id and ci.srd_id is null and ci.item_id is null
  and c.rule_set = '2014' and s.rules = '2014' and lower(s.name) = lower(ci.name);

select '2014 items, part 1 of 3: done' as result;
