import { describe, expect, it } from "vitest";
import { fromLog } from "./test-log";
import { buildRecap, facts } from "./recap";

const SPELLS = new Set(["Sacred Flame", "Healing Word", "Shatter", "Fire Bolt", "Magic Missile"]);

describe("session recap (the Ogre at the bridge)", () => {
  const { actors, rolls, effects } = fromLog();
  const r = buildRecap(rolls, effects, actors, [{ id: "e1", name: "Ogre at the bridge", round: 4 }], SPELLS);

  it("totals match the statistics", () => {
    expect(r.party.fights).toBe(1);
    expect(r.party.kills).toBeGreaterThan(0);
    expect(r.party.damage).toBe(r.heroes.reduce((n, h) => n + h.damage, 0));
    expect(r.heroes.length).toBe(actors.filter((a) => a.kind === "character").length);
    expect(r.mvp).toBe(r.heroes[0].name);
    expect(r.minutes).toBeGreaterThanOrEqual(0);
  });

  it("moments are in order, starting with the fight", () => {
    expect(r.moments[0]).toMatchObject({ kind: "fight", text: "Ogre at the bridge begins (4 rounds)." });
    const times = r.moments.map((m) => m.at);
    expect([...times].sort()).toEqual(times);
    expect(r.moments.some((m) => m.kind === "down")).toBe(true);
  });

  it("facts for the AI: only the recap, one line per hero", () => {
    const f = facts(r, { campaign: "The Ashen Crown", session: 3, party: [{ name: "Vex", line: "Halfling Rogue 3" }] });
    expect(f).toMatch(/^Campaign: The Ashen Crown · session 3/);
    expect(f).toMatch(/The party: Vex \(Halfling Rogue 3\)/);
    expect(f).toMatch(/Fight "Ogre at the bridge": 4 round/);
    for (const h of r.heroes) expect(f).toContain(`- ${h.name}: ${h.damage} damage`);
  });

  it("an empty session", () => {
    const e = buildRecap([], [], actors, []);
    expect(e).toMatchObject({ start: null, minutes: 0, mvp: null, moments: [], heroes: [] });
  });
});
