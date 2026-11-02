"use client";
// "Confirm your numbers": the paper sheet said one thing, the app works out another. One tap each, then it's gone.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ConfirmRow } from "@/lib/sheet-confirm";
import { confirmNumber } from "../actions";

export function ConfirmNumbers({ characterId, rows }: { characterId: string; rows: ConfirmRow[] }) {
  const router = useRouter();
  const [left, setLeft] = useState(rows);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!left.length) return null;
  const pick = (r: ConfirmRow, use: "sheet" | "app") => start(async () => {
    setError(null);
    const res = await confirmNumber(characterId, r.key, use);
    if ("error" in res) return setError(res.error);
    setLeft((l) => l.filter((x) => x.key !== r.key));
    router.refresh();
  });
  return (
    <section className="mt-3 rounded-2xl border border-line bg-surface p-4" aria-label="Confirm your numbers">
      <p className="font-semibold">Confirm your numbers <span className="ml-1 rounded-full bg-bg px-2 py-0.5 text-xs font-normal text-muted">{left.length} to confirm</span></p>
      <p className="text-sm text-muted">Your paper sheet and the app don&apos;t agree on these. Pick the right one once.</p>
      <ul className="mt-3 flex flex-col gap-3">
        {left.map((r) => (
          <li key={r.key} className="rounded-xl bg-bg p-3">
            <p className="font-semibold">{r.label}: sheet {r.sheet} · app {r.app}</p>
            <p className="mt-0.5 text-sm text-soft">{r.why}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={pending} onClick={() => pick(r, "sheet")} className="h-11 rounded-xl border border-line text-sm font-semibold text-soft">Use sheet ({r.sheet})</button>
              <button type="button" disabled={pending} onClick={() => pick(r, "app")} className="h-11 rounded-xl border border-line text-sm font-semibold text-soft">Keep app ({r.app})</button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
