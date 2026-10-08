"use client";
// "Best moves": the strongest damage turn, the best turn that costs nothing, and the best heal.
import { useMemo, useState } from "react";
import { bestMoves, type Combo, type Target } from "@/lib/combos";
import type { Option, SheetCharacter } from "@/lib/rules";

const ACS = [10, 12, 13, 14, 15, 16, 18];

export function BestMoves({ c, options }: { c: SheetCharacter; options: Option[] }) {
  const [t, setT] = useState<Target>({ ac: 13, saveBonus: 2, allyAdjacent: false });
  const [open, setOpen] = useState<string | null>(null);
  const moves = useMemo(() => bestMoves(c, options, t), [c, options, t]);
  if (!moves.bestDamage && !moves.bestHeal) return null;

  const rows: { key: string; label: string; combo: Combo; heal?: boolean }[] = [];
  if (moves.bestDamage) rows.push({ key: "dmg", label: "Most damage", combo: moves.bestDamage });
  if (moves.bestFree) rows.push({ key: "free", label: "Most damage, no resources", combo: moves.bestFree });
  if (moves.bestHeal) rows.push({ key: "heal", label: "Most healing", combo: moves.bestHeal, heal: true });

  return (
    <section className="rounded-[18px] border border-[#5A4024] bg-accent-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Best moves this turn</p>
      </div>

      {/* Target settings */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
        <span className="shrink-0 text-xs text-muted">Target AC</span>
        {ACS.map((ac) => (
          <button
            key={ac}
            type="button"
            onClick={() => setT({ ...t, ac })}
            className={`h-9 min-w-9 shrink-0 rounded-lg px-2 text-sm ${t.ac === ac ? "bg-accent font-bold text-accent-text" : "border border-line text-soft"}`}
          >
            {ac}
          </button>
        ))}
      </div>
      {options.some((o) => o.needs_advantage_or_ally) && (
        <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-soft">
          <input type="checkbox" checked={t.allyAdjacent} onChange={(e) => setT({ ...t, allyAdjacent: e.target.checked })} className="h-5 w-5 accent-[#E0913A]" />
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
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted">
        Average results vs AC {t.ac}, target save +{t.saveBonus}. Turn 1 shown (e.g. Rage costs its bonus action only once).
      </p>
    </section>
  );
}
