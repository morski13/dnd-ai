"use client";
// "Who gets Healing Word?": pick who a heal or a buff goes to, right from the sheet (in or out of a fight).
// Healing changes their HP at once; a buff is only written in the log ("Bless → Orrin, Lyra").
import { useState } from "react";
import type { PartyMember } from "@/lib/targets";

export type Picked = string[]; // character ids; [] = cast it on no one

export function TargetPick({ title, heal, many, max, party, meId, initial, onDone }: {
  title: string; heal: boolean; many: boolean; max: number | null;
  party: PartyMember[]; meId: string; initial: string[];
  onDone: (p: Picked | null) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  // you first, then the others by name
  const people = [...party.filter((p) => p.id === meId), ...party.filter((p) => p.id !== meId)];
  const full = max != null && picked.length >= max;
  const tap = (id: string) => {
    if (!many) return setPicked([id]);
    if (picked.includes(id)) return setPicked(picked.filter((x) => x !== id));
    if (!full) setPicked([...picked, id]);
  };
  const names = picked.map((id) => (id === meId ? "you" : party.find((p) => p.id === id)?.name ?? "?"));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm sm:items-center" role="dialog" aria-modal aria-label={`Who gets ${title}?`}
      onClick={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <div className="w-full max-w-sm rounded-t-3xl border border-line bg-surface-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">{heal ? "Heal" : "Cast on"}</p>
        <p className="font-heading text-xl font-bold">Who gets {title}?</p>
        <p className="text-sm text-muted">
          {many ? (max != null ? `Pick up to ${max}.` : "Pick as many as you like.") : "Pick one."}
          {heal ? " Their HP goes up right away." : " It's written in the log on them."}
        </p>

        <ul className="mt-3 flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
          {people.map((p) => {
            const on = picked.includes(p.id);
            const share = p.max ? Math.max(0, Math.min(1, (p.hp ?? 0) / p.max)) : null;
            const down = p.hp === 0 && !!p.max;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => tap(p.id)} aria-pressed={on} disabled={!on && many && full}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-40 ${on ? "border-accent-strong bg-accent-surface" : "border-line bg-bg"}`}>
                  <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center ${many ? "rounded-md" : "rounded-full"} border text-sm ${on ? "border-accent-strong bg-accent text-accent-text" : "border-line"}`}>{on ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{p.id === meId ? `${p.name} (you)` : p.name}</span>
                      {p.max ? (
                        <span className={`shrink-0 text-sm tabular-nums ${down ? "font-bold text-danger" : "text-soft"}`}>
                          {down ? "down · " : ""}{p.hp ?? "?"} / {p.max}{p.temp ? ` +${p.temp}` : ""}
                        </span>
                      ) : null}
                    </span>
                    {share != null && (
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface">
                        <span className={`block h-full rounded-full ${share > 0.5 ? "bg-success" : share > 0.25 ? "bg-accent" : "bg-danger"}`} style={{ width: `${share * 100}%` }} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button type="button" onClick={() => onDone(picked)} disabled={!picked.length}
          className="mt-3 h-12 w-full rounded-xl bg-accent px-4 text-[15px] font-bold text-accent-text disabled:opacity-40">
          {picked.length ? `${heal ? "Heal" : "Cast on"} ${names.join(", ")}` : "Pick someone"}
        </button>
        <div className="mt-2 flex justify-between gap-2 text-sm">
          <button type="button" onClick={() => onDone(null)} className="h-11 px-2 text-muted underline">Cancel</button>
          <button type="button" onClick={() => onDone([])} className="h-11 px-2 text-soft underline">{heal ? "Just roll, heal no one" : "Cast without a target"}</button>
        </div>
      </div>
    </div>
  );
}
