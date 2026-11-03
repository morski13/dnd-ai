"use client";
// "Who gets Healing Word?" / "Who do you attack?": pick who a roll goes to, right from the sheet.
// Out of a fight: the party (heals change HP, buffs are logged). In a fight: the enemies too, so attacks,
// damage and enemy spells land on the creature you pick. Players see how hurt a monster looks, not its HP.
import { useState } from "react";
import type { AimChoice } from "@/lib/targets";

export type Picked = string[]; // choice keys ("c:<id>" / "m:<id>"); [] = no target

const HEALTH: Record<AimChoice["health"], string> = { unhurt: "unhurt", hurt: "hurt", bloodied: "bloodied", down: "down" };

export function TargetPick({ title, heal, foe, many, max, choices, initial, onDone }: {
  title: string; heal: boolean; foe: boolean; many: boolean; max: number | null;
  choices: AimChoice[]; initial: string[];
  onDone: (p: Picked | null) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const enemies = choices.filter((c) => c.side === "enemy");
  // you first, then your side by name
  const friends = [...choices.filter((c) => c.side === "party" && c.me), ...choices.filter((c) => c.side === "party" && !c.me)];
  // attacks list the enemies first; heals and buffs your side first. Area spells can catch anyone.
  const groups: [string, AimChoice[]][] = foe
    ? [["Enemies", enemies], ...(many ? [["Your side", friends] as [string, AimChoice[]]] : [])]
    : [["Your side", friends]];
  const full = max != null && picked.length >= max;
  const tap = (k: string) => {
    if (!many) return setPicked([k]);
    if (picked.includes(k)) return setPicked(picked.filter((x) => x !== k));
    if (!full) setPicked([...picked, k]);
  };
  const names = picked.map((k) => { const c = choices.find((x) => x.key === k); return c?.me ? "you" : c?.name ?? "?"; });
  const verb = heal ? "Heal" : foe ? (many ? "Cast on" : "Attack") : "Cast on";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm sm:items-center" role="dialog" aria-modal aria-label={foe ? `Who does ${title} hit?` : `Who gets ${title}?`}
      onClick={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <div className="w-full max-w-sm rounded-t-3xl border border-line bg-surface-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">{heal ? "Heal" : foe ? "Target" : "Cast on"}</p>
        <p className="font-heading text-xl font-bold">{foe ? `Who does ${title} hit?` : `Who gets ${title}?`}</p>
        <p className="text-sm text-muted">
          {many ? (max != null ? `Pick up to ${max}.` : "Pick everyone in the area.") : "Pick one."}
          {heal ? " Their HP goes up right away." : foe ? " Hits and damage go on them." : " It's written in the log on them."}
        </p>

        <div className="mt-3 flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
          {groups.filter(([, list]) => list.length).map(([label, list]) => (
            <div key={label}>
              {groups.length > 1 && <p className="mb-1 text-xs uppercase tracking-[0.12em] text-muted">{label}</p>}
              <ul className="flex flex-col gap-1.5">
                {list.map((p) => {
                  const on = picked.includes(p.key);
                  const share = p.max ? Math.max(0, Math.min(1, (p.hp ?? 0) / p.max)) : null;
                  const down = p.health === "down";
                  return (
                    <li key={p.key}>
                      <button type="button" onClick={() => tap(p.key)} aria-pressed={on} disabled={!on && many && full}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-40 ${on ? (p.side === "enemy" ? "border-danger-line bg-danger-bg" : "border-accent-strong bg-accent-surface") : "border-line bg-bg"}`}>
                        <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center ${many ? "rounded-md" : "rounded-full"} border text-sm ${on ? "border-accent-strong bg-accent text-accent-text" : "border-line"}`}>{on ? "✓" : ""}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate font-semibold ${p.side === "enemy" ? "text-danger" : ""}`}>{p.me ? `${p.name} (you)` : p.name}</span>
                            {p.max ? (
                              <span className={`shrink-0 text-sm tabular-nums ${down ? "font-bold text-danger" : "text-soft"}`}>
                                {down ? "down · " : ""}{p.hp ?? "?"} / {p.max}{p.temp ? ` +${p.temp}` : ""}
                              </span>
                            ) : (
                              <span className={`shrink-0 text-xs ${down ? "font-bold text-danger" : "text-muted"}`}>{HEALTH[p.health]}</span>
                            )}
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
            </div>
          ))}
        </div>

        <button type="button" onClick={() => onDone(picked)} disabled={!picked.length}
          className="mt-3 h-12 w-full rounded-xl bg-accent px-4 text-[15px] font-bold text-accent-text disabled:opacity-40">
          {picked.length ? `${verb} ${names.join(", ")}` : "Pick someone"}
        </button>
        <div className="mt-2 flex justify-between gap-2 text-sm">
          <button type="button" onClick={() => onDone(null)} className="h-11 px-2 text-muted underline">Cancel</button>
          <button type="button" onClick={() => onDone([])} className="h-11 px-2 text-soft underline">{heal ? "Just roll, heal no one" : foe ? "Roll without a target" : "Cast without a target"}</button>
        </div>
      </div>
    </div>
  );
}
