"use client";
// The Tavern assistant chat. Used full-screen on /tavern and as a small panel during a session.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { STYLES, styleOf } from "@/lib/assistant/styles";
import type { Mode } from "@/lib/assistant/prompt";
import type { TavernChar } from "@/lib/tavern-data";
import { LockIcon } from "../components/icons";
import { askTavern, rateAnswer, setAssistantStyle, type ChatMessageView } from "./actions";

const MODE_LABEL: Record<Mode, string> = { rules: "Rules & combos", character: "My character", session: "This turn", lore: "Campaign lore" };
const EXAMPLES: Record<Mode, string[]> = {
  rules: ["Can I cast Misty Step and Fireball on the same turn?", "How does grappling work?", "Does Disengage stop opportunity attacks?"],
  character: ["What's my best combo this turn?", "Can I use my bonus action to hide?", "How does my class feature work?"],
  session: ["Can I still attack after moving?", "Do I get advantage on a prone target?", "What can I do with my reaction?"],
  lore: ["Who is the leader of the Lanternhands?", "What do we know about the abbey?", "Which quests are still open?"],
};
const VERDICT: Record<string, { text: string; cls: string }> = {
  yes: { text: "Yes", cls: "bg-success-bg text-success border-success-line" },
  no: { text: "No", cls: "bg-danger-bg text-danger border-danger-line" },
  depends: { text: "It depends", cls: "bg-accent-surface text-accent border-accent-line" },
};

export function TavernChat(p: {
  chatId: string | null; messages: ChatMessageView[]; style: string; characters: TavernChar[]; isDm: boolean; configured: boolean;
  mode: Mode; characterId: string | null; compact?: boolean; allowModes?: Mode[]; onChat?: (id: string) => void;
}) {
  const router = useRouter();
  const [chatId, setChatId] = useState(p.chatId);
  const [messages, setMessages] = useState(p.messages);
  const [mode, setMode] = useState<Mode>(p.mode);
  const [charId, setCharId] = useState<string | null>(p.characterId ?? p.characters.find((c) => c.mine)?.id ?? null);
  const [style, setStyle] = useState(p.style);
  const [secrets, setSecrets] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pickStyle, setPickStyle] = useState(false);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const me = styleOf(style);
  const modes = p.allowModes ?? (["rules", "character", "lore"] as Mode[]);
  const needsChar = mode === "character" || mode === "session";

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, pending]);

  function send(q: string) {
    const question = q.trim();
    if (question.length < 3 || pending) return;
    setErr(null);
    const temp: ChatMessageView = { id: `temp-${++seq.current}`, role: "user", content: question, verdict: null, style: null, model: null, sources: [], checks: [], rating: 0, correction: null, hasSecrets: false, at: "" };
    setMessages((m) => [...m, temp]);
    setText("");
    start(async () => {
      const r = await askTavern({ chatId, mode, characterId: needsChar ? charId : null, question, withSecrets: mode === "lore" && secrets });
      if ("error" in r) {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setText(question);
        setErr(r.error);
        return;
      }
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), r.question, r.reply]);
      if (r.chatId !== chatId) {
        setChatId(r.chatId);
        p.onChat?.(r.chatId);
        if (!p.compact) router.replace(`/tavern?chat=${r.chatId}`, { scroll: false });
      }
    });
  }

  if (!p.configured) {
    return <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">The assistant needs an AI. Set AI_BASE_URL, AI_MODEL and AI_API_KEY in .env.local or in Vercel’s Environment Variables (Groq is free), or later our own model.</p>;
  }

  return (
    <div className={p.compact ? "" : "pb-40"}>
      {/* who you're talking to */}
      <div className="flex items-center gap-3 rounded-2xl border border-accent-line bg-accent-surface px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-heading text-lg font-bold text-accent-text" aria-hidden>{me.name[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">{me.name}</p>
          <p className="truncate text-xs text-muted">{me.who}</p>
        </div>
        <button type="button" onClick={() => setPickStyle(!pickStyle)} aria-expanded={pickStyle} className="h-9 shrink-0 rounded-lg border border-accent-line px-3 text-sm font-bold text-accent">
          {pickStyle ? "Done" : "Change voice"}
        </button>
      </div>
      {pickStyle && (
        <div className="animate-rise mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How the assistant talks">
          {STYLES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={s.id === style}
              onClick={() => { setStyle(s.id); void setAssistantStyle(s.id); }}
              className={`rounded-xl border p-2.5 text-left ${s.id === style ? "border-accent bg-accent-surface" : "border-line bg-surface"}`}>
              <span className="block text-sm font-bold">{s.name}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">“{s.sample}”</span>
            </button>
          ))}
        </div>
      )}

      {/* what it's about */}
      {modes.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Ask about">
          {modes.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`h-8 rounded-full border px-3 text-xs font-bold ${mode === m ? "border-accent bg-accent text-accent-text" : "border-line text-soft"}`}>{MODE_LABEL[m]}</button>
          ))}
        </div>
      )}
      {needsChar && (
        p.characters.length ? (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            About
            <select value={charId ?? ""} onChange={(e) => setCharId(e.target.value || null)} className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm text-text">
              {p.characters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.mine ? "" : " (party)"}</option>)}
            </select>
          </label>
        ) : <p className="mt-2 text-xs text-muted">You have no character in this campaign yet: answers will be general.</p>
      )}
      {mode === "lore" && p.isDm && (
        <label className="mt-2 flex items-center gap-2 text-xs text-soft">
          <input type="checkbox" checked={secrets} onChange={(e) => setSecrets(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          <LockIcon className="h-3.5 w-3.5 text-accent" /> Include DM-only notes (only sent to AIs allowed to read secrets)
        </label>
      )}

      {/* the conversation */}
      <div className="mt-4 space-y-3" aria-live="polite">
        {messages.length === 0 && !pending && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm text-soft">“{me.sample}” Ask me anything about the rules, your character{p.compact ? "" : " or the campaign"}.</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {EXAMPLES[mode].map((e) => (
                <button key={e} type="button" onClick={() => send(e)} className="rounded-lg border border-line px-3 py-2 text-left text-sm text-soft">{e}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (m.role === "user"
          ? <p key={m.id} className="animate-rise ml-10 rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 text-[15px]">{m.content}</p>
          : <Answer key={m.id} m={m} />))}
        {pending && (
          <div className="animate-rise flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            <span className="flex gap-1" aria-hidden><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:240ms]" /></span>
            {me.name} is checking the rules…
          </div>
        )}
        <div ref={end} />
      </div>

      {err && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{err}</p>}

      <form onSubmit={(e) => { e.preventDefault(); send(text); }}
        className={p.compact ? "mt-3" : "dock z-10 border-t border-line bg-bg/95 px-5 py-3 backdrop-blur"}>
        <div className="mx-auto flex max-w-md items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={800}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            placeholder={mode === "lore" ? "Ask about the world…" : "Ask a rule, a combo, a build…"} aria-label="Your question"
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-accent" />
          <button disabled={pending || text.trim().length < 3} className="h-11 shrink-0 rounded-xl bg-accent px-4 font-bold text-accent-text disabled:opacity-50">Ask</button>
        </div>
      </form>
    </div>
  );
}

function Answer({ m }: { m: ChatMessageView }) {
  const [open, setOpen] = useState<string | null>(null);
  const [rating, setRating] = useState(m.rating);
  const [fix, setFix] = useState(m.correction ?? "");
  const [fixSaved, setFixSaved] = useState(!!m.correction);
  const s = styleOf(m.style);
  const v = m.verdict ? VERDICT[m.verdict] : null;
  const rate = (r: -1 | 1) => { const next = rating === r ? 0 : r; setRating(next); void rateAnswer(m.id, next as -1 | 0 | 1); };
  const src = m.sources.find((x) => x.id === open);
  return (
    <section className="animate-rise mr-4 rounded-2xl rounded-bl-md border border-line bg-surface p-4" aria-label={`Answer from ${s.name}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-accent">{s.name}</span>
        {v && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${v.cls}`}>{v.text}</span>}
        {m.hasSecrets && <LockIcon className="h-3.5 w-3.5 text-accent" aria-label="Used DM-only notes" />}
      </div>
      <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed">{m.content}</p>
      {m.checks.length > 0 && (
        <details className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-soft">
          <summary className="cursor-pointer font-bold text-muted">✓ Checked by the app ({m.checks.length})</summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">{m.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </details>
      )}
      {m.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.sources.map((x) => (
            <button key={x.id} type="button" onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}
              className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] ${open === x.id ? "border-accent text-accent" : "border-line text-muted"}`}>
              {x.secret ? "🔒 " : ""}{x.title.replace(/^Glossary › /, "")}
            </button>
          ))}
        </div>
      )}
      {src && <p className="animate-rise mt-2 max-h-56 overflow-auto whitespace-pre-line rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-soft">{src.text}</p>}
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        <span className="min-w-0 flex-1 truncate">{m.model ? `Worded by ${m.model}` : ""}</span>
        <button type="button" onClick={() => rate(1)} aria-pressed={rating === 1} aria-label="Good answer" className={`h-8 w-8 rounded-lg ${rating === 1 ? "bg-success-bg text-success" : ""}`}>👍</button>
        <button type="button" onClick={() => rate(-1)} aria-pressed={rating === -1} aria-label="Wrong or bad answer" className={`h-8 w-8 rounded-lg ${rating === -1 ? "bg-danger-bg text-danger" : ""}`}>👎</button>
      </div>
      {rating === -1 && (
        <form className="animate-rise mt-1" onSubmit={(e) => { e.preventDefault(); setFixSaved(true); void rateAnswer(m.id, -1, fix); }}>
          <label htmlFor={`fix-${m.id}`} className="text-[11px] text-muted">What&apos;s the right answer? (optional: it teaches our own AI)</label>
          <div className="mt-1 flex gap-2">
            <textarea id={`fix-${m.id}`} value={fix} onChange={(e) => { setFix(e.target.value); setFixSaved(false); }} rows={2} maxLength={2000}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
            <button disabled={!fix.trim() || fixSaved} className="h-9 shrink-0 self-end rounded-lg border border-accent-line px-3 text-xs font-bold text-accent disabled:opacity-50">{fixSaved ? "Saved" : "Save"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

export function NewChatLink({ className }: { className?: string }) {
  return <Link href="/tavern" className={className}>New chat</Link>;
}
