// What a set of custom dice looks like. Saved as JSON in the dice_skins table.

export const PATTERNS = ["solid", "gradient", "marble", "swirl", "galaxy", "stars", "stripes", "dots", "scales", "wood"] as const;
export const FINISHES = ["glossy", "matte", "metal", "pearl", "crystal"] as const;
export const FONTS = ["classic", "modern", "storybook", "typewriter"] as const;

export type Pattern = (typeof PATTERNS)[number];
export type Finish = (typeof FINISHES)[number];
export type Font = (typeof FONTS)[number];

export type DiceSkin = {
  name: string;
  body: string;      // main color
  accent: string;    // second color, used by the pattern
  pattern: Pattern;
  finish: Finish;
  ink: string;       // number color
  outline: string;   // number outline color
  font: Font;
  images: {
    all?: string;                   // picture on every face, behind the number
    max?: string;                   // picture on the highest face of every die (your nat 20!)
    faces?: Record<string, string>; // picture on one face, key "d20:20"
  };
  numbersOnPictures: boolean;       // keep a small number on faces that have a picture
  allOpacity: number;               // how strong the "every face" picture is (0.1–1)
};

export const DEFAULT_SKIN: DiceSkin = {
  name: "Ember",
  body: "#8a2d12",
  accent: "#e0913a",
  pattern: "marble",
  finish: "glossy",
  ink: "#fbe7c6",
  outline: "#2a120a",
  font: "classic",
  images: {},
  numbersOnPictures: true,
  allOpacity: 0.35,
};

export const PRESETS: DiceSkin[] = [
  DEFAULT_SKIN,
  { ...DEFAULT_SKIN, name: "Frost", body: "#1d4e7a", accent: "#b9e3ff", pattern: "swirl", finish: "pearl", ink: "#ffffff", outline: "#0c2236" },
  { ...DEFAULT_SKIN, name: "Nebula", body: "#1b1036", accent: "#b48cff", pattern: "galaxy", finish: "glossy", ink: "#f5e9ff", outline: "#0b0618" },
  { ...DEFAULT_SKIN, name: "Bone", body: "#e9e0cc", accent: "#b8a988", pattern: "solid", finish: "matte", ink: "#2b2218", outline: "#e9e0cc", font: "storybook" },
  { ...DEFAULT_SKIN, name: "Dragon gold", body: "#b8862b", accent: "#ffe08a", pattern: "scales", finish: "metal", ink: "#2a1a05", outline: "#ffe8a8" },
  { ...DEFAULT_SKIN, name: "Emerald", body: "#0f6b45", accent: "#7dffc0", pattern: "solid", finish: "crystal", ink: "#eafff4", outline: "#06311f" },
  { ...DEFAULT_SKIN, name: "Druid oak", body: "#5a3a1e", accent: "#8c6239", pattern: "wood", finish: "matte", ink: "#f1dfb8", outline: "#2b1a0b", font: "storybook" },
  { ...DEFAULT_SKIN, name: "Bloodstone", body: "#1a1a1a", accent: "#c0202a", pattern: "dots", finish: "glossy", ink: "#ff5a5a", outline: "#000000" },
];

const HEX = /^#[0-9a-f]{6}$/i;
const IMG = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
export const MAX_IMAGE_CHARS = 120_000;   // ~90 KB per picture (they are resized to 256 px)
export const MAX_SKIN_CHARS = 1_500_000;  // whole skin incl. pictures

/** Cleans up a skin coming from the browser. Returns null if it isn't one. */
export function sanitizeSkin(input: unknown): DiceSkin | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Partial<DiceSkin>;
  const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
  const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
  const img = (v: unknown) => (typeof v === "string" && v.length <= MAX_IMAGE_CHARS && IMG.test(v) ? v : undefined);
  const faces: Record<string, string> = {};
  if (s.images?.faces && typeof s.images.faces === "object") {
    for (const [k, v] of Object.entries(s.images.faces).slice(0, 80)) {
      if (/^d(4|6|8|10|12|20|100):\d{1,3}$/.test(k) && img(v)) faces[k] = v;
    }
  }
  const out: DiceSkin = {
    name: typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 40) : "My dice",
    body: color(s.body, DEFAULT_SKIN.body),
    accent: color(s.accent, DEFAULT_SKIN.accent),
    pattern: pick(s.pattern, PATTERNS, "solid"),
    finish: pick(s.finish, FINISHES, "glossy"),
    ink: color(s.ink, DEFAULT_SKIN.ink),
    outline: color(s.outline, DEFAULT_SKIN.outline),
    font: pick(s.font, FONTS, "classic"),
    images: { all: img(s.images?.all), max: img(s.images?.max), faces },
    numbersOnPictures: s.numbersOnPictures !== false,
    allOpacity: typeof s.allOpacity === "number" ? Math.min(1, Math.max(0.1, s.allOpacity)) : 0.35,
  };
  if (JSON.stringify(out).length > MAX_SKIN_CHARS) return null;
  return out;
}
