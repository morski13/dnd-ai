import { describe, expect, it } from "vitest";
import { ACCENTS, BACKGROUNDS, backdropOf, cleanSheetStyle, contrast, THEMES, themeVars } from "./themes";

describe("themes are readable", () => {
  for (const t of THEMES) {
    it(`${t.name}: text, labels, buttons and messages have enough contrast`, () => {
      const p = t.palette;
      expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.soft, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accentText, p.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.accent, p.accentSurface)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.success, p.successBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.danger, p.dangerBg)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("every sheet accent reads on every dark theme, and its button text reads on it", () => {
    for (const t of THEMES.filter((x) => !x.light)) for (const a of ACCENTS) {
      expect(contrast(a.hex, t.palette.bg), `${a.name} on ${t.name}`).toBeGreaterThanOrEqual(3);
      const v = themeVars(t.id, { accent: a.hex });
      expect(contrast(v["--color-accent-text"], a.hex), `${a.name} button text`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("pale accents get darkened on light themes", () => {
    expect(themeVars("lightfantasy", { accent: "#cfd6df" })["--color-accent"]).toMatch(/color-mix/);
    expect(themeVars("tavern")["--font-spectral"]).toBeUndefined();
    expect(themeVars("sea")["--font-spectral"]).toMatch(/Pirata One/);
  });
  it("any font can be used for all text, also the theme's own", () => {
    expect(themeVars("tavern", { font: "rye", allText: true })["--font-manrope"]).toMatch(/Rye/);
    expect(themeVars("sea", { allText: true })["--font-manrope"]).toMatch(/Pirata One/);
    expect(themeVars("tavern", { allText: true })["--font-manrope"]).toMatch(/Spectral/);
    expect(themeVars("tavern", { font: "rye" })["--font-manrope"]).toBeUndefined();
  });
});

describe("own background color and picture", () => {
  const bgs = [...BACKGROUNDS, "#808080", "#ff0000", "#ffff00", "#000000", "#ffffff", "#3a5f8a"];
  it("text, labels and the accent stay readable on any background, with any theme and accent", () => {
    for (const t of THEMES) for (const bg of bgs) for (const accent of [undefined, ...ACCENTS.map((a) => a.hex)]) {
      const v = themeVars(t.id, { bg, accent });
      const at = `${t.name} on ${bg} with ${accent ?? "theme accent"}`;
      expect(contrast(v["--color-text"], bg), at).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v["--color-text"], v["--color-surface"]), at).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v["--color-muted"], v["--color-surface"]), at).toBeGreaterThanOrEqual(3);
      if (!accent) {
        expect(contrast(v["--color-accent"], bg), at).toBeGreaterThanOrEqual(3);
        expect(contrast(v["--color-accent-text"], v["--color-accent"]), at).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("a picture is covered by the background color; bad values are dropped", () => {
    expect(backdropOf("sea", { dim: 0.7 }, "/api/sheet-bg/x?v=1")).toMatch(/color-mix\(in srgb, var\(--color-bg\) 70%, transparent\).*url\("\/api\/sheet-bg\/x\?v=1"\)/);
    expect(backdropOf("sea", { bg: "#112233" })).toBe("none");
    expect(cleanSheetStyle({ bg: "red", image: -3, dim: 5 })).toEqual({});
    expect(cleanSheetStyle({ bg: "#AABBCC", image: 1700000000000, dim: 0.555 })).toEqual({ bg: "#aabbcc", image: 1700000000000, dim: 0.56 });
  });
});
