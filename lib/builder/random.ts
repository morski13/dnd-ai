// "Random character" (pure, tested): a whole, valid character in one tap. The class is random (or the one
// you picked), the species and background are ones that suit it, scores are the standard array in the
// class's order, and every level's choices come from "Pick for me". Everything stays editable after.
import { planLevelUp } from "../levelup/engine";
import { cleanFor, recommendSteps, resizeSteps } from "../levelup/multi";
import { recommend } from "../levelup/recommend";
import type { RulesData, SpellLite } from "../levelup/types";
import { MENTAL_ORDER, NAMES_FIRST, NAMES_LAST } from "./names";
import { baseCharacter, blankDraft, checkBase, featKeys, kitFrom, givenSkills, languageCount, MAGIC_LISTS, speciesOf, subOf, suggestedArray } from "./engine";
import { backgroundFit, bestSub, rankSpecies } from "./fit";
import { planBuild } from "./levels";
import { ALIGNMENTS, ALL_SKILLS, CLASS_ORDER, needsFor } from "./special";
import type { BuilderData, Draft, FeatChoice, KitChoice, KitGroup } from "./types";
import type { Ability } from "../rules";

export type Rand = () => number;
const pick = <T>(r: Rand, list: T[]): T => list[Math.floor(r() * list.length) % Math.max(1, list.length)];
function some<T>(r: Rand, list: T[], n: number): T[] {
  const pool = [...list], out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length) % pool.length, 1)[0]);
  return out;
}

function spellsOf(levelData: RulesData, spells: SpellLite[], list: string, level: number): string[] {
  return spells.filter((s) => s.level === level && (levelData.rules === "2014" ? (levelData.spells?.[s.name] ?? []).includes(list) : s.classes.includes(list))).map((s) => s.name);
}

function kits(r: Rand, groups: KitGroup[], data: BuilderData): KitChoice[] {
  return groups.map((g) => {
    const option = 0; // the first kit is the usual one (the others are often "gold instead")
    const kit = g.options[option];
    return { option, picks: (kit?.picks ?? []).map((p) => some(r, data.categories[p.category]?.items ?? [], p.choose).map((i) => i.ref ?? i.name)) };
  });
}

/**
 * A random character for these rules. `keep` keeps the start level, HP choice and (when set) the class of the current draft.
 * `keepPicks` ("Pick everything for me"): everything the player already chose stays; only what's open is filled, with the top picks.
 */
export function randomDraft(keep: Draft, data: BuilderData, levelData: RulesData, spells: SpellLite[],
  opts: { multiclass: boolean; featText: (n: string) => string; keepClass: boolean; rand?: Rand; keepPicks?: boolean }): Draft {
  const kp = !!opts.keepPicks;
  const r = opts.rand ?? (kp ? () => 0 : Math.random);
  const rules = data.rules;
  const classes = Object.keys(levelData.classes).filter((c) => data.classes[c]);
  const cls = (opts.keepClass || kp) && keep.cls && classes.includes(keep.cls) ? keep.cls : pick(r, classes);
  const order = CLASS_ORDER[cls] ?? ["STR", "DEX", "CON", "WIS", "INT", "CHA"];
  const keptScores = kp && keep.cls === cls && !checkBase(keep.method, keep.base);
  let d: Draft = {
    ...blankDraft(rules), cls, method: keptScores ? keep.method : "standard", base: keptScores ? keep.base : suggestedArray(order),
    targetLevel: keep.targetLevel, upHp: keep.upHp, forMe: keep.forMe, details: { ...keep.details }, portrait: keep.portrait ?? null,
    ...(kp && keep.cls === cls ? { level: keep.level, ups: keep.ups, customBackground: keep.customBackground } : {}),
  };
  const same = (k: "species" | "background") => kp && !!keep[k];

  // species that suit the class, and the lineage that suits it best
  const ranked = rankSpecies(rules, cls, data.species);
  const good = ranked.filter((x) => x.fit.tier === "great" || x.fit.tier === "good");
  const sp = (same("species") && data.species.find((x) => x.name === keep.species)) || pick(r, (good.length ? good : ranked.filter((x) => x.fit.tier !== "weak")).map((x) => x.sp));
  const best = bestSub(sp, cls);
  const keptSub = kp && sp.name === keep.species && sp.subs.some((x) => x.name === keep.sub) ? keep.sub : null;
  const sub = sp.subs.length > 1 ? keptSub ?? (sp.subs.find((x) => x.name.replace(/^.*?:\s*/, "") === best) ?? pick(r, sp.subs)).name : null;
  d = { ...d, species: sp.name, sub };
  const needs = needsFor(rules, sp, subOf(d, data));
  const mental = order.find((a) => MENTAL_ORDER.includes(a)) ?? "CHA";
  const cantripList = needs.cantrip ? spellsOf(levelData, spells, needs.cantrip.list, 0) : [];
  const was = kp && sp.name === keep.species ? keep.speciesPicks : null;
  d.speciesPicks = {
    skills: needs.skills ? (was?.skills.length === needs.skills.choose ? was.skills : some(r, needs.skills.from, needs.skills.choose)) : [],
    feat: needs.feat ? was?.feat ?? (MENTAL_ORDER.includes(order[0]) ? "Alert" : "Savage Attacker") : null,
    cantrip: cantripList.length ? (was?.cantrip && cantripList.includes(was.cantrip) ? was.cantrip : pick(r, cantripList)) : null,
    ability: needs.ability ? was?.ability ?? mental : null,
    asi: needs.asi ? (was?.asi.length === needs.asi.choose ? was.asi : order.filter((a) => needs.asi!.from.includes(a)).slice(0, needs.asi.choose)) : [],
  };

  // a background that raises the class's main scores (2024), else any
  const bgs = [...data.backgrounds].sort((a, b) => backgroundFit(rules, cls, b).score - backgroundFit(rules, cls, a).score);
  const top = bgs.filter((b) => backgroundFit(rules, cls, b).score === backgroundFit(rules, cls, bgs[0]).score);
  const keptBg = same("background") && (keep.background === "Other" || data.backgrounds.some((b) => b.name === keep.background));
  const bgName = keptBg ? keep.background : pick(r, top).name;
  const bgData = data.backgrounds.find((b) => b.name === bgName);
  const mine = order.filter((a) => bgData?.abilities?.includes(a));
  d = { ...d, background: bgName, bgAsi: keptBg ? keep.bgAsi : rules === "2024" && mine.length >= 2 ? { mode: "2-1", plus2: mine[0], plus1: mine[1] } : { mode: "1-1-1" } };
  const langs = data.languages.filter((l) => l !== "Common" && !(speciesOf(d, data)?.languages ?? "").includes(l));
  const keptLangs = kp ? keep.languages.filter((l) => langs.includes(l)) : [];
  d.languages = [...keptLangs, ...some(r, langs.filter((l) => !keptLangs.includes(l)), Math.max(0, languageCount(d, data) - keptLangs.length))];

  // origin feats that ask for picks (Magic Initiate, Skilled)
  const feats: Record<string, FeatChoice> = {};
  for (const f of featKeys(d, data)) {
    const old = kp && keptBg ? keep.feats[f.key] : undefined;
    if (f.name === "Magic Initiate") {
      const list = f.list ?? old?.list ?? pick(r, MAGIC_LISTS);
      feats[f.key] = {
        list, cantrips: old?.cantrips?.length === 2 ? old.cantrips : some(r, spellsOf(levelData, spells, list, 0), 2),
        spell: old?.spell ?? pick(r, spellsOf(levelData, spells, list, 1)), ability: old?.ability ?? ((list === "Wizard" ? "INT" : "WIS") as Ability),
      };
    }
    if (f.name === "Skilled") feats[f.key] = old?.skills?.length === 3 ? old : { skills: some(r, ALL_SKILLS.filter((x) => !givenSkills({ ...d, feats }, data).has(x)), 3) };
  }
  d.feats = feats;

  // class skills, starting gear, a name
  const cb = data.classes[cls];
  const given = givenSkills(d, data);
  const open = (cb.skills?.from ?? []).filter((x) => !given.has(x));
  const keptSkills = kp && keep.cls === cls ? keep.classSkills.filter((x) => open.includes(x)) : [];
  d.classSkills = [...keptSkills, ...some(r, open.filter((x) => !keptSkills.includes(x)), Math.max(0, Math.min(cb.skills?.choose ?? 0, open.length) - keptSkills.length))];
  d.kit = kp && keep.cls === cls && !kitFrom(cb.equipment, keep.kit, data.categories).missing.length ? keep.kit : kits(r, cb.equipment, data);
  d.bgKit = kp && keptBg && !kitFrom(bgData?.equipment ?? [], keep.bgKit, data.categories).missing.length ? keep.bgKit : kits(r, bgData?.equipment ?? [], data);
  d.details = { ...d.details, name: d.details.name.trim() || `${pick(r, NAMES_FIRST)} ${pick(r, NAMES_LAST)}`, alignment: d.details.alignment || pick(r, ALIGNMENTS.slice(0, 6)) };

  // level 1, then every level up to the start level, from "Pick for me" (picks already made stay)
  const first = planLevelUp(baseCharacter(d, data), cls, levelData, spells, { first: true });
  d.level = recommend(first, kp ? cleanFor(first, d.level) : { picks: {}, hp: "average" }, baseCharacter(d, data), levelData);
  d.ups = resizeSteps(kp ? d.ups ?? [] : [], Math.max(0, d.targetLevel - 1), cls);
  if (d.ups.length) {
    const bp = planBuild(d, data, levelData, spells, opts);
    d.ups = recommendSteps(bp.steps[0].before, d.ups, levelData, spells, opts, (p, a, c) => recommend(p, a, c, levelData));
  }
  return d;
}
