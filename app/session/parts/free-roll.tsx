"use client";
// Dice roller: any dice, any time. Saved to the table log.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { freeRoll, type QuickRoll } from "../actions";
import { useDice } from "../../components/dice/dice-provider";
import { ResultLine } from "./bits";

const QUICK = ["1d20", "1d20 adv", "2d6", "1d8", "4d6kh3", "1d100"];

export function FreeRoll({ characterId, isDm }: { characterId: string | null; isDm: boolean }) {
  const router = useRouter();
  const [expr, setExpr] = useState("1d20");
  const [label, setLabel] = useState("");
  const [hidden, setHidden] = useState(false);
  const [last, setLast] = useState<QuickRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dice = useDice();

  function go(e = expr) {
    setError(null);
    start(async () => {
      const res = await freeRoll(e, label, characterId, hidden);
      if ("error" in res) return setError(res.error);
      await dice.show({ ...res, label: res.label });
      setLast(res);
      setTimeout(() => router.refresh(), 0); // update the log without keeping the button busy
    });
  }

  const input = "h-11 min-w-0 rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">Dice roller</span>
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="border-t border-line p-4">
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} type="button" disabled={pending} onClick={() => { setExpr(q); go(q); }}
              className="h-10 rounded-lg border border-line px-3 text-sm text-soft">{q}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go(); }} className="mt-2 grid grid-cols-[7rem_1fr_auto] gap-2">
          <input value={expr} onChange={(e) => setExpr(e.target.value)} className={input} aria-label="Dice" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What for? (optional)" className={input} />
          <button type="submit" disabled={pending} className="h-11 rounded-xl bg-accent px-4 font-bold text-accent-text disabled:opacity-50">Roll</button>
        </form>
        {isDm && (
          <label className="mt-1 flex min-h-11 items-center gap-3 text-sm text-soft">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-5 w-5 accent-[#E0913A]" />
            Secret roll
          </label>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {last && <div className="mt-2 rounded-xl bg-bg p-3"><ResultLine roll={last} /></div>}
        <p className="mt-2 text-xs text-muted">Examples: 2d6+3 · 4d6kh3 (keep highest 3) · 1d20+5 adv</p>
      </div>
    </details>
  );
}
