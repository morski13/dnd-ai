"use client";
// Damage per round, fight by fight (Whole campaign tab): the chart, then every fight as a table.
import { useState } from "react";
import type { FightRow } from "@/lib/stats-data";
import { DprChart } from "./charts";

type Char = { key: string; short: string; color: string };
const SHOW = 6;

export function DprSection({ fights, chars, focus }: { fights: FightRow[]; chars: Char[]; focus?: string }) {
  const [all, setAll] = useState(false);
  const mine = focus ? fights.filter((f) => f.dpr[focus] !== undefined) : fights;
  if (!mine.length) return <p className="text-sm text-muted">{focus ? "No fights with this character yet." : "No fights yet. Start one in Session mode or Fight mode."}</p>;
  const newest = [...mine].reverse();
  const shown = all ? newest : newest.slice(0, SHOW);
  const series = chars.map((c) => ({ key: c.key, name: c.short, color: c.color }));
  const cols = focus ? [] : chars.filter((c) => mine.some((f) => f.dpr[c.key] !== undefined));

  return (
    <div className="rounded-[18px] border border-line bg-surface p-3">
      {mine.length >= 2 ? (
        <DprChart fights={mine} series={series} focus={focus} />
      ) : (
        <p className="pb-2 text-sm text-muted">The chart appears after the second fight.</p>
      )}

      <div className="-mx-3 mt-3 overflow-x-auto px-3">
        <table className="w-full border-separate border-spacing-0 text-xs min-[360px]:text-[13px]">
          <caption className="sr-only">Damage per round in each fight, newest first</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="sticky left-0 bg-surface py-1.5 pr-2 text-left font-normal">Fight</th>
              {focus ? (
                <>
                  <th scope="col" className="px-1 py-1.5 text-right font-normal">DPR</th>
                  <th scope="col" className="py-1.5 pl-1 text-right font-normal">Dmg</th>
                </>
              ) : (
                <>
                  <th scope="col" className="px-1 py-1.5 text-right font-normal">Party</th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-normal md:hidden">Best</th>
                  {cols.map((c) => (
                    <th key={c.key} scope="col" className="hidden px-1 py-1.5 text-right font-normal md:table-cell">
                      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />{c.short}</span>
                    </th>
                  ))}
                </>
              )}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {shown.map((f) => {
              const best = Math.max(...Object.values(f.dpr));
              const top = cols.find((c) => f.dpr[c.key] === best);
              return (
                <tr key={f.combatId}>
                  <th scope="row" className="sticky left-0 max-w-[8.5rem] border-t border-line bg-surface py-1.5 pr-2 text-left font-normal">
                    <span className="block truncate text-text">{f.name}</span>
                    <span className="block text-[11px] text-muted">#{f.order}{f.sessionNumber !== null && ` · S${f.sessionNumber}`} · {f.rounds} rd{f.rounds === 1 ? "" : "s"}</span>
                  </th>
                  {focus ? (
                    <>
                      <td className="border-t border-line px-1 py-1.5 text-right font-bold text-text">{f.dpr[focus]}</td>
                      <td className="border-t border-line py-1.5 pl-1 text-right text-soft">{f.damage[focus]}</td>
                    </>
                  ) : (
                    <>
                      <td className="border-t border-line px-1 py-1.5 text-right font-bold text-text">{f.partyDpr}</td>
                      <td className="border-t border-line py-1.5 pl-2 text-right text-soft md:hidden">
                        {top && best > 0 ? (
                          <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: top.color }} />{top.short}
                            <span className="font-semibold text-text">{best}</span>
                          </span>
                        ) : <span className="text-muted">·</span>}
                      </td>
                      {cols.map((c) => {
                        const v = f.dpr[c.key];
                        return (
                          <td key={c.key} className={`hidden border-t border-line px-1 py-1.5 text-right md:table-cell ${v !== undefined && v === best && v > 0 ? "font-bold text-accent" : "text-soft"}`}>
                            {v === undefined ? <span className="text-muted">·</span> : v}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {newest.length > SHOW && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 h-9 text-xs font-semibold text-accent" aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${newest.length} fights`}
        </button>
      )}
      <p className="mt-1 text-[11px] leading-snug text-muted">Damage that landed in the fight ÷ its rounds. A dot means they weren&apos;t in that fight. On a phone the table shows the best of each fight; tap a character above for theirs.</p>
    </div>
  );
}
