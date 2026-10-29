"use client";
// The story at a glance: what must happen no matter what the party does, the milestones in order, and the quests.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Analysis, Milestone } from "@/lib/reader/types";
import { LockIcon } from "../../components/icons";
import { setStatus } from "../actions";

export function Story({ analysis, isDm, q }: { analysis: Analysis; isDm: boolean; q: string }) {
  const label = new Map(analysis.nodes.map((n) => [n.id, n.label]));
  const milestones = analysis.milestones.filter((m) => m.kind === "milestone");
  const quests = analysis.milestones.filter((m) => m.kind === "quest");
  return (
    <div className="flex flex-col gap-6">
      {isDm && (
        <section aria-label="Must happen">
          <h2 className="font-heading text-2xl font-bold">Must happen</h2>
          <p className="mt-0.5 text-sm text-muted">Whatever the party does. Picked from your session plans and milestones.</p>
          {analysis.mustHappen.length === 0 ? (
            <Empty text="Nothing yet. Add a “Must happen” list to a session plan, or write milestones in Goals & milestones." />
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {analysis.mustHappen.map((p, i) => (
                <li key={i} className="animate-rise flex gap-3 rounded-2xl border border-line bg-surface p-3" style={{ "--i": i } as React.CSSProperties}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-surface text-sm font-bold text-accent">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug">{p.text}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <Link href={`/campaign/e/${p.docId}${q}`} className="inline-block py-2 underline">{p.why}</Link>
                      {p.secret && <span className="flex items-center gap-0.5 text-accent"><LockIcon className="h-3 w-3" />DM only</span>}
                      {p.nodes.slice(0, 3).map((id) => <span key={id}>· {label.get(id)}</span>)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {isDm && (
        <section aria-label="Milestones">
          <h2 className="font-heading text-2xl font-bold">Milestones</h2>
          <p className="mt-0.5 text-sm text-muted">In story order, from the timing in your notes (“before session 6”, “final act”…).</p>
          {milestones.length === 0 ? <Empty text="No milestones yet. In Goals & milestones, start a document's title with “Milestone:”." /> : (
            <ol className="relative mt-3 ml-3 border-l-2 border-line pl-5">
              {milestones.map((m, i) => <MilestoneItem key={m.id} m={m} i={i} isDm={isDm} q={q} />)}
            </ol>
          )}
        </section>
      )}

      <section aria-label="Quests">
        <h2 className="font-heading text-2xl font-bold">Quests</h2>
        {quests.length === 0 ? <Empty text={isDm ? "No quests yet. Add them in Goals & milestones." : "No quests shared yet."} /> : (
          <ul className="mt-3 flex flex-col gap-2">
            {quests.map((m, i) => <QuestItem key={m.id} m={m} i={i} isDm={isDm} q={q} />)}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted">
        Read by the free smart reader: {analysis.stats.docs} documents, {analysis.stats.words.toLocaleString("en-US")} words. It only uses what&apos;s written in
        {isDm ? " your notes" : " the notes the DM shared"} and never makes anything up. It updates every time you open this page.
      </p>
    </div>
  );
}

function Check({ m, isDm }: { m: Milestone; isDm: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState(m.status === "done");
  const [, start] = useTransition();
  return (
    <button type="button" role="checkbox" aria-checked={done} aria-label={`${m.title}: ${done ? "done" : "not done yet"}`} disabled={!isDm}
      onClick={() => { const next = !done; setDone(next); start(async () => { await setStatus(m.docId, next ? "done" : "open"); router.refresh(); }); }}
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 after:absolute after:-inset-2 after:content-[''] ${done ? "animate-pop border-success bg-success text-bg" : "border-line text-transparent"}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3}><path d="m5 12 5 5 9-10" /></svg>
    </button>
  );
}

function MilestoneItem({ m, i, isDm, q }: { m: Milestone; i: number; isDm: boolean; q: string }) {
  const done = m.status === "done";
  return (
    <li className="animate-rise relative mb-4 last:mb-0" style={{ "--i": i } as React.CSSProperties}>
      <span className={`absolute -left-[29px] top-1.5 h-3.5 w-3.5 rounded-full border-2 ${done ? "border-success bg-success" : i === 0 ? "border-accent bg-accent" : "border-line bg-bg"}`} />
      <div className="rounded-2xl border border-line bg-surface p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {m.when && <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">{m.when}</p>}
            <Link href={`/campaign/e/${m.docId}${q}`} className={`block py-1.5 font-semibold leading-snug ${done ? "text-muted line-through" : ""}`}>{m.title}</Link>
          </div>
          <Check m={m} isDm={isDm} />
        </div>
        {m.steps.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-soft">
            {m.steps.map((s, j) => <li key={j} className="flex gap-2"><span className="text-muted">•</span><span>{s.text}</span></li>)}
          </ul>
        )}
      </div>
    </li>
  );
}

function QuestItem({ m, i, isDm, q }: { m: Milestone; i: number; isDm: boolean; q: string }) {
  const done = m.status === "done";
  return (
    <li className="animate-rise rounded-2xl border border-line bg-surface p-3" style={{ "--i": i } as React.CSSProperties}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/campaign/e/${m.docId}${q}`} className={`block py-1.5 font-semibold leading-snug ${done ? "text-muted line-through" : ""}`}>{m.title}</Link>
          <p className="mt-0.5 text-xs text-muted">
            {m.givenBy && <>From {m.givenBy}</>}{m.givenBy && m.reward && " · "}{m.reward && <>Reward: {m.reward}</>}
            {isDm && m.secret && <span className="ml-1 inline-flex items-center gap-0.5 text-accent"><LockIcon className="h-3 w-3" />not shared</span>}
          </p>
        </div>
        {isDm ? <Check m={m} isDm /> : <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${done ? "bg-success-bg text-success" : "bg-accent-surface text-accent"}`}>{done ? "Done" : "Open"}</span>}
      </div>
      {m.steps.length > 0 && !done && (
        <ul className="mt-2 space-y-1 text-sm text-soft">
          {m.steps.map((s, j) => (
            <li key={j} className="flex gap-2"><span className="text-muted">•</span><span>{s.text}{s.secret && <LockIcon className="ml-1 inline h-3 w-3 text-accent" aria-label="DM only" />}</span></li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mt-3 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">{text}</p>;
}
