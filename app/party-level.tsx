"use client";
// DM, on Home: the party's level, and "Level up the party": every player then sees "Level up to N"
// on their Home and their sheet (their saved level-up plan is already filled in).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { partyLevelUp } from "./campaign-actions";

export function PartyLevelCard({ campaignId, level, target = null, party = [] }: {
  campaignId: string; level: number | null;
  /** the level announced with "Level up the party", and everyone's level now (who has finished) */
  target?: number | null; party?: { id: string; name: string; level: number }[];
}) {
  const router = useRouter();
  const [to, setTo] = useState(Math.min(20, (level ?? 0) + 1) || 1);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    setMsg(null);
    const r = await partyLevelUp(campaignId, to);
    if ("error" in r) setMsg(r.error);
    else { setMsg(`Done: the party is level ${r.to}. Your players see "Level up" on their Home and sheet.`); router.refresh(); }
  });
  return (
    <section className="mt-5 rounded-2xl border border-line bg-surface-2 p-4 lg:p-6" aria-label="Party level">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Party level</p>
          <p className="font-heading text-2xl font-bold">{level ?? "Not set"}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-soft">
          <span>Level up to</span>
          <select value={to} onChange={(e) => setTo(Number(e.target.value))} aria-label="New party level"
            className="h-11 shrink-0 rounded-xl border border-line bg-bg px-2 font-bold text-text">
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" onClick={go} disabled={pending || to === level}
          className="h-11 shrink-0 rounded-xl bg-accent px-4 font-bold text-accent-text disabled:opacity-40">{pending ? "Saving…" : "Level up the party"}</button>
      </div>
      {msg && <p className="mt-2 text-sm text-soft" role="status">{msg}</p>}
      {target && party.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted">Level {target}: {party.filter((c) => c.level >= target).length} of {party.length} done</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {party.map((c) => (
              <li key={c.id} className={`rounded-full border px-2.5 py-1 text-xs ${c.level >= target ? "border-success-line bg-success-bg text-success" : "border-line text-muted"}`}>
                {c.level >= target ? "✓ " : ""}{c.name} {c.level}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
