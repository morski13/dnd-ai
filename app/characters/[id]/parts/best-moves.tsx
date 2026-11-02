"use client";
// "Best moves": the strongest damage turn, the best turn that costs nothing, and the best heal.
// "Do it" rolls the move's pieces in order (boosts, then the attack or spell). In fight mode the list
// is worked out again after every roll from what's left of the turn (Rage already on, bonus action used…).
import { useMemo, useState } from "react";
import { bestMoves, type Combo, type Target, type TurnLeft } from "@/lib/combos";
import type { Option, SheetCharacter } from "@/lib/rules";

const ACS = [10, 12, 13, 14, 15, 16, 18];

export function BestMoves({ c, options, turn, onDo, busy = false, ac, onAc }: {
  c: SheetCharacter; options: Option[];
  /** the target's AC, shared with the sheet's rolls (null = not set: plans use 13, rolls aren't checked) */
  ac?: number | null;
  onAc?: (ac: number | null) => void;
  /** fight mode: plan only what's left of this turn */
  turn?: TurnLeft | null;
  /** roll the move (missing when the sheet is view-only) */
  onDo?: (combo: Combo) => void;
  busy?: boolean;
}) {
  const [own, setT] = useState<Target>({ ac: 13, saveBonus: 2, allyAdjacent: false });
  const t: Target = useMemo(() => ({ ...own, ac: ac ?? own.ac }), [own, ac]);
  const pickAc = (n: number | null) => { if (onAc) onAc(n); else if (n != null) setT({ ...own, ac: n }); };
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const moves = useMemo(() => bestMoves(c, options, t, turn ?? undefined), [c, options, t, turn]);
  if (!moves.bestDamage && !moves.bestHeal) {
    return turn ? <p className="rounded-[18px] border border-line bg-surface p-4 text-sm text-muted">Nothing left to plan this turn. End your turn, or keep your reaction ready.</p> : null;
  }

  const rows: { key: string; label: string; combo: Combo; heal?: boolean }[] = [];
  if (moves.bestDamage) rows.push({ key: "dmg", label: "Most damage", combo: moves.bestDamage });
  if (moves.bestFree) rows.push({ key: "free", label: "Most damage, no resources", combo: moves.bestFree });
  if (moves.bestHeal) rows.push({ key: "heal", label: "Most healing", combo: moves.bestHeal, heal: true });

  return (
    <section className="rounded-[18px] border border-accent-line bg-accent-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{turn ? "Best next move · what's left of this turn" : "Best moves this turn"}</p>
      </div>

      {/* Target settings: tap a usual AC or type any */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
        <span className="shrink-0 text-xs text-muted">Target AC</span>
        <input
          value={typed || (ac != null && !ACS.includes(ac) ? String(ac) : "")}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setTyped(v);
            if (v && Number(v) >= 1) pickAc(Math.min(40, Number(v)));
          }}
          inputMode="numeric" placeholder="Type" aria-label="Type the target's AC"
          className={`h-9 w-16 shrink-0 rounded-lg border bg-bg px-2 text-center text-sm outline-none focus:border-accent ${ac != null && !ACS.includes(ac) ? "border-accent font-bold text-accent" : "border-line"}`}
        />
        {ACS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setTyped(""); pickAc(n); }}
            aria-pressed={t.ac === n && (ac != null || !onAc)}
            className={`h-9 min-w-9 shrink-0 rounded-lg px-2 text-sm ${t.ac === n && (ac != null || !onAc) ? "bg-accent font-bold text-accent-text" : "border border-line text-soft"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {onAc && (
        <p className="mt-1 text-xs text-muted">
          {ac != null
            ? <>Your attacks are checked against AC {ac}: under it is a miss, with no damage to roll. <button type="button" onClick={() => { setTyped(""); onAc(null); }} className="text-accent underline">Clear</button></>
            : "Pick or type the target's AC to have your attack rolls checked (hit or miss)."}
        </p>
      )}
      {options.some((o) => o.needs_advantage_or_ally) && (
        <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-soft">
          <input type="checkbox" checked={t.allyAdjacent} onChange={(e) => setT({ ...t, allyAdjacent: e.target.checked })} className="h-5 w-5 accent-accent" />
          An ally is next to the target
        </label>
      )}

      <div className="mt-2 flex flex-col gap-2">
        {rows.map(({ key, label, combo, heal }) => (
          <div key={key} className="rounded-xl bg-bg/60">
            <button
              type="button"
              onClick={() => setOpen(open === key ? null : key)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left"
              aria-expanded={open === key}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">{label}</p>
                <p className="font-semibold leading-snug">{combo.title}</p>
                <p className="mt-0.5 text-xs text-muted">{combo.costs.length ? `Costs: ${combo.costs.join(", ")}` : "Costs nothing"}</p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${heal ? "text-success" : "text-text"}`}>
                  ~{Math.round(heal ? combo.heal : combo.damage)}
                </p>
                <p className="text-xs text-muted">{heal ? "HP healed" : `dmg · max ${combo.maxDamage}`}</p>
              </div>
            </button>
            {open === key && (
              <ol className="space-y-1.5 border-t border-line px-3 py-3 text-sm">
                {combo.steps.map((s, i) => (
                  <li key={i}>
                    <span className="text-muted">{s.action}: </span>
                    <span className="font-semibold">{s.name}</span>
                    {s.detail && <span className="text-muted">: {s.detail}</span>}
                  </li>
                ))}
                {heal && combo.damage > 0 && <li className="text-muted">Also deals ~{Math.round(combo.damage)} damage.</li>}
                {combo.notes.map((n) => <li key={n} className="text-[#F2C48D]">Careful: {n}</li>)}
              </ol>
            )}
            {onDo && (
              <div className="border-t border-line px-3 py-2">
                <button type="button" disabled={busy} onClick={() => onDo(combo)}
                  className="h-10 w-full rounded-lg bg-accent text-sm font-bold text-accent-text disabled:opacity-50">
                  {busy ? "Rolling…" : `Do it: ${doLabel(combo)}`}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted">
        Average results vs AC {t.ac}, target save +{t.saveBonus}.{turn ? " Worked out again after every roll." : " Turn 1 shown (e.g. Rage costs its bonus action only once)."}{onDo ? " Do it rolls the boosts and the attack; the bonus action comes next." : ""}
      </p>
    </section>
  );
}

/** What "Do it" rolls now: boosts first, then the action's roll (or the bonus action when nothing else is left). */
function doLabel(c: Combo) {
  const first = [...c.parts.boosts.map((b) => b.name), c.parts.main?.name ?? c.parts.bonus?.name].filter(Boolean);
  return first.join(" → ");
}
