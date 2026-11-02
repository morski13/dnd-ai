"use client";
// Rolls made without internet wait on this phone; this sends them, oldest first, as soon as it's back online
// (on any screen). A small bar at the top says how many are waiting.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { onQueue, queued, queueSnapshot, removeQueued, type QueuedRoll } from "@/lib/offline-rolls";
import { syncOfflineRoll } from "../characters/[id]/actions";

const IDS = "offline-roll-ids-v1"; // offline id → saved id (a damage roll may be sent after its attack)
const readIds = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(IDS) ?? "{}"); } catch { return {}; } };
const writeIds = (m: Record<string, string>) => { try { localStorage.setItem(IDS, JSON.stringify(Object.fromEntries(Object.entries(m).slice(-200)))); } catch { /* fine */ } };
const onLine = (cb: () => void) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; };

export function OfflineSync() {
  const router = useRouter();
  const snap = useSyncExternalStore(onQueue, queueSnapshot, () => "[]");
  const online = useSyncExternalStore(onLine, () => navigator.onLine, () => true);
  const waiting = (JSON.parse(snap) as QueuedRoll[]).length;
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  const send = useCallback(async () => {
    if (busy.current || !navigator.onLine || !queued().length) return;
    busy.current = true; setSending(true);
    const ids = readIds();
    const failed: string[] = [];
    let sent = 0;
    for (const q of queued()) {
      const parent = q.request.kind === "damage" ? q.request.parentRollId : undefined;
      const request = parent?.startsWith("offline-") ? { ...q.request, parentRollId: ids[parent] } : q.request;
      let r: Awaited<ReturnType<typeof syncOfflineRoll>>;
      try { r = await syncOfflineRoll(q.characterId, { request, advantage: q.advantage, values: q.values, at: q.at, physical: q.physical }); }
      catch { break; } // still no connection: try again later
      if ("error" in r) failed.push(`${q.label}: ${r.error}`);
      else { ids[q.id] = r.id; sent++; }
      writeIds(ids);
      removeQueued(q.id);
    }
    busy.current = false; setSending(false);
    if (sent || failed.length) setNote([sent ? `✓ ${sent} roll${sent > 1 ? "s" : ""} made offline saved.` : "", failed.length ? `Not saved: ${failed.join(" · ")}` : ""].filter(Boolean).join(" "));
    if (sent) router.refresh();
  }, [router]);

  useEffect(() => {
    if (online && waiting) void send();
    if (!waiting) return;
    const t = setInterval(() => void send(), 20_000);
    return () => clearInterval(t);
  }, [online, waiting, send]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 8000); return () => clearTimeout(t); }, [note]);

  if (!waiting && online && !note) return null;
  const text = note ?? (!online
    ? `No internet.${waiting ? ` ${waiting} roll${waiting > 1 ? "s" : ""} kept on this phone.` : ""} Rolls on your sheet still work and are sent when you're back online.`
    : sending ? `Sending ${waiting} roll${waiting > 1 ? "s" : ""} made offline…` : `${waiting} roll${waiting > 1 ? "s" : ""} made offline waiting to be sent.`);
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pointer-events-none">
      <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border border-line bg-surface-2/95 px-3 py-2 text-sm text-soft shadow-lg backdrop-blur">
        <span aria-hidden>{note ? "☁" : online ? "↑" : "📴"}</span>
        <span className="min-w-0 flex-1">{text}</span>
        {online && waiting > 0 && !sending && <button type="button" onClick={() => void send()} className="h-9 shrink-0 rounded-lg border border-line px-2 text-xs font-bold text-accent">Send now</button>}
        {note && <button type="button" onClick={() => setNote(null)} aria-label="Close" className="h-9 w-9 shrink-0 text-muted">✕</button>}
      </div>
    </div>
  );
}
