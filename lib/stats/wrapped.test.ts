import { describe, expect, it } from "vitest";
import type { ActorStats } from "./compute";
import { wrappedSlides } from "./wrapped";

const a = (name: string, p: Partial<ActorStats>): ActorStats => ({
  key: name, name, kind: "character", rolls: 20, d20Count: 12, d20Sum: 0, d20Avg: 10, nat20: 0, nat1: 0, attacks: 0, hits: 0, misses: 0, hitRate: null, crits: 0,
  attackD20Avg: null, damageDealt: 0, biggestHit: null, damageTaken: 0, resisted: 0, healingDone: 0, healingReceived: 0, kills: 0, timesDropped: 0,
  savesMade: 0, savesFailed: 0, checksMade: 0, checksFailed: 0, failedChecks: [], slotsUsed: 0, spellsCast: 0, spells: {}, attacksUsed: {}, mostUsedAttack: null, mostUsedSpell: null, ...p,
});

describe("Campaign Wrapped", () => {
  it("one slide per highlight, from what everyone can see", () => {
    const s = wrappedSlides([
      a("Kazar", { damageDealt: 300, attacksUsed: { Greataxe: 40 }, d20Avg: 12.4, nat20: 5, biggestHit: { amount: 38, source: "Greataxe" }, timesDropped: 2 }),
      a("Lyra", { damageDealt: 80, spells: { "Healing Word": 12 }, d20Avg: 8.1, healingDone: 140, nat20: 1 }),
    ], [a("Ogre", { kind: "monster", damageDealt: 90, kills: 1 })], 6);
    expect(s.map((x) => x.id)).toEqual(["damage", "attack", "spell", "lucky", "unlucky", "close", "hit", "heal", "nat20", "monster"]);
    expect(s[0]).toMatchObject({ big: "380", kicker: "6 sessions · 40 rolls" });
    expect(s.find((x) => x.id === "unlucky")).toMatchObject({ title: "Lyra", big: "8.1" });
    expect(wrappedSlides([], [], 0)).toEqual([]);
  });
});
