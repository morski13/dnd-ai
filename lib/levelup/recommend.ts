// "Pick for me" (pure, tested): sensible choices for a level, so a level 10 character takes a minute.
// Only open choices are filled; whatever the player already picked stays. The lists are our own picks of
// popular, simple options; anything not on a list comes after, in the rules' order.
import { CLASS_ORDER } from "../builder/special";
import type { Ability } from "../rules";
import { activeChoices, featAbilities, type LevelChar } from "./engine";
import type { Answers, AsiAnswer, Choice, Opt, Plan, RulesData } from "./types";

const SPELLS = [
  // 9th → 1st
  "Wish", "Meteor Swarm", "Mass Heal", "Foresight", "Power Word Kill", "Time Stop", "True Resurrection", "Gate",
  "Maze", "Sunburst", "Dominate Monster", "Holy Aura", "Feeblemind", "Power Word Stun",
  "Forcecage", "Plane Shift", "Teleport", "Regenerate", "Resurrection", "Fire Storm", "Finger of Death", "Prismatic Spray",
  "Disintegrate", "Heal", "Chain Lightning", "Globe of Invulnerability", "Heroes' Feast", "Mass Suggestion", "True Seeing", "Sunbeam", "Blade Barrier",
  "Wall of Force", "Animate Objects", "Cone of Cold", "Mass Cure Wounds", "Greater Restoration", "Raise Dead", "Hold Monster", "Telekinesis", "Flame Strike", "Scrying",
  "Polymorph", "Banishment", "Greater Invisibility", "Dimension Door", "Wall of Fire", "Guardian of Faith", "Death Ward", "Freedom of Movement", "Ice Storm",
  "Fireball", "Counterspell", "Spirit Guardians", "Haste", "Revivify", "Hypnotic Pattern", "Lightning Bolt", "Fly", "Dispel Magic", "Mass Healing Word", "Call Lightning", "Conjure Animals", "Hunger of Hadar",
  "Misty Step", "Hold Person", "Spiritual Weapon", "Scorching Ray", "Invisibility", "Web", "Aid", "Shatter", "Moonbeam", "Pass without Trace", "Lesser Restoration", "Mirror Image", "Suggestion",
  "Shield", "Magic Missile", "Healing Word", "Cure Wounds", "Bless", "Guiding Bolt", "Sleep", "Faerie Fire", "Hunter's Mark", "Hex", "Mage Armor", "Detect Magic", "Find Familiar",
  "Thunderwave", "Burning Hands", "Command", "Sanctuary", "Entangle", "Goodberry", "Shield of Faith", "Divine Favor", "Armor of Agathys", "Silvery Barbs",
];
const CANTRIPS = ["Eldritch Blast", "Fire Bolt", "Toll the Dead", "Sacred Flame", "Guidance", "Mage Hand", "Minor Illusion", "Vicious Mockery", "Shillelagh",
  "Produce Flame", "Ray of Frost", "Shocking Grasp", "Prestidigitation", "Light", "Mind Sliver", "Thaumaturgy", "Druidcraft", "Message", "Spare the Dying", "Starry Wisp"];
const PICKS = [
  // invocations, metamagic, and other named picks
  "Agonizing Blast", "Devil's Sight", "Repelling Blast", "Pact of the Tome", "Pact of the Blade", "Eldritch Mind", "Armor of Shadows", "Mask of Many Faces", "Thirsting Blade", "Lifedrinker", "Misty Visions",
  "Quickened Spell", "Twinned Spell", "Careful Spell", "Heightened Spell", "Subtle Spell", "Empowered Spell", "Extended Spell",
];
const SKILLS = ["Perception", "Stealth", "Athletics", "Insight", "Persuasion", "Deception", "Acrobatics", "Investigation", "Arcana", "Survival", "Intimidation", "Medicine"];
const FEATS = ["Tough", "Alert", "Lucky", "War Caster", "Sentinel", "Great Weapon Master", "Sharpshooter", "Polearm Master", "Mobile", "Resilient", "Boon of Combat Prowess", "Boon of Fate", "Boon of Spell Recall"];
const STR_WEAPONS = ["Greatsword", "Longsword", "Greataxe", "Glaive", "Javelin", "Handaxe", "Maul", "Warhammer", "Battleaxe", "Halberd", "Longbow"];
const DEX_WEAPONS = ["Rapier", "Shortbow", "Longbow", "Shortsword", "Scimitar", "Dagger", "Hand Crossbow", "Light Crossbow", "Whip"];

/** Options sorted by a preference list; the rest after (higher spell levels first for spells, else in their order). */
function ranked(options: Opt[], prefer: string[], byLevel = false): Opt[] {
  const rank = (o: Opt) => { const i = prefer.indexOf(o.name); return i < 0 ? prefer.length : i; };
  return options.map((o, i) => ({ o, i })).sort((x, y) =>
    rank(x.o) - rank(y.o) || (byLevel ? (y.o.level ?? 0) - (x.o.level ?? 0) : 0) || x.i - y.i).map((x) => x.o);
}

/** The classes' main abilities, most important first (the class going up first). */
function orderFor(cls: string): Ability[] {
  return CLASS_ORDER[cls] ?? ["STR", "DEX", "CON", "WIS", "INT", "CHA"];
}

function pickFor(ch: Choice, cls: string, taken: Set<string>): string[] {
  const opts = ch.options.filter((o) => !taken.has(o.name));
  const n = ch.choose;
  const dex = orderFor(cls)[0] === "DEX";
  switch (ch.kind) {
    case "subclass": return opts.length ? [opts[0].name] : [];
    case "cantrips": return ranked(opts, CANTRIPS).slice(0, n).map((o) => o.name);
    case "spells": return ranked(opts, SPELLS, true).slice(0, n).map((o) => o.name);
    case "expertise": case "skills": return ranked(opts, SKILLS).slice(0, n).map((o) => o.name);
    case "weapons": return ranked(opts, dex ? DEX_WEAPONS : STR_WEAPONS).slice(0, n).map((o) => o.name);
    case "pick": {
      const style = dex ? ["Archery", "Two-Weapon Fighting", "Defense", "Dueling"] : ["Great Weapon Fighting", "Defense", "Dueling", "Archery"];
      // the engine already leaves out invocations above your level; ones that need something else come last
      const plain = opts.filter((o) => !o.prereq || /level/i.test(o.prereq) && !/,|\bor\b|\band\b/i.test(o.prereq));
      const rest = opts.filter((o) => !plain.includes(o));
      return [...ranked(plain, [...style, ...PICKS]), ...ranked(rest, PICKS)].slice(0, n).map((o) => o.name);
    }
    default: return [];
  }
}

/**
 * Fill the open choices of one level. `only` limits it to spell choices ("spells") or everything else ("features").
 * ASI: +2 to the class's main score (or +1/+1 when that would pass 20), a feat once the main scores are maxed.
 */
export function recommend(plan: Plan, answers: Answers, c: LevelChar, data: RulesData, only?: "spells" | "features"): Answers {
  const SPELLY = new Set(["cantrips", "spells", "swap-in", "swap-out"]);
  const out: Answers = { picks: { ...answers.picks }, asi: { ...(answers.asi ?? {}) }, hp: answers.hp };
  // the subclass first: it decides which other choices apply
  const subCh = plan.choices.find((ch) => ch.kind === "subclass");
  if (subCh && only !== "spells" && !(out.picks.subclass?.[0])) out.picks.subclass = pickFor(subCh, plan.className, new Set());
  const taken = new Set(Object.values(out.picks).flat());
  for (const ch of activeChoices(plan, out)) {
    if (ch.optional || ch.kind === "subclass") continue;
    if (only && (only === "spells") !== SPELLY.has(ch.kind)) continue;
    if (ch.kind === "asi") {
      if (out.asi![ch.key]) continue;
      const s = c.ability_scores;
      const order = orderFor(plan.className);
      const at = (x: Ability) => s[x] ?? 10;
      const [a, b] = order;
      const feat = () => {
        const f = ranked(ch.options.filter((o) => !o.prereq || ch.boon), FEATS)[0];
        if (!f) return null;
        const raises = featAbilities(data.feats.find((x) => x.name === f.name)?.text ?? f.text);
        const ability = raises?.abilities.find((x) => at(x) < raises.max);
        return { mode: "feat" as const, feat: f.name, ...(raises && ability ? { ability } : {}) };
      };
      const plus2 = order.find((x) => at(x) <= 18);
      const ones = order.filter((x) => at(x) <= 19);
      const choice = ch.boon ? feat()
        : at(a) <= 18 ? { mode: "plus2" as const, a }
        : at(a) === 19 && at(b) <= 19 ? { mode: "split" as const, a, b }
        : at(b) <= 18 ? { mode: "plus2" as const, a: b }
        // the main scores are maxed: a feat, else the next scores down the list
        : feat() ?? (plus2 ? { mode: "plus2" as const, a: plus2 } : ones.length >= 2 ? { mode: "split" as const, a: ones[0], b: ones[1] } : null);
      if (choice) out.asi![ch.key] = choice;
      continue;
    }
    if ((out.picks[ch.key]?.length ?? 0) >= ch.choose) continue;
    const have = out.picks[ch.key] ?? [];
    const more = pickFor({ ...ch, choose: ch.choose - have.length }, plan.className, new Set([...taken, ...have]));
    out.picks[ch.key] = [...have, ...more];
    for (const m of more) taken.add(m);
  }
  if (!Object.keys(out.asi!).length) delete out.asi;
  return out;
}

// ---------------------------------------------------------------- the suggestion for each choice, with one line why

const WHY: Record<string, string> = {
  "Great Weapon Fighting": "rerolls low damage dice with two-handed weapons", Archery: "+2 to hit with ranged weapons",
  Defense: "+1 AC whenever you wear armor", "Two-Weapon Fighting": "adds your modifier to the off-hand attack", Dueling: "+2 damage with a one-handed weapon",
  "Agonizing Blast": "adds your CHA to every Eldritch Blast hit", "Devil's Sight": "see in magical darkness (great with Darkness)",
  "Repelling Blast": "pushes enemies back 10 ft", "Pact of the Tome": "extra cantrips and rituals", "Pact of the Blade": "a magic weapon that uses CHA",
  "Quickened Spell": "cast a spell as a bonus action", "Twinned Spell": "one spell hits two targets", "Careful Spell": "keep friends safe from your area spells",
  "Eldritch Blast": "the best damage cantrip", "Fire Bolt": "strong ranged damage cantrip", "Toll the Dead": "big damage against hurt targets",
  "Sacred Flame": "damage that ignores cover", Guidance: "+1d4 to a friend's check", "Mage Hand": "handy at a distance", "Vicious Mockery": "damage and disadvantage",
  Shield: "+5 AC as a reaction", "Magic Missile": "never misses", "Healing Word": "heal from range as a bonus action", Bless: "+1d4 on attacks and saves for three",
  Fireball: "the classic area damage", Counterspell: "stop an enemy spell", "Misty Step": "teleport out of trouble", "Spirit Guardians": "damage everyone near you",
  "Hold Person": "paralyze a humanoid", Haste: "double speed and an extra action", Revivify: "bring a friend back", "Hypnotic Pattern": "takes many enemies out of the fight",
  Polymorph: "turn a foe harmless or a friend huge", Banishment: "remove one enemy for the fight", "Greater Invisibility": "attack invisible",
  "Wall of Force": "split the battlefield", "Hunter's Mark": "extra damage on every hit", Hex: "extra damage on every hit", Sleep: "ends fights at low levels",
};

export type Suggestion = { names: string[]; asi?: AsiAnswer; why: string };

/** What "Pick for me" would choose for each open choice (keyed by choice), and why in a few words. */
export function suggestions(plan: Plan, answers: Answers, c: LevelChar): Record<string, Suggestion> {
  const empty: Answers = { picks: { subclass: answers.picks.subclass ?? [] }, hp: answers.hp };
  const rec = recommend(plan, empty, c, { feats: [] } as unknown as RulesData);
  const out: Record<string, Suggestion> = {};
  const cls = plan.className;
  const [main] = orderFor(cls);
  for (const ch of activeChoices(plan, rec)) {
    if (ch.optional) continue;
    if (ch.kind === "asi") {
      const a = rec.asi?.[ch.key];
      if (!a) continue;
      const s = (x: Ability) => c.ability_scores[x] ?? 10;
      out[ch.key] = {
        names: [], asi: a,
        why: a.mode === "plus2" ? `+2 ${a.a} (${s(a.a)} → ${s(a.a) + 2})${a.a === main ? `, a ${cls}'s main score` : ""}.`
          : a.mode === "split" ? `${a.a} +1 and ${a.b} +1 (${a.a} ${s(a.a)} → ${s(a.a) + 1}).`
          : `${a.feat}: your main scores are already high.`,
      };
      continue;
    }
    const names = rec.picks[ch.key] ?? [];
    if (!names.length) continue;
    const reasons = names.map((n) => WHY[n]).filter(Boolean);
    const why = ch.kind === "subclass" ? "The free rules' subclass for this class."
      : ch.kind === "weapons" ? `Weapons that suit a ${main === "DEX" ? "DEX" : "STR"} ${cls}.`
      : ch.kind === "expertise" || ch.kind === "skills" ? "The skills that come up most at the table."
      : reasons.length ? `${names.length > 1 ? `${names[0]}: ` : ""}${reasons[0]}${reasons.length > 1 ? `; ${names[1]}: ${reasons[1]}` : ""}.`
      : ch.kind === "spells" || ch.kind === "cantrips" ? `Popular ${ch.kind === "cantrips" ? "cantrips" : "spells"} for a ${cls}.`
      : `A popular choice for a ${cls}.`;
    out[ch.key] = { names, why };
  }
  return out;
}
