// How a throw feels. Each player tunes this on their own device (Dice workshop → Roll feel).
// Whatever the settings, the dice still land on the real result: the numbers are fixed after the throw.

export type DiceTuning = {
  power: number;     // how hard the dice are thrown (×)
  spin: number;      // how fast they spin (×)
  gravity: number;   // pull down; higher = heavier, snappier
  bounce: number;    // 0 = dead thud, 0.8 = rubber ball
  slide: number;     // friction on the table; higher = stops sooner
  seconds: number;   // longest a roll may take (longer throws play faster)
  size: number;      // dice size on screen (×)
  resultMs: number;  // how long the result stays up (crits/fumbles get +750 ms)
};

export const DEFAULT_TUNING: DiceTuning = {
  power: 1, spin: 1, gravity: 40, bounce: 0.35, slide: 0.25, seconds: 2.1, size: 1, resultMs: 1150,
};

export const TUNING_PRESETS: { name: string; blurb: string; tuning: DiceTuning }[] = [
  { name: "Standard", blurb: "The default", tuning: DEFAULT_TUNING },
  { name: "Snappy", blurb: "Quick and punchy", tuning: { power: 1.15, spin: 0.9, gravity: 62, bounce: 0.2, slide: 0.45, seconds: 1.2, size: 1, resultMs: 800 } },
  { name: "Cinematic", blurb: "Big, slow, dramatic", tuning: { power: 0.9, spin: 1.2, gravity: 26, bounce: 0.4, slide: 0.2, seconds: 3.5, size: 1.25, resultMs: 1800 } },
  { name: "Chaos", blurb: "Bouncy mayhem", tuning: { power: 1.7, spin: 1.9, gravity: 45, bounce: 0.7, slide: 0.1, seconds: 3, size: 0.9, resultMs: 1200 } },
  { name: "Feather", blurb: "Gentle tumble", tuning: { power: 0.6, spin: 0.6, gravity: 30, bounce: 0.15, slide: 0.35, seconds: 2.4, size: 1.1, resultMs: 1300 } },
];

/** The sliders: label, range and how to show the value. */
export const TUNING_FIELDS: { key: keyof DiceTuning; label: string; min: number; max: number; step: number; show: (v: number) => string }[] = [
  { key: "power", label: "Throw strength", min: 0.4, max: 2, step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
  { key: "spin", label: "Spin", min: 0.2, max: 2.2, step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
  { key: "gravity", label: "Weight (gravity)", min: 15, max: 80, step: 1, show: (v) => (v < 30 ? `${v} · floaty` : v > 55 ? `${v} · heavy` : String(v)) },
  { key: "bounce", label: "Bounce", min: 0, max: 0.85, step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
  { key: "slide", label: "Table grip", min: 0.02, max: 0.9, step: 0.02, show: (v) => (v < 0.15 ? "slippery" : v > 0.5 ? "grippy" : `${Math.round(v * 100)}%`) },
  { key: "seconds", label: "Longest roll", min: 0.6, max: 5, step: 0.1, show: (v) => `${v.toFixed(1)} s` },
  { key: "size", label: "Dice size", min: 0.6, max: 1.6, step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
  { key: "resultMs", label: "Result stays up", min: 300, max: 4000, step: 50, show: (v) => `${(v / 1000).toFixed(1)} s` },
];

/** Keeps every value inside its slider range; fills anything missing with the default. */
export function sanitizeTuning(input: unknown): DiceTuning {
  const src = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof DiceTuning, unknown>>;
  const out = { ...DEFAULT_TUNING };
  for (const f of TUNING_FIELDS) {
    const v = src[f.key];
    if (typeof v === "number" && Number.isFinite(v)) out[f.key] = Math.min(f.max, Math.max(f.min, v));
  }
  return out;
}
