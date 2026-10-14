import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectGrid, fitDetected, fitStretch, fitTrim, imagePlacement } from "./grid";

describe("fitting a grid on a map picture", () => {
  it("trim: whole squares only, the leftover strip is cut", () => {
    const f = fitTrim(1414, 2000, 10);
    expect(f.cols).toBe(10);
    expect(f.rows).toBe(14);            // 2000 / 141.4 = 14.1 → 14 whole rows
    expect(f.crop.h).toBeCloseTo(14 * 141.4);
  });
  it("trim with an offset lines up with painted lines and drops the partial top row", () => {
    const f = fitTrim(1414, 2000, 10, 0, 52);
    expect(f.crop.y).toBe(52);
    expect(f.rows).toBe(13);            // (2000 − 52) / 141.4 = 13.8
  });
  it("stretch: the whole picture, whole squares", () => {
    const f = fitStretch(1414, 2000, 10);
    expect(f).toMatchObject({ cols: 10, rows: 14, stretch: true, crop: { x: 0, y: 0, w: 1414, h: 2000 } });
  });
  it("places the picture so the crop lands on the grid", () => {
    const p = imagePlacement(fitTrim(1000, 1000, 10, 0, 50), 1000, 1000);
    expect(p.y).toBeCloseTo(-0.5);
    expect(p.width).toBeCloseTo(10);
  });
  it("finds a painted grid on a synthetic picture", () => {
    const w = 300, h = 400, cell = 30, ox = 7, oy = 19;
    const lum = new Uint8ClampedArray(w * h).fill(170);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (Math.sin(x * 0.7) + Math.cos(y * 0.9)) * 20;           // some texture
      lum[y * w + x] = (x - ox) % cell === 0 || (y - oy) % cell === 0 ? 40 : 170 + n;
    }
    const g = detectGrid(lum, w, h)!;
    expect(g.cell).toBeCloseTo(cell, 0);
    expect(Math.abs((g.ox % cell) - ox)).toBeLessThanOrEqual(2);
    expect(Math.abs((g.oy % cell) - oy)).toBeLessThanOrEqual(2);
  });
  it("finds the grid on a real forest map (the one from the user)", () => {
    const lum = new Uint8ClampedArray(readFileSync(new URL("../test-fixtures/forest-map-400.gray", import.meta.url)));
    const w = 400, h = lum.length / 400;
    const g = detectGrid(lum, w, h)!;
    expect(g).not.toBeNull();
    expect(w / g.cell).toBeGreaterThan(9.5);
    expect(w / g.cell).toBeLessThan(10.5);      // 10 squares across
    // full size: lines across start at ~135 px every ~141 px; down at ~52 px every ~146 px (the picture is a bit stretched)
    const f = fitDetected(1414, 2000, g, 400 / 1414);
    expect(f.cols).toBe(9);                         // whole squares between the painted lines (the partial edges are cut)
    expect(f.crop.x).toBeGreaterThan(125); expect(f.crop.x).toBeLessThan(145);
    expect(f.crop.y).toBeGreaterThan(40); expect(f.crop.y).toBeLessThan(65);
    expect(f.crop.h / f.rows).toBeGreaterThan(140); expect(f.crop.h / f.rows).toBeLessThan(152);

  });
  it("no grid on a plain picture", () => {
    const w = 200, h = 200;
    const lum = new Uint8ClampedArray(w * h).map((_, i) => 120 + ((i * 7919) % 50));
    expect(detectGrid(lum, w, h)).toBeNull();
  });
});
