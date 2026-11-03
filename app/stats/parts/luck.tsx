"use client";
// Luck index on the Whole campaign tab: a bar per row out from "average luck" (50), and, when the
// table has used real dice, app dice (filled dot) vs real dice (ring) on the same scale.
// Rows are characters (party view, with a roll-group switch) or roll groups (one character).
// Tap or hover a row for its numbers; "Show as table" lists them all.
import { useMemo, useState } from "react";
import {
  LUCK_CATS, LUCK_CAT_LABEL, compareDice, compareLine, verdictLine,
  type LuckBreakdown, type LuckCat, type LuckCell,
} from "@/lib/stats/luck";

type Row = { key: string; label: string; color: string; both: LuckCell; app: LuckCell; real: LuckCell };

const fmt = (x: number | null) => (x === null ? "—" : String(Math.round(x)));
const sign = (x: number) => (x > 0 ? `+${x}` : String(x));

/** Party view: one row per character, switch between all d20s, attacks, saves and checks. */
export function PartyLuck({ chars, byChar, party, hasReal }: {
  chars: { key: string; short: string; color: string }[];
  byChar: Record<string, LuckBreakdown>;
  party: LuckBreakdown;
  hasReal: boolean;
}) {
  const [cat, setCat] = useState<LuckCat>("all");
  const rows: Row[] = chars.filter((c) => byChar[c.key]).map((c) => ({ key: c.key, label: c.short, color: c.color, ...byChar[c.key][cat] }));
  const p = party[cat];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Which rolls">
        {LUCK_CATS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={c === cat}
            onClick={() => setCat(c)}
            className={`h-9 rounded-full border px-3 text-xs font-semibold ${c === cat ? "border-accent bg-accent-surface text-accent" : "border-line text-muted"}`}
          >
            {LUCK_CAT_LABEL[c]}
          </button>
        ))}
      </div>
      <Summary title="Whole table" cell={p.both} app={p.app} real={p.real} hasReal={hasReal} />
      <LuckChart rows={rows} hasReal={hasReal} what={LUCK_CAT_LABEL[cat].toLowerCase()} rowWord="Who" />
    </div>
  );
}

/** One character: a row per roll group. */
export function CharacterLuck({ luck, color, name, hasReal }: { luck: LuckBreakdown; color: string; name: string; hasReal: boolean }) {
  const rows: Row[] = LUCK_CATS.map((c) => ({ key: c, label: c === "all" ? "All" : LUCK_CAT_LABEL[c], color, ...luck[c] }));
  const showReal = hasReal || luck.all.real.n > 0;
  return (
    <div>
      <Summary title={name} cell={luck.all.both} app={luck.all.app} real={luck.all.real} hasReal={showReal} big />
      <LuckChart rows={rows} hasReal={showReal} what="rolls" rowWord="Rolls" />
    </div>
  );
}

function Summary({ title, cell, app, real, hasReal, big }: { title: string; cell: LuckCell; app: LuckCell; real: LuckCell; hasReal: boolean; big?: boolean }) {
  const cmp = compareDice(app, real);
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="text-muted">{title}</span>
        <span className={`${big ? "text-2xl" : "text-lg"} font-bold leading-tight text-text`}>{fmt(cell.index)}</span>
        {cell.avg !== null && cell.expected !== null && (
          <span className="text-xs text-soft">avg d20 {cell.avg.toFixed(1)} (expected {cell.expected.toFixed(1)}) · {cell.n} rolls</span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-soft">{verdictLine(cell)}</p>
      {hasReal && <p className="mt-1 text-xs text-soft">{compareLine(cmp, app, real)}</p>}
    </div>
  );
}

function LuckChart({ rows, hasReal, what, rowWord }: { rows: Row[]; hasReal: boolean; what: string; rowWord: string }) {
  const [active, setActive] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  // Symmetric scale around 50, wide enough for every value (at least ±10).
  const r = useMemo(() => {
    const vals = rows.flatMap((x) => [x.both.index, x.app.index, x.real.index]).filter((v): v is number => v !== null);
    const dev = Math.max(0, ...vals.map((v) => Math.abs(v - 50)));
    return Math.min(50, Math.max(10, Math.ceil(dev / 10) * 10));
  }, [rows]);
  const pos = (v: number) => `${((v - (50 - r)) / (2 * r)) * 100}%`;

  if (!rows.some((x) => x.both.n)) return <p className="py-6 text-center text-sm text-muted">No {what} rolled yet.</p>;
  const act = rows.find((x) => x.key === active) ?? null;

  const rowProps = (x: Row) => ({
    onPointerEnter: () => setActive(x.key),
    onFocus: () => setActive(x.key),
    onClick: () => setActive(x.key),
    "aria-pressed": active === x.key,
  });

  return (
    <div className="mt-3">
      {/* Luck index: bars out from 50 */}
      <div role="group" aria-label={`Luck index, ${what}. 50 is average luck.`} onPointerLeave={() => setActive(null)}>
        {rows.map((x) => {
          const v = x.both.index;
          const few = x.both.verdict === "few";
          return (
            <button
              key={x.key}
              type="button"
              {...rowProps(x)}
              aria-label={`${x.label}: luck ${fmt(v)}, ${x.both.n} rolls. ${verdictLine(x.both)}`}
              className={`grid w-full grid-cols-[4.25rem_1fr_2.5rem] items-center gap-2 rounded-lg px-1 py-1 text-left ${active === x.key ? "bg-surface-2" : ""}`}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-soft">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.color }} />
                <span className="truncate">{x.label}</span>
              </span>
              <span className="relative block h-7">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                {v !== null && (
                  <span
                    className="absolute top-1/2 h-2.5 -translate-y-1/2"
                    style={{
                      left: v >= 50 ? "50%" : pos(v),
                      right: v >= 50 ? `calc(100% - ${pos(v)})` : "50%",
                      minWidth: 2,
                      background: x.color,
                      opacity: few ? 0.45 : 1,
                      borderRadius: v >= 50 ? "0 4px 4px 0" : "4px 0 0 4px",
                    }}
                  />
                )}
              </span>
              <span className={`text-right text-[13px] font-bold tabular-nums ${few ? "text-muted" : "text-text"}`}>{fmt(v)}</span>
            </button>
          );
        })}
        <Axis r={r} />
      </div>

      {/* App dice vs real dice */}
      {hasReal && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-bold">App dice vs real dice</p>
            <ul className="flex gap-3 text-xs text-soft" aria-label="Legend">
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-soft" />App</li>
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-soft" />Real</li>
            </ul>
          </div>
          <div className="mt-1" role="group" aria-label={`App dice vs real dice, ${what}`} onPointerLeave={() => setActive(null)}>
            {rows.map((x) => {
              const a = x.app.index, b = x.real.index;
              return (
                <button
                  key={x.key}
                  type="button"
                  {...rowProps(x)}
                  aria-label={`${x.label}: app dice ${fmt(a)} (${x.app.n} rolls), real dice ${fmt(b)} (${x.real.n} rolls)`}
                  className={`grid w-full grid-cols-[4.25rem_1fr_2.5rem] items-center gap-2 rounded-lg px-1 py-1 text-left ${active === x.key ? "bg-surface-2" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-soft">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.color }} />
                    <span className="truncate">{x.label}</span>
                  </span>
                  <span className="relative block h-7">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                    {a !== null && b !== null && (
                      <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted/60" style={{ left: pos(Math.min(a, b)), right: `calc(100% - ${pos(Math.max(a, b))})` }} />
                    )}
                    {b !== null && (
                      <span
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface"
                        style={{ left: pos(b), borderColor: x.color, opacity: x.real.verdict === "few" ? 0.5 : 1, boxShadow: "0 0 0 2px var(--color-surface)" }}
                      />
                    )}
                    {a !== null && (
                      <span
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ left: pos(a), background: x.color, opacity: x.app.verdict === "few" ? 0.5 : 1, boxShadow: "0 0 0 2px var(--color-surface)" }}
                      />
                    )}
                  </span>
                  <span className="text-right text-[11px] tabular-nums text-muted">
                    {a !== null && b !== null ? sign(Math.round(a - b)) : ""}
                  </span>
                </button>
              );
            })}
            <Axis r={r} />
          </div>
        </div>
      )}

      {/* The numbers for the row you're on */}
      <div className="mt-3 min-h-[3.25rem] rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs" aria-live="polite">
        {act ? (
          <>
            <p className="text-text">
              <span className="font-semibold">{act.label}</span>
              <span className="text-soft"> · luck </span><span className="font-bold">{fmt(act.both.index)}</span>
              {act.both.avg !== null && <span className="text-soft"> · avg d20 {act.both.avg.toFixed(1)} vs {act.both.expected!.toFixed(1)} · {act.both.n} rolls</span>}
            </p>
            <p className="mt-0.5 text-soft">{verdictLine(act.both)}</p>
            {hasReal && (
              <p className="mt-0.5 text-soft">
                App {fmt(act.app.index)} ({act.app.n}) · Real {fmt(act.real.index)} ({act.real.n}). {compareLine(compareDice(act.app, act.real), act.app, act.real)}
              </p>
            )}
          </>
        ) : (
          <p className="text-muted">Tap a row for its numbers. 50 is average luck; faded bars have fewer than 10 rolls.</p>
        )}
      </div>

      <button type="button" onClick={() => setTable((t) => !t)} className="mt-2 h-9 text-xs font-semibold text-accent underline-offset-2 hover:underline" aria-expanded={table}>
        {table ? "Hide table" : "Show as table"}
      </button>
      {table && (
        <div className="-mx-3 overflow-x-auto px-3">
          <table className="w-full text-xs">
            <caption className="sr-only">Luck index, {what}</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1.5 pr-2 text-left font-normal">{rowWord}</th>
                <th scope="col" className="px-1 py-1.5 text-right font-normal">Luck</th>
                <th scope="col" className="px-1 py-1.5 text-right font-normal">Avg d20</th>
                <th scope="col" className="px-1 py-1.5 text-right font-normal">Rolls</th>
                {hasReal && <th scope="col" className="px-1 py-1.5 text-right font-normal">App</th>}
                {hasReal && <th scope="col" className="py-1.5 pl-1 text-right font-normal">Real</th>}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((x) => (
                <tr key={x.key} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-soft">{x.label}</th>
                  <td className="px-1 py-1.5 text-right font-bold text-text">{fmt(x.both.index)}</td>
                  <td className="px-1 py-1.5 text-right text-soft">{x.both.avg === null ? "—" : `${x.both.avg.toFixed(1)} / ${x.both.expected!.toFixed(1)}`}</td>
                  <td className="px-1 py-1.5 text-right text-soft">{x.both.n}</td>
                  {hasReal && <td className="px-1 py-1.5 text-right text-soft">{fmt(x.app.index)} <span className="text-muted">({x.app.n})</span></td>}
                  {hasReal && <td className="py-1.5 pl-1 text-right text-soft">{fmt(x.real.index)} <span className="text-muted">({x.real.n})</span></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Axis({ r }: { r: number }) {
  return (
    <div className="grid grid-cols-[4.25rem_1fr_2.5rem] gap-2 px-1 text-[11px] text-muted" aria-hidden>
      <span />
      <span className="relative block h-8 border-t border-line tabular-nums">
        <span className="absolute left-0 top-1">{50 - r}</span>
        <span className="absolute left-1/2 top-1 -translate-x-1/2">50</span>
        <span className="absolute right-0 top-1">{50 + r}</span>
        <span className="absolute left-0 top-4">← unluckier</span>
        <span className="absolute right-0 top-4">luckier →</span>
      </span>
      <span />
    </div>
  );
}
