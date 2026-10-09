// Small building blocks shared by the stats views.
import type { Award } from "@/lib/stats/compute";
import { CountUp } from "../../components/count-up";

export const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
export const avg = (x: number | null) => (x === null ? "—" : x.toFixed(1));

export function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Tiles({ items }: { items: { label: string; value: string | number; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((t, i) => (
        <div key={t.label} className="animate-rise rounded-xl border border-line bg-surface px-2 py-3 text-center" style={{ "--i": i } as React.CSSProperties}>
          <p className="font-heading text-2xl font-bold leading-none text-text"><CountUp value={t.value} /></p>
          <p className="mt-1.5 text-[11px] leading-tight text-muted">{t.label}</p>
          {t.sub && <p className="mt-0.5 text-[11px] leading-tight text-soft">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export function Awards({ awards, colorOf }: { awards: Award[]; colorOf: (name: string) => string | undefined }) {
  if (!awards.length) return <p className="text-sm text-muted">No awards yet. Roll some dice!</p>;
  return (
    <ul className="grid grid-cols-2 gap-2">
      {awards.map((a, i) => (
        <li key={a.id} className="animate-flip rounded-2xl border border-[#5A4024] bg-accent-surface p-3" style={{ "--i": i } as React.CSSProperties}>
          <p className="text-2xl leading-none" aria-hidden>{a.emoji}</p>
          <p className="mt-2 text-sm font-bold leading-snug text-accent">{a.title}</p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted">{a.blurb}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-text">
            {a.winners.map((w) => (
              <span key={w} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorOf(w) }} />
                {w.split(" ")[0]}
              </span>
            ))}
          </p>
          <p className="text-xs text-soft">{a.value}</p>
        </li>
      ))}
    </ul>
  );
}

/** A ranked list with thin bars (most used attacks, spells…). */
export function CountList({ items, color, empty }: { items: [string, number][]; color: string; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map(([, n]) => n));
  return (
    <ul className="space-y-2">
      {items.map(([name, n]) => (
        <li key={name} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-soft">{name}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span className="bar-grow block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: color }} />
          </span>
          <span className="w-8 text-right font-semibold text-text">{n}</span>
        </li>
      ))}
    </ul>
  );
}
