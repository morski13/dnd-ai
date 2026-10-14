// Short notes on where the 2014 rules differ from the 2024 SRD text the assistant searches.
// Written for this app in our own words (not book text); used for 2014 and mixed campaigns.
import type { KDoc } from "./search";

const N: [string, string][] = [
  ["Bonus Action spells (2014)", "2014 rules: if you cast a spell as a bonus action, the only other spell you can cast on that turn is a cantrip with a casting time of 1 action. (2024 instead says: only one spell slot per turn.)"],
  ["Two-weapon fighting (2014)", "2014 rules: when you take the Attack action and attack with a light melee weapon in one hand, you can use a bonus action to attack with a different light melee weapon in the other hand. You don't add your ability modifier to that bonus attack's damage unless it's negative (the Two-Weapon Fighting style lets you add it). There is no weapon mastery in 2014, so no Nick."],
  ["Grappling (2014)", "2014 rules: a grapple replaces one attack of the Attack action. It's a Strength (Athletics) check contested by the target's Strength (Athletics) or Dexterity (Acrobatics); the target must be no more than one size larger. Shoving works the same way (knock prone or push 5 feet). (2024 uses an Unarmed Strike with a saving throw instead.)"],
  ["Surprise (2014)", "2014 rules: a creature that is surprised can't move or take an action on its first turn of combat and can't take a reaction until that turn ends. (2024: surprised creatures roll initiative with disadvantage.)"],
  ["Exhaustion (2014)", "2014 rules: exhaustion has 6 levels with fixed effects: 1 disadvantage on ability checks; 2 speed halved; 3 disadvantage on attack rolls and saving throws; 4 hit point maximum halved; 5 speed 0; 6 death. A long rest with food and drink removes one level. (2024: each level is −2 to d20 tests and −5 ft speed.)"],
  ["Weapon mastery (2014)", "2014 rules have no weapon mastery properties (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex). They are a 2024 feature."],
  ["Hide and invisible (2014)", "2014 rules: hiding is a Dexterity (Stealth) check against the passive Wisdom (Perception) of creatures that could notice you; you can't hide from a creature that can see you clearly. Attacking reveals your position. Being unseen gives advantage on attacks against creatures that can't see you."],
  ["Help action (2014)", "2014 rules: with the Help action you give an ally advantage on their next ability check for the task, or on their next attack roll against a creature within 5 feet of you, if it happens before the start of your next turn."],
  ["Short and long rest (2014)", "2014 rules: a short rest is at least 1 hour; you can spend hit dice to heal (roll + CON modifier each). A long rest is at least 8 hours; you regain all hit points and up to half your total hit dice (minimum 1). Only one long rest per 24 hours."],
  ["Inspiration (2014)", "2014 rules: the DM awards Inspiration; you can spend it to gain advantage on one attack roll, saving throw or ability check. (2024 calls it Heroic Inspiration and it lets you reroll a die.)"],
  ["Critical hits and death saves (2014)", "Critical hits and death saving throws work the same way in 2014 and 2024: a crit rolls the damage dice twice; death saves are DC 10, natural 1 counts as two failures, natural 20 brings you back with 1 hit point."],
];

export const NOTES_2014: KDoc[] = N.map(([title, text], i) => ({ id: `n2014-${i + 1}`, kind: "note", title, text }));
