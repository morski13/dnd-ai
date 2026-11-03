import { describe, expect, it } from "vitest";
import { fromLog } from "./test-log";
import { dprOver, fightDpr } from "./dpr";

describe("damage per round", () => {
  const { actors, rolls, effects } = fromLog();
  const fights = fightDpr([{ id: "e1", name: "Ogre at the bridge", round: 3, session_id: "s3" }], rolls, effects, actors);

  it("the Ogre at the bridge: 3 rounds", () => {
    expect(fights).toHaveLength(1);
    const f = fights[0];
    expect(f.rounds).toBe(3);
    expect(f.damage["c:pc3"]).toBe(44);
    expect(f.dpr["c:pc3"]).toBe(14.7);
    expect(f.dpr["c:pc1"]).toBe(8);
    expect(f.partyDamage).toBe(92);
    expect(f.partyDpr).toBe(30.7);
  });
  it("skips fights with no rolls and characters who weren't there", () => {
    const none = fightDpr([{ id: "x", name: null, round: 2, session_id: "s3" }], rolls, effects, actors);
    expect(none).toHaveLength(0);
    const two = fightDpr(
      [{ id: "e1", name: "A", round: 3, session_id: "s3" }, { id: "e2", name: "B", round: 1, session_id: "s4" }],
      [...rolls, { ...rolls.find((r) => r.roll_type === "damage" && r.character_id === "pc3")!, id: "z", combat_id: "e2", round: 1, created_at: "2026-10-04T00:00:00Z" }],
      effects, actors
    );
    expect(two[1].dpr["c:pc3"]).toBeGreaterThan(0);
    expect(two[1].dpr["c:pc1"]).toBeUndefined();
    const over = dprOver(two);
    expect(over["c:pc3"].fights).toBe(2);
    expect(over["c:pc3"].rounds).toBe(4);
    expect(over["c:pc1"].fights).toBe(1);
  });
});
