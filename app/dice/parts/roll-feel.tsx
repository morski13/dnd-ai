"use client";
// Roll feel: sliders for how the dice are thrown. Saved on this device, used for every roll.
import { DEFAULT_TUNING, TUNING_FIELDS, TUNING_PRESETS, type DiceTuning } from "@/lib/dice3d/tuning";
import { useDice } from "../../components/dice/dice-provider";

const same = (a: DiceTuning, b: DiceTuning) => TUNING_FIELDS.every((f) => Math.abs(a[f.key] - b[f.key]) < 1e-9);

export function RollFeel({ onThrow }: { onThrow: (expr: string) => void }) {
  const { settings, setSettings } = useDice();
  const t = settings.tuning;
  const set = (patch: Partial<DiceTuning>) => setSettings({ ...settings, tuning: { ...t, ...patch } });

  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">Roll feel</h2>
        <button type="button" onClick={() => setSettings({ ...settings, tuning: DEFAULT_TUNING })} disabled={same(t, DEFAULT_TUNING)}
          className="h-10 rounded-lg px-2 text-xs font-semibold text-muted underline disabled:no-underline disabled:opacity-40">Reset</button>
      </div>
      <p className="mt-0.5 text-xs text-muted">How your dice are thrown, on this device. The result is always the real roll, whatever you set.</p>

      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Roll feel presets">
        {TUNING_PRESETS.map((p) => {
          const on = same(t, p.tuning);
          return (
            <button key={p.name} type="button" aria-pressed={on} onClick={() => setSettings({ ...settings, tuning: p.tuning })}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left ${on ? "border-accent bg-accent-surface" : "border-line bg-surface"}`}>
              <span className={`block text-sm font-bold ${on ? "text-accent" : "text-text"}`}>{p.name}</span>
              <span className="block text-[11px] text-muted">{p.blurb}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-3 rounded-2xl border border-line bg-surface p-4">
        {TUNING_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="flex items-baseline justify-between text-sm">
              <span className="text-soft">{f.label}</span>
              <span className="tabular font-semibold text-text">{f.show(t[f.key])}</span>
            </span>
            <input
              type="range" min={f.min} max={f.max} step={f.step} value={t[f.key]}
              onChange={(e) => set({ [f.key]: Number(e.target.value) })}
              aria-label={f.label}
              className="mt-1 w-full accent-[var(--color-accent)]"
            />
          </label>
        ))}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[["d20", "1d20"], ["Adv", "2d20kh1"], ["Fireball", "8d6"]].map(([label, expr]) => (
            <button key={expr} type="button" onClick={() => onThrow(expr)} className="h-11 rounded-xl bg-accent text-sm font-bold text-accent-text">
              Throw {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
