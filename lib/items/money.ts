// Coins: platinum, gold, electrum, silver, copper. All math is done in copper (1 gp = 100 cp).
export type Coins = { pp: number; gp: number; ep: number; sp: number; cp: number };
export const COIN_KEYS = ["pp", "gp", "ep", "sp", "cp"] as const;
export const VALUE: Coins = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
export const COIN_NAME: Record<keyof Coins, string> = { pp: "Platinum", gp: "Gold", ep: "Electrum", sp: "Silver", cp: "Copper" };
export const ZERO: Coins = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

/** Safe coins from anything (negative, missing or silly values become 0). */
export function toCoins(raw: unknown): Coins {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...ZERO };
  for (const k of COIN_KEYS) {
    const n = Math.floor(Number(r[k]));
    out[k] = Number.isFinite(n) && n > 0 ? Math.min(n, 9_999_999) : 0;
  }
  return out;
}

export const total = (c: Coins) => COIN_KEYS.reduce((s, k) => s + c[k] * VALUE[k], 0);

/** "12 gp 5 sp" style price; free is "Free". */
export function formatCp(cp: number | null | undefined): string {
  if (cp == null) return "—";
  if (cp <= 0) return "Free";
  const gp = Math.floor(cp / 100), sp = Math.floor((cp % 100) / 10), c = cp % 10;
  return [gp && `${gp.toLocaleString("en-US")} gp`, sp && `${sp} sp`, c && `${c} cp`].filter(Boolean).join(" ");
}

/** The purse in words: "47 gp, 3 sp". */
export function formatCoins(c: Coins): string {
  const parts = COIN_KEYS.filter((k) => c[k] > 0).map((k) => `${c[k].toLocaleString("en-US")} ${k}`);
  return parts.length ? parts.join(", ") : "No coins";
}

/** Splits copper into the fewest everyday coins (gold, silver, copper; no electrum or platinum). */
export function fromCp(cp: number): Coins {
  const v = Math.max(0, Math.floor(cp));
  return { pp: 0, gp: Math.floor(v / 100), ep: 0, sp: Math.floor((v % 100) / 10), cp: v % 10 };
}

/**
 * Pay a price out of a purse, like at a real counter: spend small coins first,
 * then break the smallest coin that covers the rest and take the change in gold/silver/copper.
 * Returns null if there isn't enough money.
 */
export function pay(purse: Coins, priceCp: number): Coins | null {
  const price = Math.max(0, Math.round(priceCp));
  if (total(purse) < price) return null;
  const left = { ...purse };
  let owed = price;
  for (const k of [...COIN_KEYS].reverse()) {           // cp, sp, ep, gp, pp
    const use = Math.min(left[k], Math.floor(owed / VALUE[k]));
    left[k] -= use;
    owed -= use * VALUE[k];
  }
  if (owed > 0) {
    // every coin still in the purse is worth more than what's owed: break the smallest one
    const k = [...COIN_KEYS].reverse().find((x) => left[x] > 0)!;
    left[k] -= 1;
    const change = fromCp(VALUE[k] - owed);
    left.gp += change.gp; left.sp += change.sp; left.cp += change.cp;
  }
  return left;
}

/** Add coins (gifts, loot). */
export function add(a: Coins, b: Coins): Coins {
  return { pp: a.pp + b.pp, gp: a.gp + b.gp, ep: a.ep + b.ep, sp: a.sp + b.sp, cp: a.cp + b.cp };
}

/** Split copper evenly between n people; the leftover copper goes to the first ones. */
export function split(cp: number, n: number): number[] {
  if (n <= 0) return [];
  const each = Math.floor(cp / n), rest = cp - each * n;
  return Array.from({ length: n }, (_, i) => each + (i < rest ? 1 : 0));
}

/** Suggested price for a magic item by rarity (SRD 5.2.1 values); consumables cost half. */
export function magicPrice(rarity: string | null | undefined, consumable = false): number | null {
  const r = (rarity ?? "").toLowerCase();
  const gp = r.startsWith("common") ? 100 : r.startsWith("uncommon") ? 400 : r.startsWith("rare") ? 4000
    : r.startsWith("very rare") ? 40000 : r.startsWith("legendary") ? 200000 : null;
  return gp == null ? null : (consumable ? gp / 2 : gp) * 100;
}

/** "12 gp", "1.5 gp", "3 sp" → copper. Returns null if it can't be read. */
export function parsePrice(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/,/g, "");
  if (!t) return null;
  let sum = 0, hit = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(pp|gp|ep|sp|cp)?/g)) {
    sum += Number(m[1]) * VALUE[(m[2] ?? "gp") as keyof Coins];
    hit = true;
  }
  return hit ? Math.round(sum) : null;
}
