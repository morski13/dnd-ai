"use client";
// DM: "Read with AI": the AI reads the notes once and its links and summaries are saved (not re-run on every visit).
// Below it: the AI chain (backups take over when one is out of free uses) and how each one is doing.
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import type { AiProviderStatus } from "@/lib/ai/client";
import type { AiState } from "@/lib/reader/ai";
import { aiReadCampaign } from "../ai-actions";

export function AiReadButton({ ai }: { ai: AiState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // dates in the viewer's own language and time zone: only after the page is in the browser (the server can't know them)
  const local = useInBrowser();
  if (!ai.configured) {
    return <p className="mt-3 text-[11px] text-muted">Want the AI to find links your notes only hint at? Set up a free AI (AI_BASE_URL, AI_MODEL, AI_API_KEY in .env.local, or in Vercel’s Environment Variables).</p>;
  }
  const when = ai.at ? (local ? new Date(ai.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "earlier") : null;
  return (
    <section className="mt-3 rounded-2xl border border-[#4a3f60] bg-surface px-4 py-3" aria-label="AI reader">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-bold text-[#b9a6e0]">✦ AI reader</span>{" "}
          <span className="text-muted">{when ? `read ${when}${ai.stale ? " · notes changed since" : ""}` : "not run yet"}</span>
        </p>
        <button type="button" disabled={pending}
          onClick={() => start(async () => {
            const r = await aiReadCampaign();
            setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: `Found ${r.links} link${r.links === 1 ? "" : "s"} in all your notes and ${r.playerLinks} in the shared pages (the players' copy). Your map shows both.${r.by.length ? ` Read by ${r.by.join(" and ")}.` : ""}` });
            router.refresh();
          })}
          className="h-9 shrink-0 rounded-lg border border-[#6a5a8a] px-3 text-sm font-bold text-[#b9a6e0] disabled:opacity-50">
          {pending ? "Reading…" : ai.at ? "Read again" : "Read with AI"}
        </button>
      </div>
      {msg && <p className={`mt-1.5 text-xs ${msg.ok ? "text-success" : "text-danger"}`} role="status">{msg.text}</p>}
      {ai.model && !msg && <p className="mt-1 text-[11px] text-muted">Last read by {ai.model}</p>}
      <AiChain chain={ai.chain} />
      <p className="mt-1.5 text-[11px] text-muted">
        Your notes (DM-only parts too) are sent to {secretNames(ai) || "none of your AIs"}. Players get a separate reading made only from pages you shared.
      </p>
    </section>
  );
}

const noop = () => () => {};
/** false while the server renders and during hydration, true afterwards */
function useInBrowser() { return useSyncExternalStore(noop, () => true, () => false); }

function secretNames(ai: AiState) {
  if (!ai.chain.length) return ai.host ?? "";
  return [...new Set(ai.chain.filter((c) => c.secrets).map((c) => c.name))].join(", ");
}

const time = (iso: string) => {
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString(undefined, today ? { timeStyle: "short" } : { weekday: "short", hour: "numeric", minute: "2-digit" });
};

/** Each AI in order: ready / resting until… / problem, uses today and what the provider says is left. */
export function AiChain({ chain }: { chain: AiProviderStatus[] }) {
  const [open, setOpen] = useState(false);
  if (!chain.length) return null;
  const ready = chain.filter((c) => c.state !== "resting").length;
  const next = chain.find((c) => c.state === "ready") ?? chain.find((c) => c.state === "problem");
  return (
    <div className="mt-2 border-t border-line pt-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-xs">
        <span className={`h-2 w-2 shrink-0 rounded-full ${ready ? "bg-success" : "bg-danger"}`} aria-hidden />
        <span className="min-w-0 flex-1 text-soft">
          {chain.length === 1 ? "1 AI" : `${chain.length} AIs, ${ready} ready`}
          {next ? <span className="text-muted"> · next answer from {next.name}</span> : <span className="text-danger"> · all out of free uses</span>}
          {next && !next.secrets && !chain.some((c) => c.secrets && c.state !== "resting") && <span className="text-danger"> · none ready for DM-only notes</span>}
        </span>
        <span className="shrink-0 text-muted">{open ? "Hide" : "Details"}</span>
      </button>
      {open && (
        <ol className="mt-2 space-y-1.5" aria-label="AI chain">
          {chain.map((c, i) => (
            <li key={`${c.name}|${c.model}`} className="rounded-lg border border-line px-2.5 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted">{i + 1}.</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${c.state === "ready" ? "bg-success" : c.state === "resting" ? "bg-danger" : "bg-accent"}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate"><b>{c.name}</b> <span className="text-muted">{c.model}</span></span>
                {!c.secrets && <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] text-muted">shared pages only</span>}
              </div>
              <p className="mt-0.5 pl-5 text-muted">
                {c.state === "resting" && c.until ? <span className="text-danger">{c.why ?? "Resting"}, back {time(c.until)}</span>
                  : c.state === "problem" ? <span className="text-accent">Last try failed</span> : <span className="text-success">Ready</span>}
                {" · "}used {c.usedToday}× today
                {c.left != null && <> · {c.left}{c.limit ? ` of ${c.limit}` : ""} left</>}
                {c.lastOkAt && <> · last answer {time(c.lastOkAt)}</>}
              </p>
              {c.state === "problem" && c.lastError && <p className="mt-0.5 pl-5 text-[11px] text-muted">{c.lastError}</p>}
            </li>
          ))}
        </ol>
      )}
      {open && <p className="mt-1.5 text-[11px] text-muted">When one is out of free uses, the next one answers. Add backups as AI_2_…, AI_3_… in .env.local.</p>}
    </div>
  );
}
