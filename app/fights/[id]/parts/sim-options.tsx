"use client";
// How the fights are simulated: with each character's real dice (or plain sheet odds), and how many times.
export const RUN_CHOICES = [1000, 2000, 5000];

export function SimOptions({ real, onReal, runs, onRuns, who }: {
  real: boolean; onReal: (v: boolean) => void; runs: number; onRuns: (n: number) => void;
  who: { name: string; label: string }[];
}) {
  return (
    <section className="mt-3 rounded-2xl border border-line bg-surface p-3" aria-label="Simulation">
      <div className="grid grid-cols-2 rounded-xl bg-bg p-1">
        {[{ v: true, l: "Their real dice" }, { v: false, l: "Average dice" }].map((o) => (
          <button key={String(o.v)} type="button" aria-pressed={real === o.v} onClick={() => onReal(o.v)}
            className={`h-9 rounded-lg text-sm ${real === o.v ? "bg-surface font-bold" : "text-muted"}`}>{o.l}</button>
        ))}
      </div>
      {real && who.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {who.map((w) => <li key={w.name}><b className="text-soft">{w.name}</b>: {w.label}</li>)}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span>Fights simulated</span>
        <div className="ml-auto flex gap-1">
          {RUN_CHOICES.map((n) => (
            <button key={n} type="button" aria-pressed={runs === n} onClick={() => onRuns(n)}
              className={`h-8 rounded-lg border px-2.5 ${runs === n ? "border-accent-strong font-bold text-text" : "border-line"}`}>{n.toLocaleString()}</button>
          ))}
        </div>
      </div>
    </section>
  );
}
