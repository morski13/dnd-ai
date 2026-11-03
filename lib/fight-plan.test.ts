import { describe, expect, it } from "vitest";
import { cleanPlan, copyNames, planCount } from "./fight-plan";

describe("copyNames", () => {
  it("one monster keeps its name", () => expect(copyNames("Ogre", 1, [])).toEqual(["Ogre"]));
  it("several are numbered", () => expect(copyNames("Goblin", 3, [])).toEqual(["Goblin 1", "Goblin 2", "Goblin 3"]));
  it("carries on after the ones in the fight", () => {
    expect(copyNames("Goblin", 2, ["Goblin 1", "Goblin 2", "Ogre"])).toEqual(["Goblin 3", "Goblin 4"]);
    expect(copyNames("Ogre", 1, ["Ogre"])).toEqual(["Ogre 2"]);
  });
  it("doesn't mix up similar names", () => expect(copyNames("Goblin", 1, ["Goblin Boss"])).toEqual(["Goblin"]));
});

describe("cleanPlan", () => {
  it("clamps counts and the total", () => {
    const p = cleanPlan({ players: ["a", "a", "b"], dmCharacters: ["n", "a"], picks: [
      { source: "srd", ref: "Goblin", name: "Goblin", count: 99, side: "enemy" },
      { source: "srd", ref: "Ogre", name: "Ogre", count: 30, side: "enemy" },
      { source: "srd", ref: "Wolf", name: "Wolf", count: 2, side: "enemy" },
    ] });
    expect(p.players).toEqual(["a", "b"]);
    expect(p.dmCharacters).toEqual(["n"]);
    expect(p.picks.map((k) => k.count)).toEqual([20, 20]);
  });
  it("drops junk and defaults the side", () => {
    const p = cleanPlan({ players: [], dmCharacters: [], picks: [{ source: "x", ref: "", name: "", count: 1, side: "enemy" } as never, { source: "campaign", ref: "id1", name: "Mira", count: 0, side: "nope" } as never] });
    expect(p.picks).toEqual([{ source: "campaign", ref: "id1", name: "Mira", count: 1, side: "enemy" }]);
  });
  it("counts enemies and allies", () => {
    expect(planCount({ players: ["a"], dmCharacters: ["n"], picks: [{ source: "srd", ref: "Goblin", name: "Goblin", count: 3, side: "enemy" }, { source: "campaign", ref: "x", name: "Mira", count: 1, side: "ally" }] }))
      .toEqual({ enemies: 3, allies: 2, players: 1 });
  });
});
