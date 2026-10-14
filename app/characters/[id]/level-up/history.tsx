"use client";
// Level history (go back to any earlier level) and level down for characters without a saved history.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { goBackTo, levelDownClass } from "./actions";

export type HistoryEntry = { className: string; level: number; kind?: "up" | "down"; at: string; summary: string[] };

export function LevelHistory({ characterId, entries, classes, total }: {
  characterId: string; entries: HistoryEntry[]; classes: { className: string; level: number }[]; total: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const label = (e: HistoryEntry) => (e.kind === "down" ? `Level down: ${e.className} ${e.level} → ${e.level - 1 || "removed"}` : `${e.className} ${e.level}`);
  const when = (s: string) => new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const back = (i: number) => {
    const e = entries[i];
    const later = entries.length - 1 - i;
    if (!confirm(`Go back to before "${label(e)}"?${later ? ` The ${later} later change${later > 1 ? "s" : ""} will be undone too.` : ""}`)) return;
    start(async () => { const r = await goBackTo(characterId, i); setMsg("error" in r ? { ok: false, lines: [r.error] } : { ok: true, lines: [`Undone: ${r.undone}.`] }); router.refresh(); });
  };
  const down = (cls: string, lvl: number) => {
    if (!confirm(`Take a level off ${cls} (${lvl} → ${lvl - 1 || "removed"})? You can undo it from the history.`)) return;
    start(async () => { const r = await levelDownClass(characterId, cls); setMsg("error" in r ? { ok: false, lines: [r.error] } : { ok: true, lines: r.notes }); router.refresh(); });
  };

  return (
    <section className="mt-8" aria-label="Level history">
      <h2 className="text-xs uppercase tracking-[0.12em] text-muted">Level history</h2>
      {entries.length === 0 ? <p className="mt-2 text-sm text-muted">No level-ups made in the app yet.</p> : (
        <ol className="mt-2 flex flex-col gap-2">
          {entries.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
            <li key={e.at + i} className="rounded-xl border border-line bg-surface px-3 py-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="min-w-0 flex-1 text-left">
                  <span className="block font-semibold">{label(e)}</span>
                  <span className="block text-xs text-muted">{when(e.at)}</span>
                </button>
                <button type="button" disabled={pending} onClick={() => back(i)} className="h-9 shrink-0 rounded-lg border border-line px-2.5 text-xs text-soft">
                  Go back to before this
                </button>
              </div>
              {open === i && <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-sm text-soft">{e.summary.map((s) => <li key={s}>• {s}</li>)}</ul>}
            </li>
          ))}
        </ol>
      )}
      {total > 1 && (
        <details className="mt-3 rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm text-soft">Level down {entries.length ? "(without the history)" : ""}</summary>
          <p className="mt-1 text-xs text-muted">
            {entries.length ? "Going back in the history above is exact. Use this only for levels from before the history." : "Takes one level off a class: its features from that level, the average hit points, spell slots and uses."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {classes.map((c) => (
              <button key={c.className} type="button" disabled={pending} onClick={() => down(c.className, c.level)}
                className="h-10 rounded-lg border border-danger-line px-3 text-sm text-danger">{c.className} {c.level} → {c.level - 1 || "remove"}</button>
            ))}
          </div>
        </details>
      )}
      {msg && <ul className={`mt-2 space-y-0.5 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`} role="status">{msg.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    </section>
  );
}
