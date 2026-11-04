"use client";
// "Did you pass the save?": the DM casts something on you at the table (Fireball, Hold Person…).
// Pick the save, roll it (or say what your dice said), and the app takes the damage off your HP
// (full on a fail, half or none on a success) and puts the condition on you if you failed.
import { useState } from "react";
import { signed } from "@/lib/dice";
import { CONDITIONS } from "@/lib/moderator/hp";
import type { Ability } from "@/lib/rules";

const ABILITIES: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const COMMON = ["Prone", "Frightened", "Charmed", "Poisoned", "Restrained", "Paralyzed", "Stunned", "Blinded", "Deafened", "Incapacitated", "Grappled", "Petrified", "Unconscious", "Exhaustion"] as const;

export type SaveOutcome = { passed: boolean; damage: number; condition: string | null; text: string };

export function SaveHelper({ bonus, canEdit, pending, onRoll, onApply, onClose }: {
  bonus: (a: Ability) => number;
  canEdit: boolean; pending: boolean;
  /** rolls the save on the sheet; resolves with the total (null if cancelled) */
  onRoll: (a: Ability) => Promise<number | null>;
  onApply: (o: SaveOutcome) => Promise<void>;
  onClose: () => void;
}) {
  const [ability, setAbility] = useState<Ability>("DEX");
  const [dc, setDc] = useState("");
  const [damage, setDamage] = useState("");
  const [half, setHalf] = useState(true);
  const [condition, setCondition] = useState<string>("");
  const [total, setTotal] = useState<number | null>(null);   // what the save came to
  const [result, setResult] = useState<SaveOutcome | null>(null);
  const dcN = Number(dc) || null;
  const dmg = Math.max(0, Math.floor(Number(damage) || 0));

  const decide = async (passed: boolean) => {
    const taken = passed ? (half ? Math.floor(dmg / 2) : 0) : dmg;
    const cond = !passed && condition ? condition : null;
    const text = [
      passed ? "Saved!" : "Failed the save.",
      dmg ? (taken ? `You take ${taken} damage${passed && half ? ` (half of ${dmg})` : ""}.` : "No damage.") : null,
      cond ? `You are ${cond}.` : null,
    ].filter(Boolean).join(" ");
    const o = { passed, damage: taken, condition: cond, text };
    await onApply(o);
    setResult(o);
  };

  const roll = async () => {
    const t = await onRoll(ability);
    if (t == null) return;
    setTotal(t);
    if (dcN != null) await decide(t >= dcN);
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-bg p-3" aria-label="Save against a spell or effect">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Save against a spell</p>
          <p className="text-xs text-muted">The DM says the save and the damage. Leave out what you don&apos;t know.</p>
        </div>
        <button type="button" onClick={onClose} className="h-9 shrink-0 px-2 text-sm text-muted underline">Close</button>
      </div>

      {result ? (
        <div className={`animate-pop mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${result.passed ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`} role="status">
          {total != null && <p className="text-xs font-normal text-soft">Your {ability} save: {total}{dcN != null ? ` vs DC ${dcN}` : ""}</p>}
          {result.text}
          <button type="button" onClick={() => { setResult(null); setTotal(null); }} className="mt-1 block text-xs font-normal text-soft underline">Another save</button>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-6 gap-1" role="radiogroup" aria-label="Which save">
            {ABILITIES.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={ability === a} onClick={() => setAbility(a)}
                className={`flex min-h-12 flex-col items-center justify-center rounded-lg border text-xs ${ability === a ? "border-accent bg-accent-surface font-bold text-accent" : "border-line"}`}>
                {a}<span className="text-[11px] text-muted">{signed(bonus(a))}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">DC (if the DM says)
              <input inputMode="numeric" value={dc} onChange={(e) => setDc(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="?"
                className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-text" />
            </label>
            <label className="text-xs text-muted">Damage
              <input inputMode="numeric" value={damage} onChange={(e) => setDamage(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="0"
                className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-text" />
            </label>
          </div>
          {dmg > 0 && (
            <label className="mt-2 flex min-h-10 items-center gap-2 text-sm text-soft">
              <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} className="h-5 w-5 accent-accent" />
              Half damage on a success
            </label>
          )}
          <label className="mt-1 block text-xs text-muted">If you fail, you are…
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-text">
              <option value="">nothing else</option>
              {COMMON.filter((c) => (CONDITIONS as readonly string[]).includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          {total == null || dcN != null ? (
            <button type="button" disabled={!canEdit || pending} onClick={roll}
              className="mt-3 h-12 w-full rounded-xl bg-accent font-bold text-accent-text disabled:opacity-50">
              Roll {ability} save {signed(bonus(ability))}
            </button>
          ) : (
            <p className="mt-3 text-sm">You rolled <b>{total}</b>. What does the DM say?</p>
          )}
          <p className="mt-2 text-xs text-muted">{total == null ? "Rolled real dice, or the DM rolled for you? Just say how it went:" : ""}</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" disabled={!canEdit || pending} onClick={() => decide(true)} className="h-11 rounded-lg border border-success-line bg-success-bg font-bold text-success disabled:opacity-50">I passed</button>
            <button type="button" disabled={!canEdit || pending} onClick={() => decide(false)} className="h-11 rounded-lg border border-danger-line bg-danger-bg font-bold text-danger disabled:opacity-50">I failed</button>
          </div>
        </>
      )}
    </div>
  );
}
