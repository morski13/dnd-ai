"use client";
// Session Wrapped on screen: the shared story player with the two slides you can do something on
// (the Moment of the night vote, the DM's teaser) and the closing slide's links.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { MOMENT_EMOJI, type SessionSlide, type Tally, type VoteMoment } from "@/lib/stats/session-wrapped";
import { createClient } from "@/lib/supabase/client";
import type { Card } from "../../components/share-card";
import { saveTeaser, voteMoment } from "./actions";
import { WrappedStory } from "./story";

export function SessionWrappedStory({ sessionId, number, campaign, slides, moments, tally, votesReady, isDm, teaser }: {
  sessionId: string; number: number; campaign: string;
  slides: SessionSlide[]; moments: VoteMoment[]; tally: Tally; votesReady: boolean; isDm: boolean; teaser: string | null;
}) {
  const router = useRouter();
  // seen: Home and the "ready" toast stop offering this one
  useEffect(() => { try { localStorage.setItem(`wrapped-opened:${sessionId}`, "1"); } catch { /* private window */ } }, [sessionId]);
  // other people's votes and the DM's teaser arrive live
  useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (t) clearTimeout(t); t = setTimeout(() => router.refresh(), 300); };
    const ch = supabase.channel(`wrapped-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "session_votes", filter: `session_id=eq.${sessionId}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, refresh)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [sessionId, router]);

  const winner = moments.find((m) => m.key === tally.winner) ?? null;
  const card = (s: SessionSlide): Card | null => {
    if (s.kind === "end") return null;
    if (s.kind === "vote") return winner ? { kicker: `Session ${number} · Moment of the night`, big: String(tally.counts[winner.key] ?? 0), emoji: MOMENT_EMOJI[winner.kind], title: winner.text, sub: `${tally.counts[winner.key] === 1 ? "vote" : "votes"} out of ${tally.total}`, campaign } : null;
    if (s.kind === "teaser") return teaser ? { kicker: `Next time on ${campaign}`, big: "…", emoji: "📜", title: `Session ${number + 1}`, sub: teaser, campaign } : null;
    return { kicker: s.kicker, big: s.big, title: s.title, sub: s.sub, emoji: s.emoji, name: s.kind === "hero" || s.kind === "mvp" ? undefined : s.who ?? undefined, campaign, portrait: s.portrait ?? null };
  };
  const body = (s: SessionSlide) => {
    if (s.kind === "vote") return <Vote sessionId={sessionId} moments={moments} tally={tally} ready={votesReady} />;
    if (s.kind === "teaser" && isDm) return <Teaser sessionId={sessionId} initial={teaser} />;
    if (s.kind === "end") return <End number={number} />;
    return undefined;
  };
  return <WrappedStory slides={slides} campaign={campaign} body={body} card={card} />;
}

function Vote({ sessionId, moments, tally, ready }: { sessionId: string; moments: VoteMoment[]; tally: Tally; ready: boolean }) {
  // my change, until the server's tally catches up (a newer tally from the server wins)
  const [own, setOwn] = useState<{ base: string | null; v: string | null } | null>(null);
  const mine = own && own.base === tally.mine ? own.v : tally.mine;
  const setMine = (v: string | null) => setOwn({ base: tally.mine, v });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // counts with my own change applied straight away
  const counts = { ...tally.counts };
  if (tally.mine) counts[tally.mine] = (counts[tally.mine] ?? 1) - 1;
  if (mine) counts[mine] = (counts[mine] ?? 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const top = Math.max(0, ...Object.values(counts));
  const pick = (key: string) => start(async () => {
    setError(null);
    const next = mine === key ? null : key;
    const before = mine;
    setMine(next);
    const r = await voteMoment(sessionId, next);
    if ("error" in r) { setMine(before); setError(r.error); }
  });

  return (
    <div className="flex h-full flex-col">
      <p className="font-heading text-2xl font-bold">Which moment was the best?</p>
      <p className="mt-1 text-sm text-soft">{ready ? `One vote each, change it any time · ${total} vote${total === 1 ? "" : "s"} so far` : "Voting starts once the DM runs the database update (SQL 32)."}</p>
      <ul className="mt-3 flex flex-col gap-2 overflow-y-auto pr-0.5">
        {moments.map((m) => {
          const n = counts[m.key] ?? 0;
          const lead = n > 0 && n === top;
          return (
            <li key={m.key}>
              <button type="button" disabled={!ready || pending} onClick={() => pick(m.key)} aria-pressed={mine === m.key}
                className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm leading-snug disabled:opacity-70 ${mine === m.key ? "border-accent bg-accent-surface" : "border-line bg-surface"}`}>
                <span aria-hidden className="absolute inset-y-0 left-0 bg-accent/15 transition-[width] duration-300" style={{ width: total ? `${(n / total) * 100}%` : 0 }} />
                <span className="relative flex items-start gap-2">
                  <span aria-hidden>{MOMENT_EMOJI[m.kind]}</span>
                  <span className="min-w-0 flex-1">{m.text}</span>
                  <span className="shrink-0 text-xs font-bold text-accent">{lead ? "★ " : ""}{n || ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {mine && <p className="mt-2 text-xs text-muted">Your vote is in. Tap it again to take it back.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function Teaser({ sessionId, initial }: { sessionId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? "");
  const [editing, setEditing] = useState(!initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError(null);
    const r = await saveTeaser(sessionId, text);
    if ("error" in r) return setError(r.error);
    setSaved(r.teaser); setText(r.teaser ?? ""); setEditing(!r.teaser);
  });
  if (!editing && saved) {
    return (
      <div>
        <p className="font-heading text-2xl font-bold leading-snug [overflow-wrap:anywhere]">{saved}</p>
        <button type="button" onClick={() => setEditing(true)} className="mt-4 h-10 rounded-xl border border-line px-4 text-sm font-semibold text-soft">Edit the teaser</button>
        <p className="mt-2 text-xs text-muted">Everyone at the table sees this slide.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <label htmlFor="teaser" className="font-heading text-2xl font-bold">Leave them wanting more</label>
      <p className="mt-1 text-sm text-soft">A line or two about next session. Players only see this slide once it&apos;s written.</p>
      <textarea id="teaser" value={text} maxLength={400} rows={4} onChange={(e) => setText(e.target.value)}
        placeholder="The bells of the abbey ring at midnight… and nobody is in the tower."
        className="mt-3 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-[16px] leading-snug" />
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-muted">{text.length} / 400</span>
        {saved && <button type="button" onClick={() => { setText(saved); setEditing(false); }} className="ml-auto h-10 rounded-xl border border-line px-3 text-sm text-soft">Cancel</button>}
        <button type="button" onClick={save} disabled={pending} className={`${saved ? "" : "ml-auto"} h-10 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-60`}>{pending ? "…" : text.trim() ? "Save teaser" : saved ? "Remove it" : "Save teaser"}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function End({ number }: { number: number }) {
  return (
    <div>
      <p className="text-6xl" aria-hidden>🎬</p>
      <p className="mt-2 font-heading text-5xl font-bold leading-none">That&apos;s a wrap</p>
      <p className="mt-3 text-soft">See you next session.</p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href={`/stats/recap?s=${number}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-bold text-accent-text">Read the full recap</Link>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/stats?s=${number}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-line px-3 text-sm font-semibold text-soft">All the stats</Link>
          <Link href="/stats/wrapped" className="inline-flex h-11 items-center justify-center rounded-xl border border-line px-3 text-sm font-semibold text-soft">Campaign Wrapped</Link>
        </div>
      </div>
    </div>
  );
}
