// Level-up rules (pure, no database): what a character gets at their next level, what they must choose,
// checking their choices, and the changes to save. Works for 2014 and 2024 rules and for multiclassing.
import { CLASSES, classResources, spellSlots, type Rules } from "../classes";
import { ABILITIES, profBonus, SKILLS, totalLevel, type Ability, type ClassLevel } from "../rules";
import type { AsiAnswer, Answers, Choice, DataChoice, Opt, Plan, RulesData, SpellLite, SubclassData, Text } from "./types";

export type LevelChar = {
  class_levels: ClassLevel[];
  ability_scores: Partial<Record<Ability, number>>;
  proficiencies: { saves?: Ability[]; skills?: string[]; expertise?: string[]; mastery?: string[] };
  features: (string | { name: string; source?: string; description?: string; feat?: boolean })[];
  spells: { ability?: Ability; slots?: Record<string, number>; slots_used?: Record<string, number>; known?: string[]; pact_level?: number; pact_slots?: number; [k: string]: unknown };
  resources: { name: string; max: number; used?: number; recharge?: string }[];
  hp_max: number | null; hp_current: number | null;
  rule_set?: Rules;
};

const mod = (s: number | undefined) => Math.floor(((s ?? 10) - 10) / 2);
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const KNOWN_SWAP_2014 = ["Bard", "Ranger", "Sorcerer", "Warlock"];
const SWAP_2024 = ["Bard", "Paladin", "Ranger", "Sorcerer", "Warlock"];
const featureNames = (c: LevelChar) => new Set(c.features.map((f) => (typeof f === "string" ? f : f.name).toLowerCase()));

/** "Evoker" ↔ "Evocation", "Life Domain" ↔ "Life", "Berserker" ↔ "Path of the Berserker". */
export function findSubclass(list: SubclassData[], name: string | undefined | null): SubclassData | null {
  if (!name) return null;
  const norm = (s: string) => s.toLowerCase().replace(/\b(path|college|circle|oath|warrior|school|way|domain|patron|sorcery|sorcerous|of|the)\b/g, "")
    .replace(/evoker/, "evocation").replace(/\s+/g, " ").trim();
  const n = norm(name);
  return list.find((s) => norm(s.name) === n) ?? list.find((s) => norm(s.name).includes(n) || n.includes(norm(s.name))) ?? null;
}

/** Can this character start a new class? (13 in the ability scores both classes need.) Warnings, not blocks. */
export function multiclassCheck(c: LevelChar, cls: string, data: RulesData): string | null {
  const need = (name: string) => data.classes[name]?.mcPrereq ?? [];
  const missing: string[] = [];
  for (const name of [cls, ...c.class_levels.map((l) => l.class)]) {
    for (const group of need(name)) {
      if (!group.some(([a, min]) => (c.ability_scores[a] ?? 10) >= min)) missing.push(`${group.map(([a, min]) => `${a} ${min}`).join(" or ")} (for ${name})`);
    }
  }
  return missing.length ? `Multiclassing normally needs ${[...new Set(missing)].join(", ")}. Check with your DM.` : null;
}

/** The first step: which class to level. Your classes first, then the ones you could add. */
export function levelChoices(c: LevelChar, data: RulesData) {
  const total = totalLevel(c.class_levels);
  const mine = c.class_levels.map((l) => ({ className: l.class, level: l.level + 1, subclass: l.subclass ?? null, isNew: false, warning: null as string | null }))
    .filter((x) => x.level <= 20 && data.classes[x.className]);
  const others = Object.keys(data.classes).filter((n) => !c.class_levels.some((l) => l.class === n))
    .map((n) => ({ className: n, level: 1, subclass: null, isNew: true, warning: multiclassCheck(c, n, data) }));
  return { total, canLevel: total < 20, mine, others };
}

/** Spells a class gets at a level: cantrips, spells to learn/prepare, the highest spell level it can take. */
export function spellProgress(data: RulesData, cls: string, level: number, scores: LevelChar["ability_scores"]) {
  const row = level > 0 ? data.classes[cls]?.levels[String(level)] : null;
  if (!row) return { cantrips: 0, spells: 0, maxLevel: 0 };
  const slots = row.slots ?? [];
  let maxLevel = 0;
  slots.forEach((n, i) => { if (n > 0) maxLevel = i + 1; });
  const ab = CLASSES[cls]?.spell;
  let spells = 0;
  if (data.rules === "2024") spells = row.prepared ?? 0;
  else if (row.known != null) spells = row.known;
  else if (cls === "Wizard") spells = 6 + 2 * (level - 1);                                        // spellbook
  else if (cls === "Cleric" || cls === "Druid") spells = Math.max(1, mod(scores[ab!]) + level);    // prepared
  else if (cls === "Paladin") spells = level >= 2 ? Math.max(1, mod(scores.CHA) + Math.floor(level / 2)) : 0;
  return { cantrips: row.cantrips ?? 0, spells, maxLevel };
}

function onList(data: RulesData, s: SpellLite, cls: string) {
  return data.rules === "2014" ? (data.spells?.[s.name] ?? []).includes(cls) : s.classes.includes(cls);
}
function spellOpt(s: SpellLite): Opt {
  const tags = [s.level === 0 ? "Cantrip" : `${ORD[s.level]} level`, s.school ?? "", s.concentration ? "Concentration" : "", s.ritual ? "Ritual" : ""].filter(Boolean);
  const meta = [s.casting_time, s.range, s.duration].filter(Boolean).join(" · ");
  return { name: s.name, level: s.level, school: s.school ?? undefined, tags, text: (meta ? meta + "\n" : "") + s.description };
}

/** Does this feat raise an ability score? ("Increase your Strength or Dexterity score by 1…") */
export function featAbilities(text: string): { abilities: Ability[]; max: number } | null {
  const full: Record<string, Ability> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
  const m = text.match(/Increase (your [A-Za-z ,]+?|one ability score of your choice) (?:score )?by 1, to a maximum of (\d+)/i)
    ?? text.match(/Increase (your [A-Za-z ,]+? score|one ability score of your choice) by 1/i);
  if (!m) return null;
  const max = Number(m[2] ?? 20) || 20;
  if (/one ability score/i.test(m[1])) return { abilities: [...ABILITIES], max };
  const abilities = Object.entries(full).filter(([w]) => new RegExp(`\\b${w}\\b`, "i").test(m[1])).map(([, a]) => a);
  return abilities.length ? { abilities, max } : null;
}

function resolveOptions(data: RulesData, c: DataChoice): Opt[] {
  return typeof c.options === "string" ? data.options[c.options] ?? [] : c.options ?? [];
}

/** Everything about going up one level in `cls`. */
/** `first`: a brand-new character's first level (the character builder), not a multiclass: no multiclass rules or extra skill. */
export function planLevelUp(c: LevelChar, cls: string, data: RulesData, spells: SpellLite[], opts: { first?: boolean } = {}): Plan {
  const cd = data.classes[cls];
  if (!cd) throw new Error(`Unknown class: ${cls}`);
  const cur = c.class_levels.find((l) => l.class === cls);
  const fromLevel = cur?.level ?? 0;
  const toLevel = fromLevel + 1;
  const oldTotal = totalLevel(c.class_levels);
  const row = cd.levels[String(toLevel)];
  const scores = c.ability_scores;
  const known = new Set((c.spells.known ?? []).map((s) => s.toLowerCase()));
  const have = featureNames(c);
  const warnings: string[] = [];
  if (!cur && !opts.first) { const w = multiclassCheck(c, cls, data); if (w) warnings.push(w); }

  const sub = findSubclass(cd.subclasses, cur?.subclass);
  if (cur?.subclass && !sub) warnings.push(`Your subclass "${cur.subclass}" isn't in the free rules, so its features aren't listed here. Add them on the Features tab.`);

  // ---- what you get anyway
  const auto: Plan["auto"] = row.features.map((f) => ({ ...f, source: `${cls} ${toLevel}` }));
  if (sub) for (const f of sub.levels[String(toLevel)] ?? []) auto.push({ ...f, source: `${sub.name} ${toLevel}` });

  const gains: string[] = [];
  if (!cur && !opts.first) {
    const p = cd.mcProf.length ? `You gain proficiency with: ${cd.mcProf.join(", ")}.` : "";
    gains.push(`You start a new class: ${cls} level 1. ${p}`.trim());
  }
  const pbOld = profBonus(Math.max(1, oldTotal)), pbNew = profBonus(oldTotal + 1);
  if (pbNew > pbOld) gains.push(`Proficiency bonus goes up to +${pbNew} (attacks, saves, skills, spell DC).`);
  const newLevels = cur ? c.class_levels.map((l) => (l.class === cls ? { ...l, level: toLevel } : l)) : [...c.class_levels, { class: cls, level: 1 }];
  const rules = data.rules;
  const so = spellSlots(c.class_levels, rules), sn = spellSlots(newLevels, rules);
  for (let i = 1; i <= 9; i++) {
    const a = so.slots[String(i)] ?? 0, b = sn.slots[String(i)] ?? 0;
    if (b > a) gains.push(a ? `${ORD[i]}-level spell slots: ${a} → ${b}.` : `New: ${b} ${ORD[i]}-level spell slot${b > 1 ? "s" : ""}.`);
  }
  const ro = classResources(c.class_levels, scores as Record<Ability, number>, rules), rn = classResources(newLevels, scores as Record<Ability, number>, rules);
  for (const r of rn) {
    const o = ro.find((x) => x.name === r.name);
    if (!o) gains.push(`New: ${r.name} (${r.max}, back on a ${r.recharge}).`);
    else if (r.max > o.max) gains.push(`${r.name}: ${o.max} → ${r.max}.`);
  }
  const prevCs = cd.levels[String(fromLevel)]?.cs ?? {};
  const CS: Record<string, (v: number) => string> = {
    rage_damage_bonus: (v) => `Rage damage bonus: +${v}.`, brutal_critical_dice: (v) => `Brutal Critical: ${v} extra die.`,
    bardic_inspiration_die: (v) => `Bardic Inspiration die: d${v}.`, sorcery_points: (v) => `Sorcery Points: ${v}.`,
    ki_points: (v) => `Ki points: ${v}.`, focus_points: (v) => `Focus Points: ${v}.`, unarmored_movement: (v) => `Unarmored Movement: +${v} ft.`,
    aura_range: (v) => `Aura range: ${v} ft.`, extra_attacks: (v) => `Extra attacks: ${v}.`, wild_shape_max_cr: (v) => `Wild Shape up to CR ${v}.`,
  };
  for (const [k, f] of Object.entries(CS)) if (row.cs[k] != null && row.cs[k] !== (prevCs[k] ?? 0) && row.cs[k] > 0) gains.push(f(row.cs[k]));

  // ---- choices
  const choices: Choice[] = [];
  const addDataChoices = (list: DataChoice[], forSubclass?: string) => {
    for (const dc of list) {
      if (dc.kind === "pick") {
        let opts = resolveOptions(data, dc).filter((o) => !have.has(o.name.toLowerCase()));
        if (dc.options === "invocations") opts = opts.filter((o) => !o.minLevel || o.minLevel <= toLevel);
        choices.push({ key: dc.key, kind: "pick", title: dc.title, choose: Math.min(dc.choose, opts.length), options: opts, forSubclass,
          help: dc.choose > 1 ? `Pick ${dc.choose}.` : "Pick one." });
      } else if (dc.kind === "expertise") {
        const skills = (c.proficiencies.skills ?? []).filter((s) => !(c.proficiencies.expertise ?? []).includes(s) && (!dc.limit || dc.limit.includes(s)));
        choices.push({ key: dc.key, kind: "expertise", title: dc.title, choose: Math.min(dc.choose, skills.length), forSubclass,
          help: `Double your proficiency bonus on ${dc.choose === 1 ? "one skill" : `${dc.choose} skills`} you're proficient in.`,
          options: skills.map((s) => ({ name: s, text: `${SKILLS[s]} skill` })) });
      } else if (dc.kind === "weapons") {
        const mine = new Set((c.proficiencies.mastery ?? []).map((m) => m.toLowerCase()));
        const opts = (data.weapons ?? []).filter((w) => !mine.has(w.name.toLowerCase())).map((w) => ({ name: w.name, text: `Mastery: ${w.mastery}`, tags: [w.mastery ?? ""] }));
        choices.push({ key: dc.key, kind: "weapons", title: dc.title, choose: dc.choose, options: opts, forSubclass,
          help: `Pick ${dc.choose}${mine.size ? " more" : ""} kind${dc.choose > 1 ? "s" : ""} of weapon whose mastery property you can use.` });
      } else if (dc.kind === "spells" && dc.level) {
        const opts = spells.filter((s) => s.level === dc.level && onList(data, s, cls) && !known.has(s.name.toLowerCase())).map(spellOpt);
        choices.push({ key: dc.key, kind: "spells", title: dc.title, choose: 1, options: opts, forSubclass,
          help: `One ${ORD[dc.level]}-level spell you can cast once per long rest without a slot.` });
      }
    }
  };

  // subclass
  if (!cur?.subclass && toLevel >= cd.subclassLevel) {
    const gives: Record<string, Text[]> = {};
    for (const s of cd.subclasses) gives[s.name] = Object.entries(s.levels).filter(([lv]) => Number(lv) <= toLevel).flatMap(([, fs]) => fs);
    choices.push({ key: "subclass", kind: "subclass", title: `${cls} subclass`, choose: 1, gives,
      help: "Your specialty. It gives you new features now and at later levels.",
      options: cd.subclasses.map((s) => ({ name: s.name, text: [s.flavor, s.text].filter(Boolean).join("\n") })) });
    for (const s of cd.subclasses) for (const [lv, list] of Object.entries(s.choices)) if (Number(lv) <= toLevel) addDataChoices(list, s.name);
  }
  addDataChoices(row.choices);
  if (sub) addDataChoices(sub.choices[String(toLevel)] ?? []);

  if (row.asi || row.boon) {
    choices.push({ key: `asi-${toLevel}`, kind: "asi", title: row.boon ? "Epic Boon" : "Ability Score Improvement", choose: 1, boon: row.boon,
      help: row.boon ? "Pick an Epic Boon feat (or another feat you qualify for)." : "Raise one score by 2, two scores by 1, or take a feat instead (max 20).",
      options: data.feats.filter((f) => f.category !== "Fighting Style" && (row.boon || f.category !== "Epic Boon") && f.name !== "Ability Score Improvement")
        .filter((f) => !have.has(f.name.toLowerCase()) || /repeatable/i.test(f.text))
        .sort((a, b) => Number(b.category === "Epic Boon") - Number(a.category === "Epic Boon"))
        .map((f) => ({ name: f.name, text: f.text, prereq: f.prereq ?? undefined, tags: [f.category ?? "Feat"] })) });
  }

  // spells
  const before = spellProgress(data, cls, fromLevel, scores), after = spellProgress(data, cls, toLevel, scores);
  const newCantrips = Math.max(0, after.cantrips - before.cantrips);
  const newSpells = Math.max(0, after.spells - before.spells);
  if (newCantrips) {
    const opts = spells.filter((s) => s.level === 0 && onList(data, s, cls) && !known.has(s.name.toLowerCase())).map(spellOpt);
    choices.push({ key: "cantrips", kind: "cantrips", title: `New cantrip${newCantrips > 1 ? "s" : ""}`, choose: Math.min(newCantrips, opts.length), options: opts,
      help: `Pick ${newCantrips} ${cls} cantrip${newCantrips > 1 ? "s" : ""}. You can cast them as often as you like.` });
  }
  if (newSpells && after.maxLevel) {
    const opts = spells.filter((s) => s.level >= 1 && s.level <= after.maxLevel && onList(data, s, cls) && !known.has(s.name.toLowerCase()))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)).map(spellOpt);
    const verb = cls === "Wizard" ? "add to your spellbook" : data.rules === "2024" || ["Cleric", "Druid", "Paladin"].includes(cls) ? "prepare" : "learn";
    choices.push({ key: "spells", kind: "spells", title: `New spell${newSpells > 1 ? "s" : ""}`, choose: Math.min(newSpells, opts.length), options: opts,
      help: `Pick ${newSpells} ${cls} spell${newSpells > 1 ? "s" : ""} to ${verb} (up to ${ORD[after.maxLevel]} level).` });
  }
  const canSwap = cur && (data.rules === "2014" ? KNOWN_SWAP_2014 : SWAP_2024).includes(cls) && after.maxLevel > 0;
  if (canSwap) {
    const mine = spells.filter((s) => s.level >= 1 && known.has(s.name.toLowerCase()) && onList(data, s, cls)).map(spellOpt);
    if (mine.length) {
      choices.push({ key: "swap-out", kind: "swap-out", title: "Swap a spell (optional)", choose: 1, optional: true, options: mine,
        help: "You may forget one spell you know and learn a different one in its place." });
      choices.push({ key: "swap-in", kind: "swap-in", title: "…and learn this one instead", choose: 1, optional: true,
        options: spells.filter((s) => s.level >= 1 && s.level <= after.maxLevel && onList(data, s, cls) && !known.has(s.name.toLowerCase())).map(spellOpt),
        help: "Only needed if you picked a spell to forget." });
    }
  }

  // multiclass skill
  if (!cur && cd.mcSkills && !opts.first) {
    const mine = new Set(c.proficiencies.skills ?? []);
    const opts = cd.mcSkills.from.filter((s) => !mine.has(s)).map((s) => ({ name: s, text: `${SKILLS[s]} skill` }));
    if (opts.length) choices.push({ key: "mc-skills", kind: "skills", title: "New skill", choose: Math.min(cd.mcSkills.choose, opts.length), options: opts,
      help: `Starting ${cls} gives you proficiency in ${cd.mcSkills.choose === 1 ? "one skill" : `${cd.mcSkills.choose} skills`}.` });
  }

  const conMod = mod(scores.CON);
  return {
    className: cls, isNew: !cur, fromLevel, toLevel, totalLevel: oldTotal + 1, rules,
    hitDie: cd.hitDie, average: Math.floor(cd.hitDie / 2) + 1, conMod,
    subclass: sub?.name ?? cur?.subclass ?? null, auto, gains, choices: choices.filter((ch) => ch.choose > 0 || ch.optional), warnings,
  };
}

/** Which choices apply, given the subclass picked now. */
export function activeChoices(plan: Plan, answers: Answers): Choice[] {
  const picked = answers.picks.subclass?.[0] ?? null;
  return plan.choices.filter((c) => !c.forSubclass || c.forSubclass === picked);
}

function asiOk(a: AsiAnswer | undefined, scores: LevelChar["ability_scores"], c: Choice, data: RulesData): string | null {
  if (!a) return `${c.title}: make a choice.`;
  const cap = (x: Ability, plus: number, max = 20) => ((scores[x] ?? 10) + plus > max ? `${x} can't go above ${max}.` : null);
  if (a.mode === "plus2") return c.boon ? "Pick a feat for your Epic Boon." : cap(a.a, 2);
  if (a.mode === "split") return c.boon ? "Pick a feat for your Epic Boon." : a.a === a.b ? "Pick two different scores (or +2 to one)." : cap(a.a, 1) ?? cap(a.b, 1);
  const f = c.options.find((o) => o.name === a.feat);
  if (!f) return `${c.title}: pick a feat from the list.`;
  const fa = featAbilities(data.feats.find((x) => x.name === f.name)?.text ?? f.text);
  if (fa) {
    if (!a.ability || !fa.abilities.includes(a.ability)) return `${f.name}: pick which score goes up by 1.`;
    return cap(a.ability, 1, fa.max);
  }
  return null;
}

/** null when every required choice is made (and valid), otherwise what's missing. */
export function checkAnswers(plan: Plan, answers: Answers, c: LevelChar, data: RulesData): string | null {
  for (const ch of activeChoices(plan, answers)) {
    if (ch.kind === "asi") { const e = asiOk(answers.asi?.[ch.key], c.ability_scores, ch, data); if (e) return e; continue; }
    const got = answers.picks[ch.key] ?? [];
    if (ch.kind === "subclass") {
      const name = got[0]?.trim();
      if (!name) return "Pick your subclass.";
      if (!ch.options.some((o) => o.name === name) && (name.length > 40 || !name.startsWith("custom:"))) return "Pick a subclass from the list.";
      continue;
    }
    if (ch.optional) {
      const out = answers.picks["swap-out"] ?? [], into = answers.picks["swap-in"] ?? [];
      if (out.length !== into.length) return "To swap a spell, pick one to forget and one to learn (or neither).";
      if (got.some((g) => !ch.options.some((o) => o.name === g)) || got.length > 1) return `${ch.title}: pick from the list.`;
      continue;
    }
    if (new Set(got).size !== got.length) return `${ch.title}: pick different ones.`;
    if (got.length !== ch.choose) return `${ch.title}: pick ${ch.choose} (you picked ${got.length}).`;
    if (got.some((g) => !ch.options.some((o) => o.name === g))) return `${ch.title}: pick from the list.`;
  }
  const allSpells = [...(answers.picks.cantrips ?? []), ...(answers.picks.spells ?? []), ...(answers.picks["swap-in"] ?? [])];
  if (new Set(allSpells).size !== allSpells.length) return "You picked the same spell twice.";
  return null;
}

export type LevelPatch = {
  class_levels: ClassLevel[]; ability_scores: Record<string, number>; hp_max: number; hp_current: number;
  proficiencies: LevelChar["proficiencies"]; features: LevelChar["features"]; spells: LevelChar["spells"]; resources: LevelChar["resources"];
};

/** The character after the level-up. `hpRoll` is the hit die result when they rolled (null = average). */
export function applyLevelUp(c: LevelChar, plan: Plan, answers: Answers, hpRoll: number | null, data: RulesData): { patch: LevelPatch; summary: string[] } {
  const err = checkAnswers(plan, answers, c, data);
  if (err) throw new Error(err);
  const summary: string[] = [];
  const cls = plan.className, lvl = plan.toLevel;
  const scores = { ...c.ability_scores } as Record<string, number>;
  const oldCon = mod(scores.CON);
  const features = [...c.features];
  const addFeature = (f: { name: string; source: string; description?: string; feat?: boolean }) => {
    if (features.some((x) => typeof x !== "string" && x.name === f.name && x.source === f.source)) return;
    features.push(f);
  };

  // subclass + class level
  let subclass = c.class_levels.find((l) => l.class === cls)?.subclass ?? null;
  const pickedSub = answers.picks.subclass?.[0]?.replace(/^custom:/, "").trim();
  if (pickedSub) { subclass = pickedSub.slice(0, 40); summary.push(`Subclass: ${subclass}.`); }
  const class_levels = plan.isNew
    ? [...c.class_levels, { class: cls, level: 1, ...(subclass ? { subclass } : {}) }]
    : c.class_levels.map((l) => (l.class === cls ? { ...l, level: lvl, ...(subclass ? { subclass } : {}) } : l));
  summary.unshift(`${cls} ${lvl} (character level ${plan.totalLevel}).`);

  // features you get anyway (+ the new subclass's features up to this level)
  for (const f of plan.auto) addFeature({ name: f.name, source: f.source, description: f.text });
  const subChoice = plan.choices.find((c2) => c2.kind === "subclass");
  if (pickedSub && subChoice?.gives?.[pickedSub]) {
    const sd = data.classes[cls].subclasses.find((s) => s.name === pickedSub);
    for (const [lv, fs] of Object.entries(sd?.levels ?? {})) if (Number(lv) <= lvl) for (const f of fs) addFeature({ name: f.name, source: `${pickedSub} ${lv}`, description: f.text });
  }

  // ability scores / feats
  for (const ch of activeChoices(plan, answers).filter((x) => x.kind === "asi")) {
    const a = answers.asi![ch.key];
    if (a.mode === "plus2") { scores[a.a] = (scores[a.a] ?? 10) + 2; summary.push(`${a.a} +2.`); }
    else if (a.mode === "split") { scores[a.a] = (scores[a.a] ?? 10) + 1; scores[a.b] = (scores[a.b] ?? 10) + 1; summary.push(`${a.a} +1, ${a.b} +1.`); }
    else {
      const f = data.feats.find((x) => x.name === a.feat)!;
      addFeature({ name: f.name, source: `${cls} ${lvl}`, description: f.text, feat: true });
      if (a.ability) scores[a.ability] = (scores[a.ability] ?? 10) + 1;
      summary.push(`Feat: ${f.name}${a.ability ? ` (${a.ability} +1)` : ""}.`);
    }
  }

  // picks
  const prof = { ...c.proficiencies, skills: [...(c.proficiencies.skills ?? [])], expertise: [...(c.proficiencies.expertise ?? [])], mastery: [...(c.proficiencies.mastery ?? [])] };
  const book = { ...c.spells, known: [...(c.spells.known ?? [])] };
  for (const ch of activeChoices(plan, answers)) {
    const got = answers.picks[ch.key] ?? [];
    if (!got.length) continue;
    if (ch.kind === "pick") {
      for (const g of got) { const o = ch.options.find((x) => x.name === g)!; addFeature({ name: o.name, source: ch.title, description: o.text }); }
      summary.push(`${ch.title}: ${got.join(", ")}.`);
    } else if (ch.kind === "expertise") { prof.expertise.push(...got); summary.push(`Expertise: ${got.join(", ")}.`); }
    else if (ch.kind === "skills") { prof.skills.push(...got); summary.push(`New skill: ${got.join(", ")}.`); }
    else if (ch.kind === "weapons") { prof.mastery.push(...got); summary.push(`Weapon mastery: ${got.join(", ")}.`); }
    else if (ch.kind === "cantrips" || ch.kind === "spells" || ch.kind === "swap-in") { book.known.push(...got); summary.push(`${ch.kind === "swap-in" ? "Learned instead" : ch.title}: ${got.join(", ")}.`); }
    else if (ch.kind === "swap-out") { book.known = book.known.filter((s) => !got.includes(s)); summary.push(`Forgot: ${got.join(", ")}.`); }
  }
  if (!prof.mastery.length) delete (prof as { mastery?: string[] }).mastery;

  // spell slots and spellcasting ability
  const { slots, pact } = spellSlots(class_levels, plan.rules);
  book.slots = slots;
  book.slots_used = Object.fromEntries(Object.entries(c.spells.slots_used ?? {}).map(([k, v]) => [k, Math.min(v, slots[k] ?? 0)]).filter(([, v]) => (v as number) > 0));
  if (pact) { book.pact_level = pact.level; book.pact_slots = pact.count; } else { delete book.pact_level; delete book.pact_slots; }
  if (!book.ability && CLASSES[cls]?.spell) book.ability = CLASSES[cls].spell!;

  // hit points (a higher CON counts for every level you already had)
  const newCon = mod(scores.CON);
  const base = hpRoll ?? plan.average;
  const gain = Math.max(1, base + newCon) + (newCon - oldCon) * (plan.totalLevel - 1);
  const hp_max = (c.hp_max ?? 0) + gain;
  const hp_current = Math.min(hp_max, (c.hp_current ?? c.hp_max ?? 0) + gain);
  summary.splice(1, 0, `Hit points +${gain} (${hpRoll != null ? `rolled ${hpRoll}` : `average ${plan.average}`}${newCon ? ` ${newCon > 0 ? "+" : "−"} ${Math.abs(newCon)} CON` : ""}${newCon !== oldCon ? `, CON bonus for earlier levels` : ""}): ${hp_max} max.`);

  // resources: new maximums, keep what's used
  const rn = classResources(class_levels, scores as Record<Ability, number>, plan.rules);
  const resources = [
    ...rn.map((r) => { const o = c.resources.find((x) => x.name === r.name); return { ...r, used: Math.min(o?.used ?? 0, r.max) }; }),
    ...c.resources.filter((r) => !rn.some((x) => x.name === r.name) && !classResources(c.class_levels, c.ability_scores as Record<Ability, number>, plan.rules).some((x) => x.name === r.name)),
  ];

  return { patch: { class_levels, ability_scores: scores, hp_max, hp_current, proficiencies: prof, features, spells: book, resources }, summary };
}

/**
 * Level down without a saved history (characters made before level-ups were in the app): take one level off a class.
 * The class's (and subclass's) features from that level go, HP drops by the average, slots and resources follow.
 * Spells and ability scores can't be known for sure, so the notes say what to check by hand.
 */
export function levelDown(c: LevelChar, cls: string, data: RulesData): { patch: LevelPatch; notes: string[] } {
  const cur = c.class_levels.find((l) => l.class === cls);
  if (!cur) throw new Error(`No ${cls} levels to take off.`);
  if (totalLevel(c.class_levels) <= 1) throw new Error("Level 1 is the lowest level.");
  const cd = data.classes[cls];
  const lvl = cur.level;
  const notes: string[] = [];
  const sub = cd ? findSubclass(cd.subclasses, cur.subclass) : null;
  const dropSub = !!cur.subclass && !!cd && lvl - 1 < cd.subclassLevel;
  const sources = new Set([`${cls} ${lvl}`, ...(sub || cur.subclass ? [`${sub?.name ?? cur.subclass} ${lvl}`] : [])]);
  if (dropSub && cur.subclass) for (let i = 1; i <= lvl; i++) sources.add(`${sub?.name ?? cur.subclass} ${i}`);
  const removed: string[] = [];
  const features = c.features.filter((f) => {
    if (typeof f === "string" || !f.source || !sources.has(f.source)) return true;
    removed.push(f.name);
    return false;
  });
  const class_levels = lvl === 1
    ? c.class_levels.filter((l) => l.class !== cls)
    : c.class_levels.map((l) => (l.class === cls ? (dropSub ? { class: cls, level: lvl - 1 } : { ...l, level: lvl - 1 }) : l));
  const scores = c.ability_scores as Record<string, number>;
  const hitDie = cd?.hitDie ?? CLASSES[cls]?.hitDie ?? 8;
  const loss = Math.max(1, Math.floor(hitDie / 2) + 1 + mod(scores.CON));
  const hp_max = Math.max(1, (c.hp_max ?? 0) - loss);
  const { slots, pact } = spellSlots(class_levels, (data.rules ?? "2024") as Rules);
  const spells = { ...c.spells, slots, slots_used: Object.fromEntries(Object.entries(c.spells.slots_used ?? {}).map(([k, v]) => [k, Math.min(v, slots[k] ?? 0)]).filter(([, v]) => (v as number) > 0)) };
  if (pact) { spells.pact_level = pact.level; spells.pact_slots = pact.count; } else { delete spells.pact_level; delete spells.pact_slots; }
  const rn = classResources(class_levels, scores as Record<Ability, number>, data.rules);
  const ro = classResources(c.class_levels, scores as Record<Ability, number>, data.rules);
  const resources = [
    ...rn.map((r) => ({ ...r, used: Math.min(c.resources.find((x) => x.name === r.name)?.used ?? 0, r.max) })),
    ...c.resources.filter((r) => !ro.some((x) => x.name === r.name)),
  ];
  notes.push(`${cls} ${lvl} → ${lvl - 1 || "removed"}. Hit points −${loss} (average): ${hp_max} max.`);
  if (removed.length) notes.push(`Removed: ${removed.join(", ")}.`);
  if (dropSub) notes.push(`Subclass ${cur.subclass} removed (it comes at level ${cd!.subclassLevel}).`);
  if (cd?.levels[String(lvl)]?.asi || cd?.levels[String(lvl)]?.boon) notes.push("This level had an Ability Score Improvement or feat: lower the scores / remove the feat by hand if needed.");
  if ((spellProgress(data, cls, lvl, scores).spells > spellProgress(data, cls, lvl - 1, scores).spells) || (spellProgress(data, cls, lvl, scores).cantrips > spellProgress(data, cls, lvl - 1, scores).cantrips))
    notes.push("This level gave new spells: remove the ones you learned at this level on the Spells tab.");
  return {
    patch: { class_levels, ability_scores: { ...scores }, hp_max, hp_current: Math.min(hp_max, c.hp_current ?? hp_max), proficiencies: c.proficiencies, features, spells, resources },
    notes,
  };
}
