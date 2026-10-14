import { describe, expect, it } from "vitest";
import rules from "./rules-2024.json";
import d24 from "../levelup/data-2024.json";
import d14 from "../levelup/data-2014.json";
import type { RulesData } from "../levelup/types";
import { comboChecks, expandQuery, timingOf, type NamedThing } from "./checks";
import { rulesDataDocs, spellDocs, type SpellRow } from "./docs";
import { NOTES_2014 } from "./notes-2014";
import { buildMessages, houseText, parseReply, sheetText } from "./prompt";
import { buildIndex, pick, search, words, type KDoc } from "./search";
import { STYLES, styleOf } from "./styles";

const sp = (name: string, level: number, casting_time: string, concentration = false, description = "…"): SpellRow =>
  ({ name, level, school: "Evocation", classes: ["Wizard"], casting_time, ritual: false, range: "Self", components: "V", duration: "Instantaneous", concentration, description, higher_levels: null });
const SPELLS = [
  sp("Misty Step", 2, "Bonus Action", false, "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see."),
  sp("Fireball", 3, "Action", false, "A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius Sphere makes a Dexterity saving throw."),
  sp("Shield", 1, "Reaction, which you take when you are hit by an attack roll or targeted by the Magic Missile spell", false, "An imperceptible barrier of magical force protects you. Until the start of your next turn, you have a +5 bonus to AC."),
  sp("Shield of Faith", 1, "Bonus Action", true, "A shimmering field surrounds a creature of your choice within range, granting it a +2 bonus to AC for the duration."),
  sp("Bless", 1, "Action", true, "You bless up to three creatures within range. Whenever a target makes an attack roll or a saving throw, it adds 1d4."),
  sp("Hold Person", 2, "Action", true, "Choose a Humanoid that you can see within range. The target must succeed on a Wisdom saving throw or have the Paralyzed condition."),
  sp("Healing Word", 1, "Bonus Action", false, "A creature of your choice that you can see within range regains Hit Points equal to 2d4 plus your spellcasting ability modifier."),
];
const RULES: KDoc[] = (rules as { pieces: { id: string; title: string; text: string }[] }).pieces.map((p) => ({ id: p.id, kind: "rule", title: p.title, text: p.text }));
const ix = buildIndex([...RULES, ...spellDocs(SPELLS), ...rulesDataDocs(d24 as unknown as RulesData)]);
const titles = (q: string, n = 5) => search(ix, q, { limit: n }).map((h) => h.doc.title);

describe("knowledge finder", () => {
  it("the SRD rules were extracted", () => {
    expect(RULES.length).toBeGreaterThan(200);
    const t = RULES.map((r) => r.title).join("\n");
    for (const x of ["Bonus Actions", "Opportunity Attacks", "Grappled [Condition]", "Weapon Properties", "Gaining and Casting Spells", "Multiclassing"]) expect(t).toContain(x);
  });
  it("named spells come first, and the rule about the asked thing is found", () => {
    const q = "Can I cast Misty Step and Fireball in the same turn?";
    expect(titles(q, 2).sort()).toEqual(["Spell: Fireball", "Spell: Misty Step"]);
    const all = pick(search(ix, expandQuery(q, [thing("Misty Step"), thing("Fireball")]), { limit: 12 }));
    expect(all.some((p) => /Gaining and Casting Spells/.test(p.title))).toBe(true);
  });
  it("finds conditions, opportunity attacks and features by plain questions", () => {
    expect(titles("what happens when I'm grappled?", 3).join()).toMatch(/Grappled/);
    expect(titles("does moving away provoke an opportunity attack", 3).join()).toMatch(/Opportunity Attack/);
    expect(titles("how does cunning action work for my rogue", 3).join()).toMatch(/Cunning Action/);
    expect(titles("can I attack with a dagger in my off hand light weapon bonus action", 6).join()).toMatch(/Weapon Properties|Light/);
  });
  it("a short name inside a longer named thing doesn't count twice", () => {
    const t = titles("Is Shield of Faith concentration?", 4);
    expect(t[0]).toBe("Spell: Shield of Faith");
    expect(t).not.toContain("Spell: Shield");
  });
  it("secret pieces stay out unless allowed, and the budget holds", () => {
    const six = buildIndex([{ id: "a", kind: "lore", title: "NPC: Warrik", text: "Warrik is secretly the Lord of the Seven Seas.", secret: true }, { id: "b", kind: "lore", title: "NPC: Morwen", text: "Morwen runs the abbey." }]);
    expect(search(six, "who is Warrik").map((h) => h.doc.id)).toEqual([]);
    expect(search(six, "who is Warrik", { allowSecret: true })[0].doc.id).toBe("a");
    const p = pick(search(ix, "spell slots concentration bonus action reaction", { limit: 12 }), 3000, 800);
    expect(p.reduce((s, x) => s + x.text.length, 0)).toBeLessThanOrEqual(3000 + 800);
    expect(p.map((x) => x.id)).toEqual(p.map((_, i) => `S${i + 1}`));
  });
  it("words: light stemming and stop words", () => {
    expect(words("Can I attack while grappled?")).toEqual(["attack", "grappl"]);
  });
  it("2014 notes and features from both rule sets", () => {
    const ix14 = buildIndex([...NOTES_2014, ...rulesDataDocs(d14 as unknown as RulesData)]);
    expect(search(ix14, "bonus action spell and another spell 2014")[0].doc.title).toMatch(/Bonus Action spells/);
    expect(search(ix14, "Sneak Attack")[0].doc.title).toMatch(/Rogue 1: Sneak Attack \(2014\)/);
  });
});

const thing = (name: string): NamedThing => {
  const s = SPELLS.find((x) => x.name === name)!;
  return { name, kind: "spell", level: s.level, castingTime: s.casting_time, concentration: s.concentration };
};

describe("app checks", () => {
  it("2024: one spell slot per turn", () => {
    const c = comboChecks([thing("Misty Step"), thing("Fireball")], "2024");
    expect(c.join("\n")).toMatch(/Misty Step is a level 2 spell and takes a Bonus Action/);
    expect(c.join("\n")).toMatch(/only one spell slot/);
  });
  it("2014: bonus action spell → only a cantrip", () => {
    expect(comboChecks([thing("Healing Word"), thing("Fireball")], "2014").join()).toMatch(/only other spell.*cantrip/);
  });
  it("two concentration spells, two bonus actions, two reactions, rage", () => {
    expect(comboChecks([thing("Bless"), thing("Hold Person")], "2024").join()).toMatch(/concentrate on only one/);
    expect(comboChecks([thing("Misty Step"), thing("Healing Word")], "2024").join()).toMatch(/only one Bonus Action/);
    expect(timingOf(thing("Shield"))).toBe("reaction");
    const rage: NamedThing = { name: "Rage", kind: "feature", text: "You can enter it as a Bonus Action if you aren't wearing Heavy armor." };
    const c = comboChecks([rage, thing("Bless")], "2024").join("\n");
    expect(c).toMatch(/Rage uses a Bonus Action/);
    expect(c).toMatch(/can't cast spells or keep Concentration/);
  });
  it("nothing to say → no checks", () => {
    expect(comboChecks([thing("Fireball")], "2024")).toEqual(["Fireball is a level 3 spell and takes an action to cast."]);
    expect(comboChecks([], "2024")).toEqual([]);
  });
});

describe("prompt and reply", () => {
  it("sheet, house rules, style and JSON reply", () => {
    const sheet = sheetText({
      name: "Pip", species: "Halfling", rule_set: "2024", class_levels: [{ class: "Rogue", level: 3, subclass: "Thief" }],
      ability_scores: { STR: 8, DEX: 17, CON: 12, INT: 13, WIS: 10, CHA: 14 }, proficiencies: { saves: ["DEX", "INT"], skills: ["Stealth"], expertise: ["Stealth"] },
      ac: 14, hp_max: 20, hp_current: 12, speed: 25,
      attacks: [{ name: "Shortsword", kind: "weapon", ability: "finesse", damage: "1d6", damage_type: "piercing", add_mod: true }],
      resources: [{ name: "Luck", max: 3, used: 1 }], features: ["Sneak Attack", { name: "Cunning Action" }], conditions: ["Prone"],
    });
    expect(sheet).toContain("Rogue (Thief) 3");
    expect(sheet).toContain("Shortsword +5 to hit, 1d6+3 piercing");
    expect(sheet).toContain("Luck 2/3");
    expect(sheet).toContain("Conditions right now: Prone");
    expect(houseText({ crit: "double_dice", potion_bonus_action: true, flanking: "advantage", other: ["No resurrection magic"], weird: 1 }))
      .toBe("Critical hits: double the damage dice.\nDrinking a potion is a Bonus Action.\nFlanking gives advantage.\nNo resurrection magic");
    const msgs = buildMessages({ style: styleOf("dwarf"), mode: "character", rules: "2024", question: "Can I hide as a bonus action?", sources: [{ id: "S1", kind: "feature", title: "Rogue 2: Cunning Action", text: "…", secret: false }], checks: ["x"], sheet, house: "Flanking gives advantage.", history: [{ role: "user", content: "hi" }, { role: "assistant", content: "Aye." }] });
    expect(msgs[0].content).toMatch(/dwarf/);
    expect(msgs).toHaveLength(4);
    expect(msgs[3].content).toMatch(/CHARACTER SHEET[\s\S]*APP CHECKS[\s\S]*\[S1\] Rogue 2: Cunning Action[\s\S]*QUESTION: Can I hide/);
    expect(parseReply('```json\n{"verdict":"yes","answer":"Aye, lad.","sources":["S1","[S9]","s2"]}\n```', ["S1", "S2"])).toEqual({ verdict: "yes", answer: "Aye, lad.", sources: ["S1", "S2"] });
    expect(parseReply("Just text, no JSON.", [])).toEqual({ verdict: "info", answer: "Just text, no JSON.", sources: [] });
  });
  it("every style has what the prompt needs", () => {
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    for (const s of STYLES) expect(s.how.length).toBeGreaterThan(20);
    expect(styleOf("nonsense").id).toBe("tavern");
  });
});
