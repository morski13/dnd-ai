import { describe, expect, it } from "vitest";
import { terrainOf } from "./space";
import { characterSenses, lightMap, NO_SENSES, seesBody, seesSquare, sensesFromText, visibleSquares } from "./vision";

const b = (id: string, x: number, y: number, size = 1) => ({ id, x, y, size });

describe("senses", () => {
  it("monsters and characters", () => {
    expect(sensesFromText("Darkvision 60 ft.; Blindsight 30 ft.; Passive Perception 10")).toEqual({ darkvision: 60, blindsight: 30, truesight: 0 });
    expect(characterSenses({ species: "Drow" }).darkvision).toBe(120);
    expect(characterSenses({ species: "Human" }).darkvision).toBe(0);
    expect(characterSenses({ species: "Human", features: [{ name: "Darkvision (60 ft.)" }] }).darkvision).toBe(60);
    expect(characterSenses({ species: "Leonin" }).darkvision).toBe(0);
  });
});

describe("light and sight", () => {
  it("a torch lights a dark dungeon: 20 ft bright, 20 more dim, not through walls", () => {
    const t = terrainOf({ v: 2, light: "dark", cells: { "5,5": { k: "torch" }, "8,5": { k: "wall" } } });
    const l = lightMap(t, 15, 15);
    expect(l.get("5,5")).toBe("bright");
    expect(l.get("7,5")).toBe("bright");
    expect(l.get("5,0")).toBe("dim");    // 25 ft away
    expect(l.get("14,14")).toBe("dark");  // 45 ft: past the dim light
    expect(l.get("9,5")).toBe("dark");   // behind the wall at 8,5
  });
  it("walls block sight; darkness needs darkvision", () => {
    const dark = terrainOf({ v: 2, light: "dark", cells: {} });
    const l = lightMap(dark, 10, 10);
    expect(seesSquare(b("me", 0, 0), NO_SENSES, 4, 0, dark, l)).toBe(false);
    expect(seesSquare(b("me", 0, 0), { ...NO_SENSES, darkvision: 60 }, 4, 0, dark, l)).toBe(true);
    expect(seesSquare(b("me", 0, 0), { ...NO_SENSES, darkvision: 10 }, 4, 0, dark, l)).toBe(false);
    const walled = terrainOf({ v: 2, cells: { "2,0": { k: "wall" }, "2,1": { k: "wall" } } });
    expect(seesSquare(b("me", 0, 0), NO_SENSES, 4, 0, walled, lightMap(walled, 10, 10))).toBe(false);
  });
  it("smoke hides what's in it and behind it; blindsight still feels it", () => {
    const t = terrainOf({ v: 2, cells: { "2,0": { k: "smoke" } } });
    const l = lightMap(t, 10, 10);
    expect(seesBody(b("me", 0, 0), NO_SENSES, b("ogre", 2, 0), t, l)).toBe(false);
    expect(seesBody(b("me", 0, 0), NO_SENSES, b("ogre", 4, 0), t, l)).toBe(false);
    expect(seesBody(b("me", 0, 0), { ...NO_SENSES, blindsight: 30 }, b("ogre", 2, 0), t, l)).toBe(true);
    expect(seesBody(b("me", 0, 0), NO_SENSES, b("ogre", 4, 3), t, l)).toBe(true);
  });
  it("magical darkness beats darkvision, not truesight; invisible needs blindsight or truesight", () => {
    const t = terrainOf({ v: 2, cells: { "3,0": { k: "darkness" } } });
    const l = lightMap(t, 10, 10);
    expect(seesBody(b("me", 0, 0), { ...NO_SENSES, darkvision: 120 }, b("x", 3, 0), t, l)).toBe(false);
    expect(seesBody(b("me", 0, 0), { ...NO_SENSES, truesight: 60 }, b("x", 3, 0), t, l)).toBe(true);
    const open = terrainOf({});
    expect(seesBody(b("me", 0, 0), NO_SENSES, b("x", 3, 0), open, lightMap(open, 10, 10), true)).toBe(false);
    expect(visibleSquares(b("me", 0, 0), NO_SENSES, open, lightMap(open, 4, 4), 4, 4).size).toBe(16);
  });
});
