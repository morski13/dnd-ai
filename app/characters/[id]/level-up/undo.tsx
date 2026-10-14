"use client";
// "Undo the last level-up": puts the character back exactly as it was.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { undoLevelUp } from "./actions";

export function UndoLevelUp({ characterId, label, compact = false }: { characterId: string; label: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className={compact ? "" : "mt-6 rounded-2xl border border-line px-4 py-3"}>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted">Last level-up: <b className="text-soft">{label}</b></p>
        <button type="button" disabled={pending}
          onClick={() => { if (!confirm(`Undo the level-up to ${label}? Everything it changed goes back.`)) return;
            start(async () => { const r = await undoLevelUp(characterId); if ("error" in r) setMsg(r.error); else { setMsg(`Undone: ${r.undone}.`); router.refresh(); } }); }}
          className="h-10 rounded-xl border border-line px-3 text-sm text-soft">{pending ? "…" : "Undo"}</button>
      </div>
      {msg && <p className="mt-1 text-xs text-muted" role="status">{msg}</p>}
    </div>
  );
}
