import { describe, expect, it } from "vitest";
import spellsJson from "../test-fixtures/spells-lite.json";
import l14 from "../levelup/data-2014.json";
import l24 from "../levelup/data-2024.json";
import { activeChoices, type LevelChar } from "../levelup/engine";
import { classOptions, mcMissing, planSteps, resizeSteps, type LevelStep } from "../levelup/multi";
import type { Answers, RulesData, SpellLite } from "../levelup/types";
import b14 from "./data-2014.json";
import b24 from "./data-2024.json";
import { blankDraft, suggestedArray } from "./engine";
import { backgroundFit, bestSub, rankSpecies, speciesFit } from "./fit";
import { buildAll, planBuild } from "./levels";
import { CLASS_ORDER } from "./special";
import type { BuilderData, Draft } from "./types";

const B14 = b14 as unknown as BuilderData, B24 = b24 as unknown as BuilderData;
const L14 = l14 as unknown as RulesData, L24 = l24 as unknown as RulesData;
const SPELLS = spellsJson as SpellLite[];
const featText = (n: string) => `${n} rules text.`;
const sp = (data: BuilderData, n: string) => data.species.find((s) => s.name === n)!;

/** Fill every open choice of a level with the first options (ASI: +2 to the class's main score). */
function fillAll(r: ReturnType<typeof planSteps>[number], main = "STR"): Answers {
  const a: Answers = { picks: { ...r.answers.picks }, asi: { ...(r.answers.asi ?? {}) }, hp: "average" };
  for (const c of activeChoices(r.plan!, a)) {
    if (c.optional) continue;
    if (c.kind === "asi") { a.asi![c.key] = c.boon ? { mode: "feat", feat: c.options[0].name } : { mode: "plus2", a: main as "STR" }; continue; }
    if (!(a.picks[c.key]?.length)) a.picks[c.key] = c.options.slice(0, c.choose).map((o) => o.name);
  }
  return a;
}
/** Fill the levels one by one (each level's options depend on the levels before). */
function fillSteps(start: LevelChar, steps: LevelStep[], data: RulesData, main?: string): LevelStep[] {
  let s = steps;
  for (let i = 0; i < s.length; i++) {
    const r = planSteps(start, s, data, SPELLS, { multiclass: true })[i];
    s = s.map((x, j) => (j === i ? { ...x, answers: fillAll(r, main) } : x));
  }
  return s;
}

const fighter = (): Draft => ({
  ...blankDraft("2024"), cls: "Fighter", species: "Human", speciesPicks: { skills: ["Perception"], feat: "Alert", cantrip: null, ability: null, asi: [] },
  background: "Soldier", bgAsi: { mode: "2-1", plus2: "STR", plus1: "CON" }, languages: ["Dwarvish", "Orc"],
  method: "manual", base: { ...suggestedArray(CLASS_ORDER.Fighter), INT: 13, WIS: 8 }, classSkills: ["Acrobatics", "Survival"],
  kit: [{ option: 0, picks: [] }], bgKit: [{ option: 0, picks: [["srd:2024:dice"]] }],
  level: { picks: { "mastery-1": ["Greatsword", "Longbow", "Javelin"], "style-1": ["Great Weapon Fighting"] }, hp: "average" },
  details: { ...blankDraft("2024").details, name: "Bren" },
});

describe("species and background fit", () => {
  it("2014: bonuses to the class's main scores come first", () => {
    const wiz = rankSpecies("2014", "Wizard", B14.species).map((r) => r.sp.name);
    expect(wiz.slice(0, 2)).toEqual(["Gnome", "Elf"]);
    expect(speciesFit("2014", "Wizard", sp(B14, "Half-Orc")).tier).toBe("weak");
    expect(speciesFit("2014", "Barbarian", sp(B14, "Half-Orc")).tier).toBe("great");
    expect(speciesFit("2014", "Paladin", sp(B14, "Dragonborn")).reasons.join(" ")).toMatch(/STR \+2, CHA \+1/);
    // Half-Elf's free +1s go to the class's best scores
    expect(speciesFit("2014", "Sorcerer", sp(B14, "Half-Elf")).tier).toBe("great");
  });

  it("2024: traits decide, nothing is called weak, and the lineage is suggested", () => {
    const rogue = rankSpecies("2024", "Rogue", B24.species);
    expect(rogue[0].sp.name).toBe("Halfling");
    expect(rogue.some((r) => r.fit.tier === "weak")).toBe(false);
    expect(bestSub(sp(B24, "Elf"), "Wizard")).toBe("High Elf");
    expect(bestSub(sp(B24, "Elf"), "Ranger")).toBe("Wood Elf");
    expect(bestSub(sp(B24, "Human"), "Wizard")).toBeNull();
    const sage = B24.backgrounds.find((b) => b.name === "Sage")!, soldier = B24.backgrounds.find((b) => b.name === "Soldier")!;
    expect(backgroundFit("2024", "Wizard", sage).tier).toBe("great");
    expect(backgroundFit("2024", "Wizard", soldier).tier).toBe("weak");
    expect(backgroundFit("2014", "Wizard", sage).tier).toBeNull();
  });
});

describe("several levels at once", () => {
  it("plans every level while choices are still open, and multiclassing follows the scores", () => {
    const d = { ...fighter(), targetLevel: 5, ups: resizeSteps([], 4, "Fighter") };
    const bp = planBuild(d, B24, L24, SPELLS, { multiclass: true, featText });
    expect(bp.firstMissing).toEqual([]);
    expect(bp.steps.map((r) => `${r.cls} ${r.plan?.toLevel}`)).toEqual(["Fighter 2", "Fighter 3", "Fighter 4", "Fighter 5"]);
    expect(bp.steps[1].missing.map((m) => m.text)).toContain("Pick your subclass.");
    expect(bp.steps[2].missing.some((m) => /Ability Score Improvement/.test(m.text))).toBe(true);
    // STR 17, INT 13: a Wizard level is allowed; a Cleric (WIS 8) isn't
    const opts = bp.steps[0].options;
    expect(opts.find((o) => o.name === "Wizard")?.ok).toBe(true);
    expect(opts.find((o) => o.name === "Cleric")).toMatchObject({ ok: false });
    expect(opts.find((o) => o.name === "Cleric")!.why).toMatch(/WIS 13 \(you have WIS 8\)/);
    expect(classOptions(bp.steps[0].before, L24, false).find((o) => o.name === "Wizard")?.why).toMatch(/turned multiclassing off/);
  });

  it("an ASI at level 4 opens a class the scores didn't allow before", () => {
    const d = { ...fighter(), base: { ...fighter().base, CHA: 11 }, targetLevel: 6, ups: resizeSteps([], 5, "Fighter") };
    let bp = planBuild(d, B24, L24, SPELLS, { multiclass: true, featText });
    expect(bp.steps[0].options.find((o) => o.name === "Paladin")?.ok).toBe(false); // CHA 11
    const start = bp.steps[0].before;
    let ups = fillSteps(start, d.ups.slice(0, 3), L24);
    ups[2] = { ...ups[2], answers: { ...ups[2].answers, asi: { "asi-4": { mode: "split", a: "STR", b: "CHA" } } } }; // CHA 12
    ups = [...ups, { cls: "Fighter", answers: { picks: {}, hp: "average" } }, { cls: "Paladin", answers: { picks: {}, hp: "average" } }];
    bp = planBuild({ ...d, ups }, B24, L24, SPELLS, { multiclass: true, featText });
    expect(bp.steps[4].classProblem).toMatch(/CHA 13 \(you have CHA 12\)/);
    ups[3] = { cls: "Fighter", answers: {} as Answers };
    ups[2] = { ...ups[2], answers: { ...ups[2].answers, asi: { "asi-4": { mode: "plus2", a: "CHA" } } } }; // CHA 13
    bp = planBuild({ ...d, ups }, B24, L24, SPELLS, { multiclass: true, featText });
    expect(bp.steps[4].classProblem).toBeNull();
    expect(bp.steps[4].plan?.isNew).toBe(true);
  });

  it("saves a level 5 Fighter with every level in the history; a missing choice stops it", () => {
    const d0 = { ...fighter(), targetLevel: 5, ups: resizeSteps([], 4, "Fighter") };
    const start = planBuild(d0, B24, L24, SPELLS, { multiclass: true, featText }).steps[0].before;
    const d = { ...d0, ups: fillSteps(start, d0.ups, L24) };
    const out = buildAll(d, B24, L24, SPELLS, { multiclass: true, featText, rollHp: () => null, now: "2026-11-02T00:00:00Z" });
    expect(out.row.class_levels).toEqual([{ class: "Fighter", level: 5, subclass: "Champion" }]);
    expect(out.row.ability_scores).toMatchObject({ STR: 19 }); // 17 + 2 at level 4
    expect(out.row.hp_max).toBe(12 + 4 * (6 + 2)); // d10 + CON 2, then 6 + 2 a level
    expect(out.row.hp_current).toBe(out.row.hp_max);
    expect(out.log.map((e) => `${e.className} ${e.level}`)).toEqual(["Fighter 2", "Fighter 3", "Fighter 4", "Fighter 5"]);
    expect((out.log[0].before.class_levels as { level: number }[])[0].level).toBe(1);
    const names = (out.row.features as { name: string }[]).map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["Action Surge", "Improved Critical", "Extra Attack", "Alert", "Resourceful"]));
    const bad = { ...d, ups: d.ups.map((u, i) => (i === 1 ? { ...u, answers: { picks: {}, hp: "average" as const } } : u)) };
    expect(() => buildAll(bad, B24, L24, SPELLS, { multiclass: true, featText, rollHp: () => null })).toThrow(/Level 3 \(Fighter\): Pick your subclass/);
    // rolled hit points
    const rolled = buildAll(d, B24, L24, SPELLS, { multiclass: true, featText, rollHp: (die) => die });
    expect(rolled.row.hp_max).toBe(12 + 4 * (10 + 2));
  });

  it("2014 Wizard 3: multiclassing follows the 2014 scores, spells at each level skip ones already known", () => {
    const d0: Draft = {
      ...blankDraft("2014"), cls: "Wizard", species: "Gnome", background: "Acolyte", languages: ["Draconic", "Celestial"], method: "standard",
      base: suggestedArray(CLASS_ORDER.Wizard), classSkills: ["Arcana", "History"],
      kit: [{ option: 0, picks: [] }, { option: 1, picks: [["srd:2014:wand"]] }, { option: 0, picks: [] }], bgKit: [{ option: 0, picks: [["srd:2014:amulet"]] }],
      details: { ...blankDraft("2014").details, name: "Pip" }, targetLevel: 3, ups: resizeSteps([], 2, "Wizard"),
    };
    let bp = planBuild(d0, B14, L14, SPELLS, { multiclass: true, featText });
    const first = bp.first;
    const lvl1: Answers = { picks: {}, hp: "average" };
    for (const c of first.choices) lvl1.picks[c.key] = c.options.slice(0, c.choose).map((o) => o.name);
    const d1 = { ...d0, level: lvl1 };
    bp = planBuild(d1, B14, L14, SPELLS, { multiclass: true, featText });
    expect(bp.steps[0].options.find((o) => o.name === "Fighter")?.ok).toBe(true); // DEX 13 meets "STR 13 or DEX 13"
    expect(bp.steps[0].options.find((o) => o.name === "Paladin")?.ok).toBe(false); // STR 8
    const known = new Set(lvl1.picks.spells);
    const lvl2 = bp.steps[0].plan!.choices.find((c) => c.kind === "spells")!;
    expect(lvl2.options.some((o) => known.has(o.name))).toBe(false);
    const ups = fillSteps(bp.steps[0].before, d1.ups, L14, "INT");
    const out = buildAll({ ...d1, ups }, B14, L14, SPELLS, { multiclass: true, featText, rollHp: () => null });
    expect(out.row.class_levels).toEqual([{ class: "Wizard", level: 3, subclass: expect.any(String) }]);
    expect(((out.row.spells as { slots: Record<string, number> }).slots)).toMatchObject({ 1: 4, 2: 2 });
  });

  it("mcMissing names the scores you'd need", () => {
    const c = { class_levels: [{ class: "Fighter", level: 3 }], ability_scores: { STR: 16, INT: 9 } } as unknown as LevelChar;
    expect(mcMissing(c, "Wizard", L24)).toEqual(["INT 13 (you have INT 9)"]);
  });
});

describe("pick for me, and multiclass proficiencies", () => {
  it("fills every level of a level 8 Wizard with sensible picks; the save goes through", async () => {
    const { recommend } = await import("../levelup/recommend");
    const { recommendSteps } = await import("../levelup/multi");
    const d0: Draft = {
      ...blankDraft("2024"), cls: "Wizard", species: "Gnome", sub: "Gnomish Lineage: Rock Gnome", speciesPicks: { skills: [], feat: null, cantrip: null, ability: "INT", asi: [] },
      background: "Sage", bgAsi: { mode: "2-1", plus2: "INT", plus1: "CON" }, languages: ["Draconic", "Elvish"], method: "standard",
      base: suggestedArray(CLASS_ORDER.Wizard), classSkills: ["Investigation", "Medicine"], kit: [{ option: 0, picks: [] }], bgKit: [{ option: 0, picks: [] }],
      feats: { "Magic Initiate": { list: "Wizard", cantrips: ["Light", "Message"], spell: "Sleep", ability: "INT" } }, details: { ...blankDraft("2024").details, name: "Pip" },
      targetLevel: 8, ups: resizeSteps([], 7, "Wizard"),
    };
    let bp = planBuild(d0, B24, L24, SPELLS, { multiclass: true, featText });
    const level = recommend(bp.first, d0.level, bp.steps[0].before, L24);
    expect(level.picks.cantrips).toContain("Fire Bolt");
    bp = planBuild({ ...d0, level }, B24, L24, SPELLS, { multiclass: true, featText });
    const ups = recommendSteps(bp.steps[0].before, d0.ups, L24, SPELLS, { multiclass: true }, (p, a, c) => recommend(p, a, c, L24));
    bp = planBuild({ ...d0, level, ups }, B24, L24, SPELLS, { multiclass: true, featText });
    expect(bp.steps.flatMap((r) => r.missing)).toEqual([]);
    expect(bp.steps[2].answers.asi?.["asi-4"]).toEqual({ mode: "plus2", a: "INT" }); // INT 17 → 19
    expect(bp.steps[6].answers.asi?.["asi-8"]).toEqual({ mode: "split", a: "INT", b: "CON" }); // 19 → 20
    expect(bp.final.spells.known).toEqual(expect.arrayContaining(["Fireball", "Counterspell", "Misty Step", "Shield"]));
    expect(bp.final.ability_scores.INT).toBe(20);
    const out = buildAll({ ...d0, level, ups }, B24, L24, SPELLS, { multiclass: true, featText, rollHp: () => null });
    expect(out.row.class_levels).toEqual([{ class: "Wizard", level: 8, subclass: expect.any(String) }]);
  });

  it("an ASI that would pass 20 goes to the next score", async () => {
    const { recommend } = await import("../levelup/recommend");
    const c = { class_levels: [{ class: "Fighter", level: 3 }], ability_scores: { STR: 20, CON: 16, DEX: 12 }, proficiencies: {}, features: [], spells: {}, resources: [], hp_max: 30, hp_current: 30 } as unknown as LevelChar;
    const plan = (await import("../levelup/engine")).planLevelUp(c, "Fighter", L24, SPELLS);
    expect(recommend(plan, { picks: {}, hp: "average" }, c, L24).asi?.["asi-4"]).toEqual({ mode: "plus2", a: "CON" });
  });

  it("a Wizard who takes a Fighter level gets armor training, and the AC uses it", () => {
    const c = { class_levels: [{ class: "Wizard", level: 3 }], ability_scores: { STR: 13, DEX: 14, INT: 17 }, proficiencies: { skills: [] }, features: [], spells: { known: [] }, resources: [], hp_max: 16, hp_current: 16 } as unknown as LevelChar;
    const [r] = planSteps(c, [{ cls: "Fighter", answers: { picks: { "style-1": ["Defense"], "mastery-1": ["Longsword", "Shortbow", "Dagger"] }, hp: "average" } }], L24, SPELLS, { multiclass: true });
    expect(r.missing).toEqual([]);
    const prof = (r.after.features as { name: string; source: string; description: string }[]).find((f) => f.name === "Proficiencies");
    expect(prof).toMatchObject({ source: "Fighter (multiclass)", description: "Light Armor, Medium Armor, Shields, Martial Weapons" });
  });
});

describe("random character", () => {
  it("makes a whole character that saves, for many seeds and both rule sets, at levels 1, 7, 12 and 20", async () => {
    const { randomDraft } = await import("./random");
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const [B, L] of [[B24, L24], [B14, L14]] as const) {
      for (let i = 0; i < 60; i++) {
        const keep = { ...blankDraft(B.rules), targetLevel: [1, 7, 12, 20][i % 4] };
        const d = randomDraft(keep, B, L, SPELLS, { multiclass: true, featText, keepClass: false, rand });
        let out;
        try { out = buildAll(d, B, L, SPELLS, { multiclass: true, featText, rollHp: () => null }); }
        catch (e) { throw new Error(`${B.rules} ${d.cls} ${d.species} ${d.background} level ${d.targetLevel}: ${(e as Error).message}`); }
        expect(out.row.name).toBeTruthy();
        expect((out.row.class_levels as { level: number }[])[0].level).toBe(d.targetLevel);
      }
    }
  });
});

describe("pick everything for me", () => {
  it("keeps what the player chose and fills the rest", async () => {
    const { randomDraft } = await import("./random");
    const keep: Draft = { ...blankDraft("2024"), cls: "Fighter", species: "Dwarf", targetLevel: 4, ups: resizeSteps([], 3, "Fighter"),
      classSkills: ["Perception"], details: { ...blankDraft("2024").details, name: "Thora" } };
    const d = randomDraft(keep, B24, L24, SPELLS, { multiclass: true, featText, keepClass: true, keepPicks: true });
    expect([d.cls, d.species, d.details.name]).toEqual(["Fighter", "Dwarf", "Thora"]);
    expect(d.classSkills[0]).toBe("Perception");
    expect(() => buildAll(d, B24, L24, SPELLS, { multiclass: true, featText, rollHp: () => null })).not.toThrow();
  });
});
