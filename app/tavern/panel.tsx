"use client";
// The assistant as a pop-up panel (used on the session screen): quick rules questions about this turn.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TavernChar } from "@/lib/tavern-data";
import { tavernPanel } from "./actions";
import { TavernChat } from "./chat";

type Panel = { style: string; characters: TavernChar[]; configured: boolean; isDm: boolean };

export function TavernButton({ characterId }: { characterId: string | null }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Panel | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  useEffect(() => { if (open && !info) void tavernPanel().then(setInfo); }, [open, info]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Ask the Tavern a rules question"
        className="fixed bottom-[calc(var(--nav-h)+1rem)] right-4 z-20 md:right-8 flex h-12 items-center gap-1.5 rounded-full border border-accent-line bg-accent-surface px-4 text-sm font-bold text-accent shadow-lg shadow-black/40">
        <span aria-hidden>✦</span> Ask
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50 md:items-stretch md:justify-end" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="The Tavern" onClick={(e) => e.stopPropagation()}
            className="animate-rise mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-bg px-4 pb-6 pt-3 md:mx-0 md:h-full md:max-h-none md:w-[28rem] md:max-w-[90vw] md:rounded-none md:rounded-l-3xl md:px-6 md:pt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-heading text-xl font-bold">The Tavern</p>
              <div className="flex items-center gap-2">
                {chatId && <Link href={`/tavern?chat=${chatId}`} className="text-xs text-accent underline">Open full chat</Link>}
                <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-line px-3 text-sm">Close</button>
              </div>
            </div>
            {info ? (
              <TavernChat compact chatId={chatId} messages={[]} style={info.style} characters={info.characters} isDm={info.isDm} configured={info.configured}
                mode="session" characterId={characterId} allowModes={["session", "rules"]} onChat={setChatId} />
            ) : <div className="h-40 animate-pulse rounded-2xl bg-surface" />}
          </div>
        </div>
      )}
    </>
  );
}
