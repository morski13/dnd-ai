import { describe, expect, it } from "vitest";
import { reactionHints } from "./reactions";
import type { Option } from "./rules";

const o = (name: string, kind: Option["kind"], extra: Partial<Option> = {}) => ({ key: `k:${name}`, name, kind, ...extra }) as Option;
describe("reactions off your turn", () => {
  it("Shield says when it turns the hit into a miss; Uncanny Dodge and Opportunity Attack show up", () => {
    const opts = [o("Shield", "boost"), o("Rapier", "weapon")];
    const h = reactionHints(opts, ["Uncanny Dodge"], { kind: "attack", total: 17, hit: true, ac: 15, by: "Ogre" });
    expect(h.map((x) => x.name)).toEqual(["Shield", "Uncanny Dodge", "Opportunity Attack"]);
    expect(h[0].why).toMatch(/17 would miss you \(AC 20\)/);
    expect(reactionHints(opts, [], { kind: "attack", total: 25, hit: true, ac: 15, by: "Ogre" })[0].why).toMatch(/until your next turn/);
    expect(reactionHints(opts, [], { kind: "attack", total: 9, hit: true, ac: 15, by: "Ogre" }, true)).toEqual([]);
  });
});
