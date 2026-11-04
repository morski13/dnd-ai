"use client";
// Pick a condition and how long it lasts: until removed, until the end / start of its next turn,
// 1 minute, N rounds, or "save ends" (a repeat save at the end of each of its turns). Used on the
// Session screen (DM, monster and turn cards) and on the character sheet in a fight.
import { useState } from "react";
import { CONDITIONS } from "@/lib/moderator/hp";
import type { DurationChoice } from "@/lib/engine/effects";

export type PickedEffect = {
  conditions: string[]; name?: string; duration: DurationChoice; rounds?: number;
  save?: { ability: string; dc: number } | null; sourceCombatantId?: string | null; concentration?: boolean;
};

const DURATIONS: { id: DurationChoice | "minute"; label: string }[] = [
  { id: "removed", label: "Until removed" },
  { id: "end_of_next_turn", label: "End of its next turn" },
  { id: "start_of_next_turn", label: "Start of its next turn" },
  { id: "minute", label: "1 minute" },
  { id: "rounds", label: "Rounds…" },
  { id: "save_ends", label: "Save ends" },
];
const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export function DurationPick({ have, others = [], onPick, onClose, pending }: {
  have: string[];
  /** who could have caused it (for "1 minute" counted on their turns, and concentration) */
  others?: { id: string; name: string }[];
  onPick: (p: PickedEffect) => void; onClose: () => void; pending: boolean;
}) {
  const [cond, setCond] = useState<string | null>(null);
  const [level, setLevel] = useState(1);
  const [dur, setDur] = useState<DurationChoice | "minute">("removed");
  const [rounds, setRounds] = useState("3");
  const [ability, setAbility] = useState("WIS");
  const [dc, setDc] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [conc, setConc] = useState(false);
  const real = cond === "Exhaustion" ? `Exhaustion ${level}` : cond;
  const saveOk = dur !== "save_ends" || Number(dc) > 0;

  const done = () => {
    if (!real || !saveOk) return;
    const d: DurationChoice = dur === "minute" ? "rounds" : dur;
    onPick({
      conditions: [real], name: name.trim() || undefined, duration: d,
      rounds: dur === "minute" ? 10 : dur === "rounds" ? Math.max(1, Number(rounds) || 1) : dur === "save_ends" ? 10 : undefined,
      save: dur === "save_ends" ? { ability, dc: Number(dc) } : null,
      sourceCombatantId: source || null, concentration: conc && !!source,
    });
  };

  return (
    <div className="mt-2 rounded-xl border border-line bg-bg p-2.5">
      <div className="grid grid-cols-3 gap-1.5">
        {CONDITIONS.filter((c) => c !== "Concentrating").map((c) => (
          <button key={c} type="button" onClick={() => setCond(c)} aria-pressed={cond === c} disabled={have.includes(c)}
            className={`h-9 rounded-lg border text-[11px] disabled:opacity-35 ${cond === c ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{c}</button>
        ))}
      </div>
      {cond === "Exhaustion" && (
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">Level
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-text">
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      {cond && (
        <>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted">How long</p>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="How long">
            {DURATIONS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={dur === d.id} onClick={() => setDur(d.id)}
                className={`h-9 rounded-full border px-3 text-xs ${dur === d.id ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{d.label}</button>
            ))}
          </div>
          {dur === "rounds" && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">Rounds
              <input inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value.replace(/\D/g, "").slice(0, 3))} className="h-9 w-16 rounded-lg border border-line bg-surface px-2 text-sm text-text" />
            </label>
          )}
          {dur === "save_ends" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <select aria-label="Save" value={ability} onChange={(e) => setAbility(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-text">
                {ABILITIES.map((a) => <option key={a}>{a}</option>)}
              </select>
              save DC
              <input inputMode="numeric" value={dc} onChange={(e) => setDc(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="15" className="h-9 w-14 rounded-lg border border-line bg-surface px-2 text-sm text-text" />
              <span>at the end of each of its turns (up to 1 minute)</span>
            </div>
          )}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="From what? (Hold Person, Web…) optional"
            className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
          {others.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <select aria-label="Who did it" value={source} onChange={(e) => setSource(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm text-text">
                <option value="">Who did it? (optional)</option>
                {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {source && (
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={conc} onChange={(e) => setConc(e.target.checked)} className="h-5 w-5 accent-accent" />ends with their concentration</label>
              )}
            </div>
          )}
        </>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={!real || !saveOk || pending} onClick={done} className="h-10 flex-1 rounded-lg bg-accent text-sm font-bold text-accent-text disabled:opacity-40">{real ? `Add ${real}` : "Pick a condition"}</button>
        <button type="button" onClick={onClose} className="h-10 px-3 text-sm text-muted">Close</button>
      </div>
    </div>
  );
}
