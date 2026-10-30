// A small homebrew book that fills every tab: the filled example file and the tests use it.
// All of it is made up for this app (no text from published books).
import type { SheetRow, Workbook } from "../../lib/books/check";

let n = 3;
const rows = (list: Record<string, string>[]): SheetRow[] => { n = 3; return list.map((cells) => ({ row: n++, cells })); };

export const EXAMPLE: Workbook = {
  book: { book: "Tiny Hut Homebrew", code: "THH", rules: "2024" },
  tabs: {
    Spells: rows([
      {
        name: "Ember Lance", level: "2", school: "Evocation", classes: "Sorcerer, Wizard", casting_time: "Action", ritual: "No", range: "60 feet",
        components: "V, S, M (a burnt match)", duration: "Instantaneous",
        description: "A lance of fire streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 3d8 Fire damage.",
        higher_levels: "The damage increases by 1d8 for each spell slot level above 2.", per_level: "1d8",
      },
      {
        name: "Tidal Crash", level: "3", school: "Conjuration", classes: "Druid, Wizard", casting_time: "Action", range: "90 feet", components: "V, S",
        duration: "Instantaneous",
        description: "A wave crashes down in a 20-foot-radius Sphere. Each creature there makes a Strength saving throw, taking 6d6 Bludgeoning damage on a failed save or half as much damage on a successful one.",
      },
      {
        name: "Mending Light", level: "1", school: "Abjuration", classes: "Cleric, Paladin", casting_time: "Bonus Action", range: "30 feet", components: "V",
        duration: "Instantaneous", description: "A creature you can see regains Hit Points equal to 1d8 plus your spellcasting ability modifier.",
        roll: "heal", dice: "1d8", add_mod: "Yes", per_level: "1d8",
      },
      {
        name: "Gull's Warning", level: "0", school: "Divination", classes: "Druid, Ranger", casting_time: "Action", range: "Self", components: "V, S",
        duration: "Concentration, up to 1 minute", description: "A spectral gull circles you. The next attack roll against you has Disadvantage.",
      },
    ]),
    Items: rows([
      {
        name: "Stormglass Dagger", rules: "both", kind: "magic", category: "Weapons", rarity: "Uncommon", attunement: "Yes",
        summary: "Weapon (Dagger)", description: "You have a +1 bonus to attack and damage rolls made with this magic dagger. On a hit it deals an extra 1d4 Lightning damage.",
        damage: "1d4", damage_type: "Piercing", properties: "Finesse, Light, Thrown", range: "20/60", mastery: "Nick",
      },
      { name: "Harbor Hook", kind: "weapon", category: "Martial Melee Weapon", cost: "8 gp", weight: "3", description: "A long dock hook, good for pulling crates and people.", damage: "1d8", damage_type: "Piercing", properties: "Versatile", versatile: "1d10", mastery: "Topple" },
      { name: "Sharkskin Vest", kind: "armor", category: "Light Armor", cost: "30 gp", weight: "6", description: "Rough hide that sheds water.", ac: "12", dex: "Yes" },
      { name: "Tide Chart", kind: "gear", category: "Adventuring Gear", cost: "5 sp", weight: "0.5", description: "Shows the tides of one coast for a year." },
    ]),
    Monsters: rows([
      {
        name: "Bog Lurker", size_type: "Medium Monstrosity, Neutral Evil", ac: "13", hp: "45", hit_dice: "7d8 + 14", speed: "30 ft., Swim 30 ft.",
        str: "16", dex: "14", con: "14", int: "5", wis: "12", cha: "6", saves: "DEX +4", skills: "Stealth +6", senses: "Darkvision 60 ft.; Passive Perception 11",
        languages: "—", cr: "2", traits: "Hold Breath. The lurker can hold its breath for 1 hour.",
        actions: "Multiattack. The lurker makes one Bite attack and one Claw attack.\nBite. Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Piercing damage.\nClaw. Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Slashing damage, plus 3 (1d6) Poison damage.",
      },
      {
        name: "Reef Drake", size_type: "Large Dragon, Unaligned", ac: "16", hp: "110", hit_dice: "13d10 + 39", speed: "30 ft., Fly 60 ft., Swim 40 ft.",
        str: "19", dex: "12", con: "17", int: "6", wis: "13", cha: "10", cr: "6", senses: "Blindsight 30 ft., Darkvision 60 ft.",
        actions: "Multiattack. The drake makes two Rend attacks.\nRend. Melee Weapon Attack: +7 to hit, reach 10 ft., one target. Hit: 13 (2d8 + 4) slashing damage.\nBrine Breath (Recharge 5–6). The drake exhales salt water in a 30-foot line that is 5 feet wide. Each creature in that line must make a DC 14 Constitution saving throw, taking 31 (7d8) cold damage on a failed save, or half as much damage on a successful one.",
      },
      {
        name: "Gloom Sprite", size_type: "Tiny Fey, Chaotic Neutral", ac: "14", hp: "9", speed: "10 ft., Fly 40 ft.", str: "3", dex: "18", con: "10", int: "12", wis: "10", cha: "14", cr: "1/4",
        actions: "Shadow Dart. The sprite flings a sliver of shadow at a creature it can see within 60 feet; the target loses its next Reaction.",
      },
    ]),
    "Monster Attacks": rows([
      { monster: "Gloom Sprite", action: "Shadow Dart", type: "attack", bonus: "6", damage: "1d4+4", damage_type: "Necrotic", ranged: "Yes" },
    ]),
    Subclasses: rows([
      { class: "Fighter", subclass: "Tide Warden", flavor: "Fight with the push and pull of the sea.", text: "Tide Wardens guard harbors and drowned places." },
      { class: "Cleric", subclass: "Lantern Domain", rules: "2014", flavor: "Keep a light burning for the lost." },
    ]),
    "Subclass Features": rows([
      { class: "Fighter", subclass: "Tide Warden", level: "3", feature: "Undertow", text: "When you hit a creature with a melee attack, you can pull it up to 10 feet toward you. You can do this a number of times equal to your Constitution modifier per Long Rest." },
      { class: "Fighter", subclass: "Tide Warden", level: "7", feature: "Sea Legs", text: "You have a Swim Speed equal to your Speed, and you can't be knocked Prone while standing in water." },
      { class: "Cleric", subclass: "Lantern Domain", rules: "2014", level: "1", feature: "Guiding Glow", text: "You learn the Light cantrip. While it is on an object you carry, allies within 10 feet of you add 1 to saving throws." },
    ]),
    "Subclass Choices": rows([
      { class: "Fighter", subclass: "Tide Warden", level: "3", title: "Tide Techniques", choose: "2", options: "Riptide: Push the target 10 feet away.\nUndertow Grip: The target's Speed drops by 10 feet until your next turn.\nSpray: The target has Disadvantage on its next attack roll." },
    ]),
    Feats: rows([
      { name: "Tidecaller", category: "General", prerequisite: "Level 4+", text: "You gain a Swim Speed equal to your Speed, and you can cast Tidal Crash once per Long Rest without a spell slot." },
      { name: "Harbor Born", category: "Origin", text: "You have Advantage on checks to swim or to keep your balance on a moving ship." },
    ]),
    Species: rows([
      { name: "Mirefolk", size: "Medium", speed: "30", languages: "Common, Primordial", skills_given: "Survival", cantrips_given: "Gull's Warning", hp_per_level: "" },
    ]),
    Subspecies: rows([
      { species: "Mirefolk", subspecies: "Reedborn", speed: "35" },
      { species: "Mirefolk", subspecies: "Deepborn", skills_given: "Athletics" },
      { species: "Elf", subspecies: "Sea Elf", cantrips_given: "Shape Water" },
    ]),
    "Species Traits": rows([
      { species: "Mirefolk", trait: "Amphibious", text: "You can breathe air and water." },
      { species: "Mirefolk", trait: "Mudsense", text: "You know where creatures are within 15 feet of you while you both touch mud or water." },
      { species: "Mirefolk", subspecies: "Reedborn", trait: "Reed Stride", text: "Difficult terrain made by plants or shallow water doesn't slow you." },
      { species: "Mirefolk", subspecies: "Deepborn", trait: "Pressure Hide", text: "You have Resistance to Cold damage." },
      { species: "Elf", subspecies: "Sea Elf", trait: "Child of the Sea", text: "You have a Swim Speed equal to your Speed." },
    ]),
    Backgrounds: rows([
      { name: "Dockhand", skills: "Athletics, Survival", tools: "Navigator's Tools", abilities: "STR, CON, WIS", feat: "Harbor Born", equipment_a: "Navigator's Tools, Rope, Traveler's Clothes, 2 Daggers, 12 GP", equipment_b: "50 GP" },
    ]),
  },
};
