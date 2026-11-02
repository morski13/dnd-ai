// DM quick log (pure, tested): one line typed at a table without phones ("Kazar · attack 17 · hit · Ogre · 12")
// turned into the roll events and HP change the app would have saved for a normal roll.
export type Who = { characterId?: string | null; monsterId?: string | null };
export type QuickKind = "attack" | "spell" | "save" | "heal" | "took";
export type QuickLine = {
  who: Who; kind: QuickKind; label?: string;
  number?: number | null;     // the attack roll / save roll
  hit?: boolean | null;       // attack: hit or miss; save: made it (true) or failed (false)
  target?: Who | null;
  amount?: number | null;     // damage dealt, healing, or damage taken
};
export type PlannedRoll = { roll_type: "attack" | "damage" | "save" | "heal"; source: string; total: number; success: boolean | null; target: Who | null; parent: boolean };
export type QuickPlan = { rolls: PlannedRoll[]; hp: { target: Who; kind: "damage" | "heal"; amount: number } | null };

const int = (v: unknown, lo: number, hi: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const has = (w?: Who | null) => !!(w && (w.characterId || w.monsterId));

/** What to save for a line, or why it can't be saved yet. */
export function planQuick(l: QuickLine): QuickPlan | { error: string } {
  if (!has(l.who)) return { error: "Pick who." };
  const label = (l.label ?? "").trim().slice(0, 60);
  const amount = l.amount == null || l.amount === ("" as unknown) ? null : int(l.amount, 0, 9999);
  const num = l.number == null || l.number === ("" as unknown) ? null : int(l.number, -10, 99);
  switch (l.kind) {
    case "attack": case "spell": {
      if (l.kind === "attack" && num == null) return { error: "Type the attack roll." };
      if (amount != null && !has(l.target)) return { error: "Pick who was hit." };
      const rolls: PlannedRoll[] = [];
      const src = label || (l.kind === "spell" ? "Spell" : "Attack");
      if (num != null) rolls.push({ roll_type: "attack", source: src, total: num, success: l.hit ?? null, target: l.target ?? null, parent: false });
      const hits = l.hit !== false;
      if (amount != null && hits) rolls.push({ roll_type: "damage", source: src, total: amount, success: null, target: l.target ?? null, parent: num != null });
      if (!rolls.length) return { error: "Type the roll or the damage." };
      return { rolls, hp: amount != null && hits && amount > 0 ? { target: l.target!, kind: "damage", amount } : null };
    }
    case "save":
      if (num == null) return { error: "Type the save roll." };
      return { rolls: [{ roll_type: "save", source: label || "Saving throw", total: num, success: l.hit ?? null, target: null, parent: false }],
        hp: amount ? { target: l.who, kind: "damage", amount } : null };
    case "heal": {
      if (!amount) return { error: "Type how much." };
      const target = has(l.target) ? l.target! : l.who;
      return { rolls: [{ roll_type: "heal", source: label || "Healing", total: amount, success: null, target, parent: false }], hp: { target, kind: "heal", amount } };
    }
    case "took":
      if (!amount) return { error: "Type the damage." };
      return { rolls: [], hp: { target: l.who, kind: "damage", amount } };
  }
}
