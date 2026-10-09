"use client";
// Small shared pieces for Session mode.
import type { Advantage } from "@/lib/dice";
import { signed } from "@/lib/dice";

export function Segment({ active, onClick, children, tone = "normal" }: {
  active: boolean; onClick: () => void; children: React.ReactNode; tone?: "normal" | "danger";
}) {
  const on = tone === "danger" ? "border-danger-line bg-danger-bg text-danger font-bold" : "border-[#8A5A24] bg-bg text-text font-bold";
  return (
    <button type="button" onClick={onClick}
      className={`h-10 shrink-0 rounded-lg border px-3 text-sm ${active ? on : "border-line text-soft"}`}>
      {children}
    </button>
  );
}

export function AdvToggle({ value, onChange }: { value: Advantage; onChange: (a: Advantage) => void }) {
  return (
    <div className="grid grid-cols-3 rounded-xl bg-bg p-1">
      {(["disadvantage", "normal", "advantage"] as Advantage[]).map((a) => (
        <button key={a} type="button" onClick={() => onChange(a)}
          className={`h-10 rounded-lg text-sm ${value === a ? "bg-surface font-bold text-text" : "text-muted"}`}>
          {a === "disadvantage" ? "Disadv." : a === "advantage" ? "Advantage" : "Normal"}
        </button>
      ))}
    </div>
  );
}

type RollLike = {
  label: string; rollType?: string; expression: string; total: number | null; dice: number[]; diceAll: number[];
  modifier: number; isCrit: boolean; isFumble: boolean; success?: boolean | null; dc?: number; ability?: string; target?: string | null;
};

/** "Last roll · d20 (9, 4) + 5" / "14 · Hit" */
export function ResultLine({ roll: r }: { roll: RollLike }) {
  if (r.rollType === "save_dc") {
    return (
      <div>
        <p className="text-xs text-muted">{r.label}{r.target ? ` → ${r.target}` : ""}</p>
        <p className="text-lg font-bold">{r.ability} save, DC {r.dc}</p>
      </div>
    );
  }
  if (r.rollType === "other" && r.total == null) {
    return <div><p className="text-xs text-muted">Used</p><p className="text-lg font-bold">{r.label}</p></div>;
  }
  const dice = r.diceAll.length > r.dice.length ? `(${r.diceAll.join(", ")})` : `(${r.dice.join(", ")})`;
  const verdict = r.isCrit ? "Crit!" : r.isFumble ? "Natural 1" : r.success === true ? "Hit" : r.success === false ? "Miss" : null;
  return (
    <div>
      <p className="text-xs text-muted">{r.label}{r.target ? ` → ${r.target}` : ""}</p>
      <p className="text-xs text-muted">{r.expression} {dice}{r.modifier ? ` ${signed(r.modifier)}` : ""}</p>
      <p key={`${r.label}|${r.total}|${r.diceAll.join(",")}`} className={`text-lg font-bold ${r.isCrit ? "animate-pop text-accent" : r.isFumble ? "animate-shake text-danger" : "animate-pop"}`}>
        {r.total}{verdict ? ` · ${verdict}` : ""}
      </p>
    </div>
  );
}
