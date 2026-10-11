"use client";
// DM: "Read with AI": the AI reads the notes once and its links and summaries are saved (not re-run on every visit).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AiState } from "@/lib/reader/ai";
import { aiReadCampaign } from "../ai-actions";

export function AiReadButton({ ai }: { ai: AiState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!ai.configured) {
    return <p className="mt-3 text-[11px] text-muted">Want the AI to find links your notes only hint at? Set up a free AI (AI_BASE_URL, AI_MODEL, AI_API_KEY in .env.local).</p>;
  }
  const when = ai.at ? new Date(ai.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
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
            setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: `Found ${r.links} link${r.links === 1 ? "" : "s"} in all your notes and ${r.playerLinks} in the shared pages (the players' copy). Your map shows both.` });
            router.refresh();
          })}
          className="h-9 shrink-0 rounded-lg border border-[#6a5a8a] px-3 text-sm font-bold text-[#b9a6e0] disabled:opacity-50">
          {pending ? "Reading…" : ai.at ? "Read again" : "Read with AI"}
        </button>
      </div>
      {msg && <p className={`mt-1.5 text-xs ${msg.ok ? "text-success" : "text-danger"}`} role="status">{msg.text}</p>}
      <p className="mt-1.5 text-[11px] text-muted">Your notes (DM-only parts too) are sent to {ai.host}. Players get a separate reading made only from pages you shared.</p>
    </section>
  );
}
