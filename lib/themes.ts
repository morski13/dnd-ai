// Looks: table themes the DM picks for Session mode, and the fonts / colors players pick for their sheets.
// A theme only swaps the app's color tokens (--color-*), the heading/body fonts and a backdrop drawn in CSS,
// so every screen keeps working the same in every theme.

export type ThemeId = "tavern" | "wildwest" | "cyberpunk" | "lightfantasy" | "darkfantasy" | "space" | "futuristic" | "noir" | "sea";
type Palette = {
  bg: string; surface: string; surface2: string; line: string; text: string; muted: string; soft: string;
  accent: string; accentText: string; accentSurface: string; accentLine: string; accentStrong: string;
  success: string; successBg: string; successLine: string; danger: string; dangerBg: string; dangerLine: string;
};
export type Theme = {
  id: ThemeId; name: string; blurb: string; light?: boolean;
  heading: FontId; body?: FontId;
  palette: Palette;
  backdrop: string; // CSS background drawn behind everything
};

export type FontId = "spectral" | "fell" | "marcellus" | "caveat" | "elite" | "rye" | "pirata" | "exo" | "chakra" | "orbitron" | "manrope";
/** Fonts from Google Fonts (loaded only when used). `body`: readable enough for all text. */
export const FONTS: Record<FontId, { name: string; family: string; query: string; body: boolean; sample: string }> = {
  spectral: { name: "Storybook", family: "Spectral", query: "Spectral:wght@600;700", body: false, sample: "A tale begins" },
  fell: { name: "Old tome", family: "IM Fell English", query: "IM+Fell+English", body: true, sample: "Ye olde scroll" },
  marcellus: { name: "Elven", family: "Marcellus", query: "Marcellus", body: true, sample: "Starlit glade" },
  caveat: { name: "Handwritten", family: "Caveat", query: "Caveat:wght@500;700", body: false, sample: "Notes in ink" },
  elite: { name: "Typewriter", family: "Special Elite", query: "Special+Elite", body: true, sample: "Case file 13" },
  rye: { name: "Wanted poster", family: "Rye", query: "Rye", body: false, sample: "Dead or alive" },
  pirata: { name: "Pirate", family: "Pirata One", query: "Pirata+One", body: false, sample: "Ahoy, matey" },
  exo: { name: "Starship", family: "Exo 2", query: "Exo+2:wght@400;600;700", body: true, sample: "Warp drive on" },
  chakra: { name: "Neon", family: "Chakra Petch", query: "Chakra+Petch:wght@500;700", body: true, sample: "Jack in" },
  orbitron: { name: "Chrome", family: "Orbitron", query: "Orbitron:wght@500;700", body: false, sample: "System online" },
  manrope: { name: "Clean", family: "Manrope", query: "Manrope:wght@400;600;700", body: true, sample: "Plain and clear" },
};

export const THEMES: Theme[] = [
  {
    id: "tavern", name: "Tavern", blurb: "Warm lamplight and old wood (the usual look).", heading: "spectral",
    palette: { bg: "#15130f", surface: "#211d18", surface2: "#1a1713", line: "#3a332a", text: "#efe7da", muted: "#a89c8a", soft: "#cbbfad",
      accent: "#e0913a", accentText: "#1a140c", accentSurface: "#2a2017", accentLine: "#5a4024", accentStrong: "#8a5a24",
      success: "#b5e0a8", successBg: "#1a2a1a", successLine: "#335a30", danger: "#f0b0a8", dangerBg: "#2a1a1a", dangerLine: "#5a3030" },
    backdrop: "radial-gradient(120% 60% at 50% 0%, rgba(224,145,58,0.07), transparent 60%)",
  },
  {
    id: "wildwest", name: "Wild West", blurb: "Dust, brass and a low red sun.", heading: "rye",
    palette: { bg: "#1f150e", surface: "#2c1e14", surface2: "#251910", line: "#4a3524", text: "#f4e6cf", muted: "#b49a7c", soft: "#dcc6a6",
      accent: "#e9b949", accentText: "#23170a", accentSurface: "#33251a", accentLine: "#6b5226", accentStrong: "#a8842f",
      success: "#c3dd9a", successBg: "#20291a", successLine: "#44562e", danger: "#f2a48f", dangerBg: "#331b15", dangerLine: "#6b3326" },
    backdrop: [
      "radial-gradient(70% 35% at 50% 105%, rgba(214,96,40,0.38), transparent 70%)",
      "linear-gradient(to top, rgba(201,106,42,0.16), transparent 45%)",
      "repeating-linear-gradient(90deg, rgba(255,230,190,0.018) 0 2px, transparent 2px 9px)",
    ].join(","),
  },
  {
    id: "cyberpunk", name: "Cyberpunk", blurb: "Neon rain over a night city grid.", heading: "chakra", body: "chakra",
    palette: { bg: "#0d0716", surface: "#1a0f29", surface2: "#140b20", line: "#3d2261", text: "#f5ecff", muted: "#a990c9", soft: "#d6c4f0",
      accent: "#ff3ea5", accentText: "#1a0612", accentSurface: "#2a1030", accentLine: "#6e2257", accentStrong: "#c42f86",
      success: "#6ff7d4", successBg: "#0f2a27", successLine: "#1f5e55", danger: "#ff8a8a", dangerBg: "#2e1018", dangerLine: "#6b2234" },
    backdrop: [
      "radial-gradient(60% 40% at 100% 0%, rgba(255,62,165,0.22), transparent 70%)",
      "radial-gradient(60% 40% at 0% 100%, rgba(0,229,255,0.18), transparent 70%)",
      "repeating-linear-gradient(0deg, rgba(0,229,255,0.06) 0 1px, transparent 1px 36px)",
      "repeating-linear-gradient(90deg, rgba(255,62,165,0.05) 0 1px, transparent 1px 36px)",
    ].join(","),
  },
  {
    id: "lightfantasy", name: "Light fantasy", blurb: "Sunlit elven glade, soft and bright.", light: true, heading: "marcellus",
    palette: { bg: "#eef2e6", surface: "#fbfcf7", surface2: "#e4ebdb", line: "#c9d4bb", text: "#1d2a1f", muted: "#5b6b58", soft: "#3a4939",
      accent: "#2e7d5b", accentText: "#f4fbf6", accentSurface: "#dcebdf", accentLine: "#9cc3ab", accentStrong: "#4a9a76",
      success: "#1f6b3a", successBg: "#d9efdc", successLine: "#9ccaa5", danger: "#a3312a", dangerBg: "#f6dedb", dangerLine: "#e0a39c" },
    backdrop: [
      "radial-gradient(55% 35% at 15% 0%, rgba(255,226,140,0.55), transparent 70%)",
      "radial-gradient(50% 40% at 95% 25%, rgba(170,220,190,0.5), transparent 70%)",
      "radial-gradient(2px 2px at 30px 40px, rgba(255,214,120,0.7), transparent), radial-gradient(1.5px 1.5px at 120px 90px, rgba(255,255,255,0.9), transparent)",
    ].join(","),
  },
  {
    id: "darkfantasy", name: "Dark fantasy", blurb: "A blood moon over cursed ground.", heading: "fell",
    palette: { bg: "#100c0d", surface: "#1c1416", surface2: "#161012", line: "#3b2629", text: "#ece2df", muted: "#a68f8c", soft: "#d2c1bd",
      accent: "#c42f3e", accentText: "#fff4f2", accentSurface: "#2a1518", accentLine: "#5e2229", accentStrong: "#8f2430",
      success: "#b9d6a0", successBg: "#18221a", successLine: "#3a5232", danger: "#ff9d8f", dangerBg: "#2c1214", dangerLine: "#6a2a2a" },
    backdrop: [
      "radial-gradient(28% 18% at 78% 6%, rgba(208,58,72,0.55), transparent 70%)",
      "radial-gradient(70% 45% at 78% 0%, rgba(120,20,30,0.25), transparent 70%)",
      "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
    ].join(","),
  },
  {
    id: "space", name: "Space", blurb: "Stars, nebulae and the cold between.", heading: "exo", body: "exo",
    palette: { bg: "#060914", surface: "#0f1424", surface2: "#0b101d", line: "#222c45", text: "#e8eeff", muted: "#8e9bbd", soft: "#c3cde6",
      accent: "#9db8ff", accentText: "#0a1130", accentSurface: "#141c33", accentLine: "#34477a", accentStrong: "#5f7cd1",
      success: "#9ee6c1", successBg: "#0f2420", successLine: "#245246", danger: "#ff9fae", dangerBg: "#2a1220", dangerLine: "#5e2640" },
    backdrop: [
      "radial-gradient(1px 1px at 25px 35px, #fff, transparent)",
      "radial-gradient(1px 1px at 140px 80px, rgba(255,255,255,0.8), transparent)",
      "radial-gradient(1.5px 1.5px at 90px 160px, rgba(190,210,255,0.9), transparent)",
      "radial-gradient(1px 1px at 190px 20px, rgba(255,255,255,0.6), transparent)",
      "radial-gradient(45% 30% at 85% 15%, rgba(140,90,255,0.22), transparent 70%)",
      "radial-gradient(50% 35% at 10% 80%, rgba(60,180,220,0.16), transparent 70%)",
    ].join(","),
  },
  {
    id: "futuristic", name: "Futuristic", blurb: "A bright, clean lab of glass and light.", light: true, heading: "orbitron", body: "manrope",
    palette: { bg: "#e9eef2", surface: "#ffffff", surface2: "#dfe6ec", line: "#c2ced8", text: "#0f1b24", muted: "#566672", soft: "#2c3c48",
      accent: "#0063d1", accentText: "#ffffff", accentSurface: "#dceaf9", accentLine: "#9cc0ea", accentStrong: "#3d86de",
      success: "#0f6b4a", successBg: "#d6f0e5", successLine: "#95cdb6", danger: "#b0282e", dangerBg: "#f8dcdc", dangerLine: "#e6a2a5" },
    backdrop: [
      "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.7) 50%, transparent 60%)",
      "repeating-linear-gradient(0deg, rgba(0,99,209,0.05) 0 1px, transparent 1px 28px)",
      "repeating-linear-gradient(90deg, rgba(0,99,209,0.05) 0 1px, transparent 1px 28px)",
    ].join(","),
  },
  {
    id: "noir", name: "Noir", blurb: "Black and white, rain and blinds.", heading: "elite",
    palette: { bg: "#141414", surface: "#1f1f1f", surface2: "#191919", line: "#3a3a3a", text: "#ececec", muted: "#9a9a9a", soft: "#c8c8c8",
      accent: "#e8e1cf", accentText: "#141414", accentSurface: "#262420", accentLine: "#5a564c", accentStrong: "#a39d8c",
      success: "#cfe0c4", successBg: "#1e231c", successLine: "#4a5745", danger: "#e6a3a3", dangerBg: "#2a1c1c", dangerLine: "#5e3a3a" },
    backdrop: [
      "repeating-linear-gradient(-18deg, rgba(255,255,255,0.045) 0 16px, transparent 16px 44px)",
      "radial-gradient(90% 70% at 0% 0%, transparent 30%, rgba(0,0,0,0.6) 100%)",
    ].join(","),
  },
  {
    id: "sea", name: "Sea", blurb: "Deep water, salt and gold doubloons.", heading: "pirata",
    palette: { bg: "#06202b", surface: "#0b2f3d", surface2: "#082834", line: "#1a4b5c", text: "#e4f4f5", muted: "#8fb3b9", soft: "#c2dfe2",
      accent: "#f2c14e", accentText: "#1f1605", accentSurface: "#12384a", accentLine: "#6b6a3a", accentStrong: "#b9923a",
      success: "#9ee2c9", successBg: "#0d2e2a", successLine: "#2a6a5c", danger: "#ffa894", dangerBg: "#331c1c", dangerLine: "#6e3a32" },
    backdrop: [
      "radial-gradient(90% 35% at 50% 110%, rgba(79,209,197,0.25), transparent 70%)",
      "repeating-linear-gradient(172deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 24px)",
      "radial-gradient(60% 40% at 20% 0%, rgba(120,200,255,0.12), transparent 70%)",
    ].join(","),
  },
];
export const THEME = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, Theme>;
export const isThemeId = (x: unknown): x is ThemeId => typeof x === "string" && x in THEME;

/** Accent colors players can pick for their sheet (each validated for contrast on dark and light themes). */
export const ACCENTS = [
  { name: "Ember", hex: "#e0913a" }, { name: "Gold", hex: "#e9b949" }, { name: "Crimson", hex: "#e35d6d" }, { name: "Rose", hex: "#ff6fae" },
  { name: "Violet", hex: "#a98bff" }, { name: "Sky", hex: "#6fb6ff" }, { name: "Teal", hex: "#3fd0b8" }, { name: "Leaf", hex: "#7fcf6a" }, { name: "Silver", hex: "#cfd6df" },
];
export const SIZES = [{ name: "Small", zoom: 0.92 }, { name: "Normal", zoom: 1 }, { name: "Large", zoom: 1.1 }, { name: "Extra large", zoom: 1.22 }];

export type SheetStyle = {
  theme?: ThemeId; accent?: string; font?: FontId; allText?: boolean; zoom?: number;
  bg?: string;      // own background color (text colors adapt to it)
  image?: number;   // own background picture (its upload stamp; see app/api/sheet-bg)
  dim?: number;     // how much the background color covers the picture (0.2–0.9), so text stays readable
};
/** Background colors offered as swatches (any color can also be picked). */
export const BACKGROUNDS = ["#15130f", "#1b2330", "#1e2a1f", "#2a1a24", "#2b2b2b", "#0e2a33", "#f1ead9", "#e8eef6", "#efe6f0", "#e7efe2"];
export const DIM_DEFAULT = 0.55;

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const hx = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Mix two hex colors (t = how much of b). */
export const mixHex = (a: string, b: string, t: number) =>
  "#" + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Is this a light color, i.e. does dark ink read better on it than light ink? */
export const isLightColor = (hex: string) => contrast(hex, "#121110") > contrast(hex, "#f7f3ec");

/** The CSS variables for a theme (and a player's own accent / font). */
export function themeVars(id: ThemeId, style: SheetStyle = {}): Record<string, string> {
  const t = THEME[id] ?? THEME.tavern;
  const p = { ...t.palette };
  let light = !!t.light;
  if (style.bg && /^#[0-9a-f]{6}$/i.test(style.bg)) {
    // an own background color: pick dark or light ink for it, and build the cards and lines from it
    const bg = style.bg.toLowerCase();
    light = isLightColor(bg);
    const ink = light ? "#121110" : "#f7f3ec";
    const surface = light ? mixHex(bg, "#ffffff", 0.6) : mixHex(bg, "#ffffff", 0.07);
    const status = light ? THEME.lightfantasy.palette : THEME.tavern.palette;
    Object.assign(p, {
      bg, surface, surface2: light ? mixHex(bg, "#000000", 0.04) : mixHex(bg, "#000000", 0.25), line: mixHex(surface, ink, 0.2),
      text: ink, soft: mixHex(ink, surface, 0.2), muted: mixHex(ink, surface, 0.38),
      success: status.success, successBg: status.successBg, successLine: status.successLine,
      danger: status.danger, dangerBg: status.dangerBg, dangerLine: status.dangerLine,
    });
    // keep the theme's color readable on the new background
    let a = p.accent.startsWith("#") ? p.accent : t.palette.accent;
    const btnText = (c: string) => Math.max(contrast(c, "#141414"), contrast(c, "#ffffff"));
    for (let i = 0; i < 25 && (contrast(a, bg) < 3 || btnText(a) < 4.5); i++) a = mixHex(a, ink, 0.12);
    p.accent = a;
    p.accentText = contrast(a, "#141414") >= contrast(a, "#ffffff") ? "#141414" : "#ffffff";
    p.accentSurface = mixHex(surface, a, 0.14); p.accentLine = mixHex(p.line, a, 0.4); p.accentStrong = mixHex(p.line, a, 0.65);
  }
  if (style.accent && /^#[0-9a-f]{6}$/i.test(style.accent)) {
    const a = style.accent;
    // a pale accent on a light theme would vanish: darken it until it reads
    p.accent = light && contrast(a, p.bg) < 3 ? `color-mix(in srgb, ${a} 55%, #000)` : a;
    p.accentText = contrast(a, "#111111") > contrast(a, "#ffffff") && !(light && contrast(a, p.bg) < 3) ? "#141414" : "#ffffff";
    p.accentSurface = `color-mix(in srgb, ${p.accent} ${light ? 14 : 12}%, ${p.surface})`;
    p.accentLine = `color-mix(in srgb, ${p.accent} 38%, ${p.line})`;
    p.accentStrong = `color-mix(in srgb, ${p.accent} 65%, ${p.line})`;
  }
  const { heading: hId, body: bId } = fontsOf(t.id, style);
  const heading = FONTS[hId];
  const bodyFont = bId ? FONTS[bId] : null;
  const v: Record<string, string> = {
    "--color-bg": p.bg, "--color-surface": p.surface, "--color-surface-2": p.surface2, "--color-line": p.line, "--color-text": p.text,
    "--color-muted": p.muted, "--color-soft": p.soft, "--color-accent": p.accent, "--color-accent-text": p.accentText,
    "--color-accent-surface": p.accentSurface, "--color-accent-line": p.accentLine, "--color-accent-strong": p.accentStrong,
    "--color-success": p.success, "--color-success-bg": p.successBg, "--color-success-line": p.successLine,
    "--color-danger": p.danger, "--color-danger-bg": p.dangerBg, "--color-danger-line": p.dangerLine,
  };
  // the app's own fonts (Spectral headings, Manrope text) come from the page; only other fonts are swapped in
  if (heading.family !== "Spectral") v["--font-spectral"] = `"${heading.family}", Georgia, serif`;
  if (bodyFont && bodyFont.family !== "Manrope") v["--font-manrope"] = `"${bodyFont.family}", system-ui, sans-serif`;
  return v;
}

/** Which fonts a theme + sheet style use: headings, and the text font if it isn't the usual one. */
export function fontsOf(id: ThemeId, style: SheetStyle = {}): { heading: FontId; body: FontId | null } {
  const t = THEME[id] ?? THEME.tavern;
  const heading = style.font && FONTS[style.font] ? style.font : t.heading;
  const body = style.allText ? heading : style.font ? null : t.body ?? null; // "all text": the heading font everywhere
  return { heading, body };
}

/** One Google Fonts stylesheet for the fonts in use. */
export function fontHref(ids: (FontId | undefined)[]): string | null {
  const q = [...new Set(ids.filter((x): x is FontId => !!x && x !== "manrope"))].map((id) => `family=${FONTS[id].query}`);
  return q.length ? `https://fonts.googleapis.com/css2?${q.join("&")}&display=swap` : null;
}

/** A sheet style from the database or a browser, with anything unknown dropped. */
export function cleanSheetStyle(x: unknown): SheetStyle {
  const s = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const out: SheetStyle = {};
  if (isThemeId(s.theme)) out.theme = s.theme;
  if (typeof s.accent === "string" && /^#[0-9a-f]{6}$/i.test(s.accent)) out.accent = s.accent.toLowerCase();
  if (typeof s.font === "string" && s.font in FONTS) out.font = s.font as FontId;
  if (s.allText === true) out.allText = true;
  if (typeof s.zoom === "number" && SIZES.some((z) => z.zoom === s.zoom)) out.zoom = s.zoom;
  if (typeof s.bg === "string" && /^#[0-9a-f]{6}$/i.test(s.bg)) out.bg = s.bg.toLowerCase();
  if (typeof s.image === "number" && Number.isInteger(s.image) && s.image > 0) out.image = s.image;
  if (typeof s.dim === "number" && s.dim >= 0.2 && s.dim <= 0.9) out.dim = Math.round(s.dim * 100) / 100;
  return out;
}

/** The backdrop behind the page: an own picture (dimmed with the background color), a plain own color, or the theme's. */
export function backdropOf(id: ThemeId, style: SheetStyle = {}, imageUrl?: string | null): string {
  if (imageUrl) {
    const d = Math.round((style.dim ?? DIM_DEFAULT) * 100);
    const veil = `color-mix(in srgb, var(--color-bg) ${d}%, transparent)`;
    return `linear-gradient(${veil}, ${veil}), url("${imageUrl}") center / cover no-repeat`;
  }
  if (style.bg) return "none";
  return (THEME[id] ?? THEME.tavern).backdrop;
}
