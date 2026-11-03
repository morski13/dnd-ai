import { describe, expect, it } from "vitest";
import { charactersOnList } from "./character-visibility";

const rows = [
  { id: "kazar", ownerId: "me", playerName: null },
  { id: "lyra", ownerId: "other", playerName: null },          // another player's
  { id: "npc", ownerId: "dm", playerName: null },              // the DM's NPC
  { id: "forMarko", ownerId: null, playerName: "Marko" },      // made by the DM for a player
  { id: "villain", ownerId: null, playerName: null },          // made by the DM, for nobody
];

describe("charactersOnList", () => {
  it("a player sees their own, and ones made for a player to claim", () => {
    const r = charactersOnList(rows, "me", false);
    expect(r.all.map((x) => x.id)).toEqual(["kazar", "forMarko"]);
    expect(r.mine.map((x) => x.id)).toEqual(["kazar"]);
    expect(r.toClaim.map((x) => x.id)).toEqual(["forMarko"]);
  });
  it("the DM sees everyone", () => {
    const r = charactersOnList(rows, "dm", true);
    expect(r.all).toHaveLength(5);
    expect(r.toClaim.map((x) => x.id)).toEqual(["forMarko", "villain"]);
  });
});
