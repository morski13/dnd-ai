import { describe, expect, test } from "vitest";
import { durationRounds, spellRule, withZones, zoneAtCasterTurn, zoneCells, zoneSpares, zoneTouches, type Zone } from "./spells";
import { effectDice, makeEffect } from "./effects";
import { attackMods, saveMods, speedOf } from "./conditions";
import { terrainOf } from "./space";
import { place } from "../maps/area";

const spell = (name: string, description = "", duration = "Instantaneous", roll: unknown = null) =>
  ({ name, description, duration, roll } as Parameters<typeof spellRule>[0]);

describe("spell rules", () => {
  test("curated spells", () => {
    expect(spellRule(spell("Hold Person"))?.onFail).toEqual({ conditions: ["Paralyzed"], saveEnds: true });
    expect(spellRule(spell("Bless"))?.buff?.bonusDice).toBe("1d4");
    expect(spellRule(spell("Web"))?.noCastDamage).toBe(true);
    expect(spellRule(spell("Spirit Guardians"))?.zone?.follows).toBe(true);
  });
  test("other spells are read from their text", () => {
    const r = spellRule(spell("Scary Thing", "The target must succeed on a Wisdom saving throw or have the Frightened condition for the duration. At the end of each of its turns, the target repeats the save.", "Concentration, up to 1 minute"));
    expect(r?.onFail).toEqual({ conditions: ["Frightened"], saveEnds: true });
    expect(spellRule(spell("Magic Missile", "Three darts hit."))).toBeNull();
  });
  test("durations in rounds", () => {
    expect(durationRounds("Concentration, up to 1 minute")).toBe(10);
    expect(durationRounds("1 round")).toBe(1);
    expect(durationRounds("Concentration, up to 10 minutes")).toBe(100);
    expect(durationRounds("Instantaneous")).toBeNull();
  });
});

describe("what the effects do", () => {
  test("Bless and Bane dice", () => {
    const b = { ...makeEffect({ id: "1", name: "Bless", conditions: ["Blessed"], source: null, duration: "rounds", rounds: 10, turnsOf: "c", target: "t" }), bonusDice: "1d4" };
    const n = { ...makeEffect({ id: "2", name: "Bane", conditions: ["Baned"], source: null, duration: "rounds", rounds: 10, turnsOf: "c", target: "t" }), bonusDice: "-1d4" };
    expect(effectDice([b])).toBe("+1d4");
    expect(effectDice([b, n])).toBe("+1d4-1d4");
  });
  test("Faerie Fire beats Invisible; Blur gives disadvantage", () => {
    const m = attackMods({ name: "A", conds: [] }, { name: "B", conds: ["Invisible", "Outlined"] }, { ranged: true, within5: false, rules: "2024" });
    expect(m.advantage.length).toBe(1);
    expect(m.disadvantage.length).toBe(0);
    expect(attackMods({ name: "A", conds: [] }, { name: "B", conds: ["Blurred"] }, { ranged: false, within5: true, rules: "2024" }).disadvantage.length).toBe(1);
  });
  test("Haste and Slow", () => {
    expect(speedOf(30, ["Hasted"], "2024").speed).toBe(60);
    expect(speedOf(30, ["Slowed"], "2024").speed).toBe(15);
    expect(saveMods({ name: "A", conds: ["Hasted"] }, "DEX", "2024").advantage.length).toBe(1);
    expect(saveMods({ name: "A", conds: ["Slowed"] }, "DEX", "2024").penalty).toBe(-2);
  });
});

const caster = { id: "tc", x: 5, y: 5, size: 1, combatant_id: "c1" };
const zone = (spellName: string, spec: Zone["spec"], aim: { x: number; y: number }, extra: Partial<Zone> = {}): Zone => ({
  id: "z", spell: spellName, casterCombatantId: "c1", casterName: "Cleric", rule: spellRule(spell(spellName))!.zone!,
  spec, placed: place(spec, caster, aim), damage: "3d8", damageType: "radiant", dc: 15, roundsLeft: 10, concentration: true, side: "party", ...extra,
});

describe("lasting spell areas", () => {
  test("Spirit Guardians follows the caster and spares its side", () => {
    const z = zone("Spirit Guardians", { shape: "emanation", size: 15, range: null, pick: "choose" }, { x: 5.5, y: 5.5 });
    expect(zoneTouches(z, caster, { id: "e", x: 8, y: 5, size: 1 })).toBe(true);
    const moved = { ...caster, x: 15 };
    expect(zoneTouches(z, moved, { id: "e", x: 8, y: 5, size: 1 })).toBe(false);
    expect(zoneSpares(z, { combatant_id: "c2", side: "party" })).toBe(true);
    expect(zoneSpares(z, { combatant_id: "c3", side: "enemy" })).toBe(false);
    expect(zoneSpares(z, { combatant_id: "c1", side: "party" })).toBe(true);
  });
  test("Moonbeam hurts its own caster too", () => {
    const z = zone("Moonbeam", { shape: "cylinder", size: 5, range: 120, pick: "all" }, { x: 10, y: 10 });
    expect(zoneSpares(z, { combatant_id: "c1", side: "party" })).toBe(false);
  });
  test("Cloudkill drifts 10 ft away and counts down", () => {
    const z = zone("Cloudkill", { shape: "sphere", size: 20, range: 120, pick: "all" }, { x: 15, y: 5 });
    const next = zoneAtCasterTurn(z, caster)!;
    expect(next.placed).toMatchObject({ shape: "circle", cx: 17, cy: 5 });
    expect(next.roundsLeft).toBe(9);
    expect(zoneAtCasterTurn({ ...z, roundsLeft: 1 }, caster)).toBeNull();
  });
  test("Web is difficult terrain and lightly obscured; Darkness is magical darkness", () => {
    const web = zone("Web", { shape: "cube", size: 20, range: 60, pick: "all" }, { x: 12, y: 12 });
    const t = withZones(terrainOf(null), [web], [caster], 30, 30);
    const cells = zoneCells(web, caster, 30, 30);
    expect(cells.length).toBe(16);
    expect(t.difficult.has(cells[0])).toBe(true);
    expect(t.obscured.has(cells[0])).toBe(true);
    const dark = zone("Darkness", { shape: "sphere", size: 15, range: 60, pick: "all" }, { x: 20, y: 20 });
    const t2 = withZones(terrainOf(null), [dark], [caster], 30, 30);
    expect(t2.magicDark.has("20,20")).toBe(true);
    expect(t2.heavy.has("20,20")).toBe(true);
  });
});
