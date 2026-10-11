// The rules for hit points, as plain functions (no database), so they can be tested.
// 2024 / SRD 5.2.1: temp HP soaks damage first; at 0 HP a character makes death saves;
// damage while at 0 HP = a failed death save (a critical hit = two); if the damage left over
// after dropping to 0 is at least your HP maximum you die outright. Monsters die at 0 HP.

export type Factor = "full" | "half" | "resist" | "double" | "immune";
export const FACTORS: { id: Factor; label: string }[] = [
  { id: "full", label: "Full" },
  { id: "half", label: "Half (saved)" },
  { id: "resist", label: "Resistant" },
  { id: "double", label: "Vulnerable" },
  { id: "immune", label: "Immune" },
];

/** Damage after a save / resistance / vulnerability (halves round down). */
export function adjusted(amount: number, f: Factor): number {
  const n = Math.max(0, Math.floor(amount));
  switch (f) {
    case "half":
    case "resist": return Math.floor(n / 2);
    case "double": return n * 2;
    case "immune": return 0;
    default: return n;
  }
}

export type DeathSaves = { successes: number; failures: number; stable: boolean; dead: boolean };
export const NO_SAVES: DeathSaves = { successes: 0, failures: 0, stable: false, dead: false };

export type HpState = { hp: number; temp: number; max: number; saves: DeathSaves };

export type HpChange = {
  next: HpState;
  hpLost: number;        // real HP lost (not counting temp HP)
  tempLost: number;
  healed: number;        // real HP gained
  dropped: boolean;      // went from above 0 to 0
  instantDeath: boolean; // massive damage
  deathFails: number;    // failed death saves added by this hit
  revived: boolean;      // healed up from 0
};

export function applyDamage(s: HpState, amount: number, opts: { isCharacter: boolean; crit?: boolean }): HpChange {
  const n = Math.max(0, Math.floor(amount));
  const out: HpChange = { next: { ...s, saves: { ...s.saves } }, hpLost: 0, tempLost: 0, healed: 0, dropped: false, instantDeath: false, deathFails: 0, revived: false };
  if (n === 0) return out;
  const tempLost = Math.min(s.temp, n);
  const rest = n - tempLost;
  out.tempLost = tempLost;
  out.next.temp = s.temp - tempLost;
  if (rest === 0) return out;

  if (s.hp > 0) {
    const lost = Math.min(s.hp, rest);
    out.hpLost = lost;
    out.next.hp = s.hp - lost;
    if (out.next.hp === 0) {
      out.dropped = true;
      if (opts.isCharacter) {
        out.next.saves = { ...NO_SAVES };
        if (rest - lost >= s.max && s.max > 0) { out.instantDeath = true; out.next.saves.dead = true; }
      } else {
        out.next.saves = { ...NO_SAVES, dead: true }; // monsters die at 0
      }
    }
    return out;
  }

  // Already at 0 HP
  if (!opts.isCharacter || s.saves.dead) return out;
  if (rest >= s.max && s.max > 0) {
    out.instantDeath = true;
    out.next.saves = { ...s.saves, dead: true };
    return out;
  }
  const fails = opts.crit ? 2 : 1;
  const failures = Math.min(3, s.saves.failures + fails);
  out.deathFails = failures - s.saves.failures;
  out.next.saves = { ...s.saves, failures, stable: false, dead: failures >= 3 };
  return out;
}

export function applyHeal(s: HpState, amount: number): HpChange {
  const n = Math.max(0, Math.floor(amount));
  const out: HpChange = { next: { ...s, saves: { ...s.saves } }, hpLost: 0, tempLost: 0, healed: 0, dropped: false, instantDeath: false, deathFails: 0, revived: false };
  if (n === 0 || s.saves.dead) return out; // healing doesn't raise the dead
  const top = s.max > 0 ? s.max : s.hp + n;
  out.next.hp = Math.min(top, s.hp + n);
  out.healed = out.next.hp - s.hp;
  if (s.hp === 0 && out.next.hp > 0) {
    out.revived = true;
    out.next.saves = { ...NO_SAVES };
  }
  return out;
}

/** A death saving throw: 10+ succeeds, 1 = two failures, 20 = back up with 1 HP. */
export function deathSave(s: HpState, d20: number): { next: HpState; outcome: "success" | "failure" | "two failures" | "back up" | "stable" | "dead" } {
  const saves = { ...s.saves };
  if (d20 === 20) return { next: { ...s, hp: 1, saves: { ...NO_SAVES } }, outcome: "back up" };
  if (d20 === 1) saves.failures = Math.min(3, saves.failures + 2);
  else if (d20 >= 10) saves.successes = Math.min(3, saves.successes + 1);
  else saves.failures = Math.min(3, saves.failures + 1);
  if (saves.failures >= 3) return { next: { ...s, saves: { ...saves, dead: true } }, outcome: "dead" };
  if (saves.successes >= 3) return { next: { ...s, saves: { ...saves, stable: true } }, outcome: "stable" };
  return { next: { ...s, saves }, outcome: d20 === 1 ? "two failures" : d20 >= 10 ? "success" : "failure" };
}

/** What players see about a monster's health. */
export type Health = "unhurt" | "hurt" | "bloodied" | "down";
export function healthOf(hp: number | null, max: number | null): Health {
  if (hp == null || !max) return "unhurt";
  if (hp <= 0) return "down";
  if (hp <= max / 2) return "bloodied";
  if (hp < max) return "hurt";
  return "unhurt";
}

export const CONDITIONS = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed",
  "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion",
  "Concentrating", "Raging", "Blessed", "Hidden", "Dodging",
] as const;
