"use client";
import { useState } from "react";

export function HpCard({ cur, temp, max, canEdit, pending, onChange }: {
  cur: number; temp: number; max: number; canEdit: boolean; pending: boolean;
  onChange: (kind: "damage" | "heal" | "temp", n: number) => void;
}) {
  const [mode, setMode] = useState<"damage" | "heal" | "temp" | null>(null);
  const [value, setValue] = useState("");
  const pct = max ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  // Remember the last HP we showed, to animate the change (damage drains, healing glows)
  const [seen, setSeen] = useState({ cur, pct, kind: null as "damage" | "heal" | null, n: 0, from: pct });
  if (seen.cur !== cur) setSeen({ cur, pct, kind: cur < seen.cur ? "damage" : "heal", n: seen.n + 1, from: seen.pct });
  const barColor = pct > 50 ? "#7BC86C" : pct > 25 ? "#E0913A" : "#F07A6A";

  function apply() {
    const n = Number(value);
    if (mode && n > 0) onChange(mode, n);
    setMode(null);
    setValue("");
  }

  return (
    <section className="relative mt-5 overflow-hidden rounded-[18px] border border-line bg-surface p-4">
      {seen.kind && <div key={seen.n} className={`pointer-events-none absolute inset-0 ${seen.kind === "damage" ? "flash-damage" : "flash-heal"}`} aria-hidden />}
      <div className="relative flex items-baseline justify-between">
        <p className="text-[15px] text-soft">Hit points</p>
        <p className="font-bold">
          <span key={seen.n} className={`inline-block ${seen.kind === "damage" ? "animate-shake" : seen.kind === "heal" ? "animate-pop" : ""}`}>{cur}</span> / {max}
          {temp > 0 && <span className="ml-2 text-sm text-[#7FB8D4]">+{temp} temp</span>}
        </p>
      </div>
      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-bg">
        {seen.kind === "damage" && (
          <div key={seen.n} className="hp-ghost absolute inset-y-0 left-0 rounded-full bg-[#F07A6A]/70"
            style={{ "--from": `${seen.from}%`, "--to": `${pct}%` } as React.CSSProperties} />
        )}
        <div className="bar-fill relative h-full rounded-full" style={{ width: `${pct}%`, background: barColor, boxShadow: seen.kind === "heal" ? "0 0 12px #7BC86C" : undefined }} />
      </div>
      {cur === 0 && max > 0 && <p key={seen.n} className="animate-shake mt-2 text-sm font-semibold text-danger">Down! Make death saves.</p>}

      {canEdit && mode === null && (
        <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
          <button type="button" onClick={() => setMode("damage")} className="h-12 rounded-xl border border-danger-line bg-danger-bg font-bold text-danger">Damage</button>
          <button type="button" onClick={() => setMode("heal")} className="h-12 rounded-xl border border-success-line bg-success-bg font-bold text-success">Heal</button>
          <button type="button" onClick={() => setMode("temp")} className="h-12 rounded-xl border border-line px-3 text-sm text-soft">Temp</button>
        </div>
      )}
      {canEdit && mode !== null && (
        <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="mt-4 flex gap-2">
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            placeholder={mode === "damage" ? "Damage taken" : mode === "heal" ? "HP healed" : "Temp HP"}
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-accent"
          />
          <button type="submit" disabled={pending || !value} className="h-12 rounded-xl bg-accent px-4 font-bold text-accent-text disabled:opacity-60">Apply</button>
          <button type="button" onClick={() => { setMode(null); setValue(""); }} className="h-12 rounded-xl border border-line px-3 text-sm text-soft">Cancel</button>
        </form>
      )}
    </section>
  );
}
