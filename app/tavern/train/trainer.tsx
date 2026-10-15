"use client";
// Train the Tavern: the app asks the training questions by itself (random voices, paced for the free limits),
// then you review the answers one by one: 👍, 👎 with the right answer, or skip.
import { useCallback, useEffect, useRef, useState } from "react";
import { QUESTIONS } from "@/lib/assistant/questions";
import { STYLES, styleOf } from "@/lib/assistant/styles";
import type { TavernChar } from "@/lib/tavern-data";
import { askTavern, rateAnswer, reviewQueue, trainingStats, type ReviewItem } from "../actions";

const GOAL = 300;
const GROUPS = [...new Set(QUESTIONS.map((q) => q.group))];
const PACE_MS = 7000;        // between questions (free tiers allow only a little text per minute)
const BUSY_WAIT_MS = 65_000; // when every AI is resting for a minute
const ASKED_KEY = "tavern-trained";

type Stats = { liked: number; corrected: number; disliked: number; waiting: number };
type Log = { q: string; voice: string; state: "asking" | "done" | "error" | "waiting"; note?: string };

function readAsked(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ASKED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function saveAsked(s: Set<string>) {
  try { localStorage.setItem(ASKED_KEY, JSON.stringify([...s])); } catch { /* private window: fine */ }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Trainer({ characters, hasCampaign }: { characters: TavernChar[]; hasCampaign: boolean }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const refreshStats = useCallback(() => { void trainingStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { refreshStats(); }, [refreshStats]);
  const ready = stats ? stats.liked + stats.corrected : 0;

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-2xl border border-accent-line bg-accent-surface p-4" aria-label="Progress">
        <div className="flex items-baseline justify-between">
          <p className="font-bold">Ready to train on</p>
          <p className="text-sm text-muted"><b className="text-lg text-text">{ready}</b> / {GOAL} for a first training</p>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuemin={0} aria-valuemax={GOAL} aria-valuenow={Math.min(ready, GOAL)}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, (ready / GOAL) * 100)}%` }} />
        </div>
        {stats && <p className="mt-2 text-xs text-muted">{stats.liked} 👍 · {stats.corrected} corrected · {stats.disliked} 👎 · <b className="text-soft">{stats.waiting} waiting for review</b></p>}
      </section>
      <AutoAsk characters={characters} hasCampaign={hasCampaign} onAnswered={refreshStats} />
      <Review onRated={refreshStats} />
    </div>
  );
}

function AutoAsk({ characters, hasCampaign, onAnswered }: { characters: TavernChar[]; hasCampaign: boolean; onAnswered: () => void }) {
  const [count, setCount] = useState(25);
  const [voices, setVoices] = useState<Set<string>>(() => new Set(STYLES.filter((s) => s.id !== "plain").map((s) => s.id)));
  const [groups, setGroups] = useState<Set<string>>(() => new Set(GROUPS.filter((g) => hasCampaign || !/^Lore/.test(g))));
  const [charId, setCharId] = useState<string | null>(characters.find((c) => c.mine)?.id ?? characters[0]?.id ?? null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Log[]>([]);
  const [done, setDone] = useState(0);
  const stop = useRef(false);
  const chat = useRef<string | null>(null);

  const toggle = (set: Set<string>, v: string, put: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); put(n); };
  const push = (l: Log) => setLog((x) => [l, ...x].slice(0, 30));
  const patch = (q: string, p: Partial<Log>) => setLog((x) => x.map((l) => (l.q === q && l.state !== "done" ? { ...l, ...p } : l)));

  async function run() {
    stop.current = false;
    setRunning(true);
    setDone(0);
    const asked = readAsked();
    const pool = QUESTIONS.filter((q) => groups.has(q.group) && (q.mode !== "character" || charId) && (q.mode !== "lore" || hasCampaign));
    let todo = pool.filter((q) => !asked.has(q.q));
    if (todo.length < count) { asked.clear(); saveAsked(asked); todo = pool; } // went through them all: start over (new voices, new answers)
    todo = [...todo].sort(() => Math.random() - 0.5).slice(0, count);
    const vs = [...voices];
    let n = 0;
    for (const item of todo) {
      if (stop.current) break;
      const style = vs[Math.floor(Math.random() * vs.length)] ?? "tavern";
      push({ q: item.q, voice: styleOf(style).name, state: "asking" });
      let tries = 0;
      for (;;) {
        const r = await askTavern({ chatId: chat.current, mode: item.mode, characterId: item.mode === "character" ? charId : null, question: item.q, styleId: style, training: true });
        if (!("error" in r)) {
          chat.current = r.chatId;
          asked.add(item.q); saveAsked(asked);
          patch(item.q, { state: "done" });
          setDone(++n);
          onAnswered();
          break;
        }
        const busy = /free uses|free limit|limit reached|resting|back in/i.test(r.error);
        if (busy && tries < 3 && !stop.current) {
          tries++;
          patch(item.q, { state: "waiting", note: "All AIs are busy for a minute: waiting…" });
          await sleep(BUSY_WAIT_MS);
          patch(item.q, { state: "asking", note: undefined });
          continue;
        }
        patch(item.q, { state: "error", note: r.error.slice(0, 160) });
        if (busy) stop.current = true; // still busy after 3 minutes: daily limits are probably used up
        break;
      }
      if (!stop.current) await sleep(PACE_MS);
    }
    setRunning(false);
  }

  const voiceList = STYLES.filter((s) => s.id !== "plain");
  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Ask automatically">
      <h2 className="font-heading text-xl font-bold">1 · Ask automatically</h2>
      <p className="mt-1 text-sm text-muted">The app asks training questions for you, each in a random voice, about one every 10 seconds. Keep this page open; you can review answers below while it runs.</p>

      <fieldset className="mt-3" disabled={running}>
        <legend className="text-xs font-bold uppercase tracking-[0.1em] text-muted">How many</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[10, 25, 50, 100].map((n) => (
            <button key={n} type="button" onClick={() => setCount(n)} aria-pressed={count === n}
              className={`h-9 min-w-12 rounded-lg border px-3 text-sm font-bold ${count === n ? "border-accent bg-accent text-accent-text" : "border-line"}`}>{n}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-3" disabled={running}>
        <legend className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Voices ({voices.size})</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {voiceList.map((s) => (
            <button key={s.id} type="button" onClick={() => toggle(voices, s.id, setVoices)} aria-pressed={voices.has(s.id)}
              className={`h-8 rounded-full border px-2.5 text-xs ${voices.has(s.id) ? "border-accent bg-accent-surface text-accent" : "border-line text-muted"}`}>{s.name}</button>
          ))}
        </div>
      </fieldset>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted">Topics ({groups.size} of {GROUPS.length})</summary>
        <fieldset className="mt-1.5 flex flex-wrap gap-1.5" disabled={running}>
          {GROUPS.map((g) => (
            <button key={g} type="button" onClick={() => toggle(groups, g, setGroups)} aria-pressed={groups.has(g)} disabled={!hasCampaign && /^Lore/.test(g)}
              className={`h-8 rounded-full border px-2.5 text-xs disabled:opacity-40 ${groups.has(g) ? "border-accent bg-accent-surface text-accent" : "border-line text-muted"}`}>{g}</button>
          ))}
        </fieldset>
      </details>

      {characters.length > 0 && (
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          Character questions about
          <select value={charId ?? ""} onChange={(e) => setCharId(e.target.value || null)} disabled={running}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 text-sm text-text">
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      <div className="mt-4 flex items-center gap-3">
        {running
          ? <button type="button" onClick={() => { stop.current = true; }} className="h-11 rounded-xl border border-line px-5 font-bold">Stop after this one</button>
          : <button type="button" onClick={() => void run()} disabled={!voices.size || !groups.size} className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-text disabled:opacity-50">Start asking</button>}
        {(running || done > 0) && <p className="text-sm text-soft" aria-live="polite">{done} of {count} answered{running ? "…" : ""}</p>}
      </div>

      {log.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Asked so far">
          {log.map((l, i) => (
            <li key={`${l.q}-${i}`} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
              <span className={l.state === "done" ? "text-success" : l.state === "error" ? "text-danger" : "text-accent"}>
                {l.state === "done" ? "✓" : l.state === "error" ? "✕" : l.state === "waiting" ? "⏳" : "…"}
              </span>{" "}
              <span className="text-soft">{l.q}</span> <span className="text-muted">· {l.voice}</span>
              {l.note && <span className="mt-0.5 block text-muted">{l.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Review({ onRated }: { onRated: () => void }) {
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fix, setFix] = useState("");
  const [showSrc, setShowSrc] = useState(false);
  const load = useCallback(() => { void reviewQueue(20).then(setQueue).catch(() => setQueue([])); }, []);
  useEffect(() => { load(); }, [load]);
  const cur = queue?.[0] ?? null;

  const next = useCallback(() => {
    setFixing(false); setFix(""); setShowSrc(false);
    setQueue((q) => {
      const rest = (q ?? []).slice(1);
      if (rest.length < 3) setTimeout(load, 0); // fetch more (new answers from the auto-asker too)
      return rest;
    });
  }, [load]);
  const rate = useCallback((r: -1 | 1, correction?: string) => {
    if (!cur) return;
    void rateAnswer(cur.id, r, correction).then(onRated);
    next();
  }, [cur, next, onRated]);

  // keyboard: G = good, B = bad, S = skip
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!cur || fixing || (e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "g") rate(1);
      else if (e.key === "b") setFixing(true);
      else if (e.key === "s") next();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [cur, fixing, rate, next]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Review answers">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl font-bold">2 · Review</h2>
        <button type="button" onClick={load} className="text-xs text-accent underline">Refresh</button>
      </div>
      <p className="mt-1 text-sm text-muted">👍 only when it&apos;s right <b>and</b> sounds like the character. Keys: G good, B bad, S skip.</p>
      {queue === null ? <div className="mt-3 h-40 animate-pulse rounded-xl bg-surface-2" /> : !cur ? (
        <p className="mt-3 rounded-xl bg-surface-2 p-4 text-sm text-muted">Nothing waiting. Start asking above, or ask the Tavern yourself.</p>
      ) : (
        <article key={cur.id} className="animate-rise mt-3 rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Question</p>
          <p className="mt-0.5 font-semibold">{cur.question}</p>
          <p className="mt-3 text-xs font-bold text-accent">{styleOf(cur.style).name}{cur.verdict && cur.verdict !== "info" ? ` · ${cur.verdict}` : ""}</p>
          <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{cur.answer}</p>
          {(cur.checks.length > 0 || cur.sources.length > 0) && (
            <button type="button" onClick={() => setShowSrc(!showSrc)} className="mt-2 text-xs text-muted underline">{showSrc ? "Hide" : "Show"} what it was based on</button>
          )}
          {showSrc && (
            <div className="mt-2 space-y-2 text-xs text-soft">
              {cur.checks.map((c, i) => <p key={i}>✓ {c}</p>)}
              {cur.sources.map((s) => <details key={s.id}><summary className="cursor-pointer">{s.title}</summary><p className="mt-1 whitespace-pre-line text-muted">{s.text}</p></details>)}
            </div>
          )}
          {fixing ? (
            <form className="mt-3" onSubmit={(e) => { e.preventDefault(); rate(-1, fix); }}>
              <label htmlFor="fix" className="text-xs text-muted">What should it have said? (optional: leave empty to just mark it wrong)</label>
              <textarea id="fix" autoFocus value={fix} onChange={(e) => setFix(e.target.value)} rows={4} maxLength={2000}
                placeholder={`Write the right answer in the ${styleOf(cur.style).name}'s voice`}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
              <div className="mt-2 flex gap-2">
                <button className="h-10 rounded-lg bg-accent px-4 text-sm font-bold text-accent-text">Save 👎</button>
                <button type="button" onClick={() => setFixing(false)} className="h-10 rounded-lg border border-line px-4 text-sm">Back</button>
              </div>
            </form>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => rate(1)} className="h-12 rounded-xl border border-success-line bg-success-bg font-bold text-success">👍 Good</button>
              <button type="button" onClick={() => setFixing(true)} className="h-12 rounded-xl border border-danger-line bg-danger-bg font-bold text-danger">👎 Wrong</button>
              <button type="button" onClick={next} className="h-12 rounded-xl border border-line font-bold text-soft">Skip</button>
            </div>
          )}
          <p className="mt-2 text-right text-[11px] text-muted">{(queue?.length ?? 0) > 1 ? `${queue!.length - 1} more loaded` : ""}{cur.model ? ` · ${cur.model}` : ""}</p>
        </article>
      )}
    </section>
  );
}
