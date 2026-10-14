"use client";
// Your earlier chats with the assistant (newest first), with delete.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ChatSummary } from "@/lib/tavern-data";
import { deleteChat } from "./actions";

const MODE: Record<string, string> = { rules: "Rules", character: "Character", session: "Session", lore: "Lore" };

export function ChatHistory({ chats, current }: { chats: ChatSummary[]; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  if (!chats.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-11 w-full items-center justify-between px-4 text-sm">
        <span className="text-soft">Earlier chats ({chats.length})</span><span className="text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ul className="border-t border-line">
          {chats.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border-b border-line px-4 py-2 last:border-b-0">
              <Link href={`/tavern?chat=${c.id}`} className={`min-w-0 flex-1 ${c.id === current ? "text-accent" : ""}`}>
                <span className="block truncate text-sm">{c.title || "Chat"}</span>
                <span className="block text-[11px] text-muted">{MODE[c.mode] ?? c.mode}</span>
              </Link>
              <button type="button" aria-label={`Delete chat: ${c.title}`} className="h-8 shrink-0 rounded-lg px-2 text-xs text-muted"
                onClick={() => start(async () => { await deleteChat(c.id); router.push(c.id === current ? "/tavern" : `/tavern${current ? `?chat=${current}` : ""}`); router.refresh(); })}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
