import { describe, expect, it } from "vitest";
import { diceToThrow, labelText, makeShape, readValue, type DieType } from "./shapes";
import { simulateThrow } from "./sim";

const TYPES: [DieType, number, number][] = [["d4", 4, 3], ["d6", 6, 4], ["d8", 8, 3], ["d10", 10, 4], ["d12", 12, 5], ["d20", 20, 3], ["d100", 10, 4]];

describe("shapes", () => {
  for (const [type, faces, corners] of TYPES) {
    it(`${type}: ${faces} faces with ${corners} corners each, every number once`, () => {
      const s = makeShape(type);
      expect(s.faces).toHaveLength(type === "d4" ? 4 : faces);
      for (const f of s.faces) expect(f.verts).toHaveLength(corners);
      const want = type === "d4" ? 4 : faces;
      expect([...s.labels].sort((a, b) => a - b)).toEqual(Array.from({ length: want }, (_, i) => i + 1));
    });
  }
  it("opposite faces add up like real dice", () => {
    const d20 = makeShape("d20");
    for (let i = 0; i < 20; i++) {
      const opp = d20.faces.findIndex((f) => f.normal.every((x, k) => Math.abs(x + d20.faces[i].normal[k]) < 1e-6));
      expect(d20.labels[i] + d20.labels[opp]).toBe(21);
    }
  });
  it("labels", () => {
    expect(labelText("d100", 10)).toBe("00");
    expect(labelText("d100", 4)).toBe("40");
    expect(labelText("d10", 10)).toBe("0");
    expect(labelText("d20", 20)).toBe("20");
  });
});

describe("from a roll to dice", () => {
  it("advantage: both d20s, the lower one dropped", () => {
    expect(diceToThrow("2d20kh1+5", [7, 16], [16])).toEqual([
      { type: "d20", value: 7, dropped: true, group: 0 },
      { type: "d20", value: 16, dropped: false, group: 0 },
    ]);
  });
  it("several groups", () => {
    expect(diceToThrow("1d6+2d6+3", [5, 6, 2], [5, 6, 2]).map((d) => d.value)).toEqual([5, 6, 2]);
  });
  it("d100 becomes a tens die and a ones die", () => {
    expect(diceToThrow("1d100", [47], [47]).map((d) => [d.type, d.value])).toEqual([["d100", 4], ["d10", 7]]);
    expect(diceToThrow("1d100", [100], [100]).map((d) => [d.type, d.value])).toEqual([["d100", 10], ["d10", 10]]);
    expect(diceToThrow("1d100", [9], [9]).map((d) => [d.type, d.value])).toEqual([["d100", 10], ["d10", 9]]);
  });
  it("odd dice (d3) are skipped, big piles capped", () => {
    expect(diceToThrow("1d3+1d6", [2, 4], [2, 4])).toHaveLength(1);
    expect(diceToThrow("30d6", Array(30).fill(3), Array(30).fill(3))).toHaveLength(14);
  });
});

describe("physics throw always lands on the real number", () => {
  const tray = { halfW: 5, halfD: 7 };
  for (const [type] of TYPES) {
    it(`${type}: every value, many throws`, () => {
      const max = type === "d100" ? 10 : Number(type.slice(1));
      for (let v = 1; v <= max; v++) {
        const r = simulateThrow([{ type, value: v }, { type, value: max + 1 - v }], tray, v * 7919 + max);
        const last = r.frames[r.frames.length - 1];
        expect(readValue(r.shapes[0], last[0].q)).toBe(v);
        expect(readValue(r.shapes[1], last[1].q)).toBe(max + 1 - v);
        expect(r.frames.length).toBeLessThanOrEqual(240);
      }
    });
  }
  it("a fireball (8d6) stays in the tray and settles", () => {
    const r = simulateThrow(Array.from({ length: 8 }, (_, i) => ({ type: "d6" as const, value: (i % 6) + 1 })), tray, 42);
    const last = r.frames[r.frames.length - 1];
    for (const d of last) {
      expect(Math.abs(d.p[0])).toBeLessThan(tray.halfW);
      expect(Math.abs(d.p[2])).toBeLessThan(tray.halfD);
      expect(d.p[1]).toBeGreaterThan(0);
      expect(d.p[1]).toBeLessThan(2);
    }
    expect(r.settledAt).toBeLessThan(240);
    expect(r.hits.length).toBeGreaterThan(5);
  });
});
