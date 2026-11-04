"use client";
// The reaction pop-up: something just happened in the fight (an attack hit, a spell, someone left reach,
// damage) and one of your creatures can react. A few seconds to pick; nothing picked = it goes on.
// Shown on the Session screen and on the character sheet.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { openWindows, respondReaction, type OpenWindow } from "../session/reaction-actions";
import { rollQuick } from "../characters/[id]/actions";
import { asShown, useDice } from "./dice/dice-provider";

export function ReactionPrompt({ campaignId, onUsed }: { campaignId: string; onUsed?: (characterId: string | null) => void }) {
  const [wins, setWins] = useState<OpenWindow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dice = useDice();
  const router = useRouter();
  const done = useRef(new Set<string>()); // windows answered (or passed) on this device

  useEffect(() => {
    let alive = true;
    const load = async () => { try { const w = await openWindows(); if (alive) setWins(w.filter((x) => !done.current.has(x.id))); } catch { /* offline */ } };
    void load();
    const supabase = createClient();
    const ch = supabase.channel(`reactions-${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reaction_windows", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 4000);
    return () => { alive = false; clearInterval(poll); supabase.removeChannel(ch); };
  }, [campaignId]);

  const w = wins.find((x) => Date.parse(x.closesAt) > now - 500) ?? null;
  useEffect(() => {
    if (!w) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [w]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 6000); return () => clearTimeout(t); }, [note]);

  const close = (id: string) => { done.current.add(id); setWins((l) => l.filter((x) => x.id !== id)); };
  const answer = (combatantId: string, optionId: string | null) => {
    if (!w) return;
    const id = w.id;
    start(async () => {
      const r = await respondReaction(id, combatantId, optionId);
      const left = w.mine.filter((m) => !m.answered && m.combatantId !== combatantId);
      if (!left.length) close(id); else setWins((l) => l.map((x) => (x.id === id ? { ...x, mine: x.mine.map((m) => (m.combatantId === combatantId ? { ...m, answered: true } : m)) } : x)));
      if ("error" in r) return setNote(r.error);
      if (optionId) onUsed?.(w.mine.find((m) => m.combatantId === combatantId)?.characterId ?? null);
      let text = r.note;
      if (r.roll) {
        const res = await rollQuick(r.roll.characterId, { kind: "use", key: r.roll.key }, "normal", r.roll.target ?? null, []);
        if ("error" in res) text = res.error;
        else {
          await dice.show(asShown(res.roll));
          text = [text, `${res.roll.label}: ${res.roll.total ?? res.roll.dc ?? ""}${res.roll.success === true ? " · hit!" : res.roll.success === false ? " · miss" : ""}`].filter(Boolean).join(" ");
        }
      }
      if (text) setNote(text);
      router.refresh();
    });
  };

  if (!w && !note) return null;
  const left = w ? Math.max(0, (Date.parse(w.closesAt) - now) / 1000) : 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-3" aria-live="assertive">
      {w ? (
        <div className="pointer-events-auto animate-pop w-full max-w-sm rounded-2xl border border-accent-strong bg-surface-2 p-3 shadow-2xl" role="alertdialog" aria-label="Reaction">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Reaction?</p>
            <p className="text-xs tabular-nums text-muted">{left.toFixed(1)} s</p>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.min(100, (left / 5) * 100)}%` }} />
          </div>
          <p className="mt-2 font-heading text-lg font-bold leading-tight">{w.text}</p>
          {w.mine.filter((m) => !m.answered).map((m) => (
            <div key={m.combatantId} className="mt-2">
              {w.mine.length > 1 && <p className="text-xs text-muted">{m.name}</p>}
              <div className="mt-1 flex flex-col gap-1.5">
                {m.options.map((o) => (
                  <button key={o.id} type="button" disabled={pending || left <= 0} onClick={() => answer(m.combatantId, o.id)}
                    className="flex min-h-12 w-full flex-col justify-center rounded-xl bg-accent px-3 py-1.5 text-left text-accent-text disabled:opacity-50">
                    <span className="text-sm font-bold">{o.name}</span>
                    <span className="text-[11px] leading-snug opacity-90">{o.why}</span>
                  </button>
                ))}
                <button type="button" disabled={pending} onClick={() => answer(m.combatantId, null)} className="h-10 rounded-xl border border-line text-sm text-soft">Pass</button>
              </div>
            </div>
          ))}
          {left <= 0 && <button type="button" onClick={() => close(w.id)} className="mt-2 h-9 w-full text-xs text-muted underline">Too late: close</button>}
        </div>
      ) : (
        <p className="pointer-events-auto animate-pop max-w-sm rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm shadow-xl" role="status">{note}</p>
      )}
    </div>
  );
}
