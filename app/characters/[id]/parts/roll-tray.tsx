"use client";
// Bottom panel: the last roll, the damage follow-up, and Disadvantage / Normal / Advantage.
import { useState, useSyncExternalStore } from "react";
import { signed, type Advantage } from "@/lib/dice";
import type { SavedRoll } from "../actions";

export function RollTray({ last, error, pending, advantage, setAdvantage, damage, practice = false, setPractice, realDice = false, setRealDice, onUndoReal }: {
  last: (SavedRoll & { after?: string | null }) | null;
  error: string | null;
  pending: boolean;
  advantage: Advantage;
  setAdvantage: (a: Advantage) => void;
  damage: { label: string; onClick: () => void } | null;
  practice?: boolean;                    // practice rolls: worked out, never saved
  setPractice?: (on: boolean) => void;
  realDice?: boolean;                    // "I use real dice": every roll button asks what your dice show
  setRealDice?: (on: boolean) => void;
  onUndoReal?: () => void;               // typed a wrong number: take the last real-dice roll back (2 minutes)
}) {
  // Hide / show: remembered on this device. A roll that needs a next step (damage, a Wild Surge effect) opens it again.
  const hidden = useSyncExternalStore(subscribe, () => readHidden(), () => false);
  const [hiddenAt, setHiddenAt] = useState<string | null>(null); // the roll that was showing when it was hidden
  const needsYou = (!!damage && last?.id !== hiddenAt) || !!error;
  const open = !hidden || needsYou;
  const show = (v: boolean) => {
    if (!v) setHiddenAt(last?.id ?? null);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* no storage */ }
    window.dispatchEvent(new Event(KEY));
  };

  const advLabel = advantage === "advantage" ? "Adv" : advantage === "disadvantage" ? "Disadv" : null;
  if (!open) {
    return (
      <div className={`dock z-10 border-t bg-surface-2/95 backdrop-blur ${practice ? "border-accent-line" : "border-line"}`}>
        <button type="button" onClick={() => show(true)} aria-expanded={false} aria-label="Show the roll panel"
          className="mx-auto flex h-12 w-full max-w-md items-center gap-3 px-5 text-left">
          <span aria-hidden className="text-accent">▴</span>
          <span className="min-w-0 flex-1 truncate text-sm text-soft">
            {pending ? "Rolling…" : last ? `${last.label}${last.table ? ` · ${last.table.row}` : ""}` : "Rolls"}
            {practice && <span className="text-accent"> · practice</span>}
          </span>
          {advLabel && <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-accent-text">{advLabel}</span>}
          {last && !pending && last.total != null && <span className="shrink-0 font-heading text-2xl font-bold">{last.total}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className={`dock z-10 border-t bg-surface-2/95 backdrop-blur ${practice ? "border-accent-line" : "border-line"}`}>
      <div className="relative mx-auto max-w-md px-5 py-3">
        <button type="button" onClick={() => show(false)} aria-expanded aria-label="Hide the roll panel"
          className="absolute -top-px left-1/2 flex h-7 -translate-x-1/2 -translate-y-full items-center gap-1 rounded-t-lg border border-b-0 border-line bg-surface-2 px-3 text-xs text-soft">
          ▾ Hide
        </button>
        {setPractice && (
          <button type="button" role="switch" aria-checked={practice} disabled={pending} onClick={() => setPractice(!practice)}
            className="mb-2 flex w-full items-center justify-between gap-3 text-left">
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${practice ? "text-accent" : ""}`}>Practice rolls</span>
              <span className="block truncate text-xs text-muted">
                {practice ? "Just working it out: not saved, no slots or uses spent" : "Off: every roll is saved and counts"}
              </span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${practice ? "bg-accent" : "bg-line"}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${practice ? "left-6" : "left-1"}`} />
            </span>
          </button>
        )}
        {setRealDice && !practice && (
          <button type="button" role="switch" aria-checked={realDice} disabled={pending} onClick={() => setRealDice(!realDice)}
            className="mb-2 flex w-full items-center justify-between gap-3 text-left">
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${realDice ? "text-accent" : ""}`}>I use real dice</span>
              <span className="block truncate text-xs text-muted">{realDice ? "Tap a roll, type what your dice show. It counts like any roll." : "Off: the app rolls"}</span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${realDice ? "bg-accent" : "bg-line"}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${realDice ? "left-6" : "left-1"}`} />
            </span>
          </button>
        )}
        {error && <p className="mb-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            {pending ? (
              <p className="text-sm text-muted">Rolling…</p>
            ) : last ? (
              <>
                {last.after && <p className="truncate text-xs text-accent">After {last.after}:</p>}
                <p className="truncate text-xs uppercase tracking-[0.12em] text-muted">
                  {last.label}{last.physical ? " · real dice" : ""}{last.practice ? " · practice, not saved" : last.offline ? " · offline, sent later" : last.inSession ? " · saved to session" : " · saved"}
                </p>
                <p className="truncate text-sm text-soft">{breakdown(last)}</p>
              </>
            ) : (
              <p className="text-sm text-muted">{practice ? "Tap any bonus to try a roll. Nothing is saved." : "Tap any bonus to roll. Every roll is saved."}</p>
            )}
          </div>
          {last && !pending && (last.rollType !== "other" || last.total != null) && (
            <p key={last.id} className={`animate-pop font-heading text-4xl font-bold ${last.isCrit ? "text-accent" : last.isFumble ? "text-danger" : last.rollType === "heal" ? "text-success" : ""}`}>
              {last.total ?? `DC ${last.dc}`}
            </p>
          )}
        </div>

        {last && !pending && last.rollType === "attack" && last.success != null && last.vsAc != null && (
          <p key={`h${last.id}`} role="status" className={`mt-1 rounded-lg px-3 py-2 text-sm font-bold ${last.success ? "animate-pop bg-success-bg text-success" : "animate-shake bg-danger-bg text-danger"}`}>
            {last.success
              ? `Hit! ${last.total} vs AC ${last.vsAc}${last.isCrit ? " · critical" : ""}`
              : `Miss: ${last.total} doesn't beat AC ${last.vsAc}${last.isFumble ? " (natural 1)" : ""}. No damage to roll.`}
          </p>
        )}
        {last && !pending && (last.isCrit || last.isFumble) && (
          <p key={last.id} className={`mt-1 text-sm font-bold ${last.isCrit ? "animate-pop text-accent" : "animate-shake text-danger"}`}>
            {last.isCrit ? "Natural 20!" : "Natural 1…"}
          </p>
        )}

        {last && !pending && last.table?.text && (
          <p key={`t${last.id}`} className="animate-pop mt-2 rounded-lg bg-accent-surface px-3 py-2 text-sm">
            <b className="text-accent">{last.table.row}.</b> {last.table.text}
          </p>
        )}
        {last && !pending && last.self && <p className="mt-2 text-sm text-soft">{last.self.note}</p>}

        {last?.physical && !last.offline && !pending && onUndoReal && (
          <button type="button" onClick={onUndoReal} className="mt-2 inline-flex min-h-10 items-center text-sm text-muted underline">Typo? Take it back and type again</button>
        )}
        {damage && !pending && (
          <button type="button" onClick={damage.onClick} className="mt-2 h-11 w-full rounded-xl border border-danger-line bg-danger-bg text-sm font-bold text-danger">
            {damage.label}
          </button>
        )}

        <div className="mt-2 grid grid-cols-3 rounded-xl border border-line p-0.5">
          {(["disadvantage", "normal", "advantage"] as Advantage[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAdvantage(a)}
              className={`h-10 rounded-lg text-sm ${advantage === a ? "bg-accent font-bold text-accent-text" : "text-soft"}`}
            >
              {a === "disadvantage" ? "Disadv" : a === "advantage" ? "Adv" : "Normal"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function breakdown(r: SavedRoll) {
  if (r.rollType === "save_dc") return `Targets make a ${r.ability} save against DC ${r.dc}`;
  if (r.rollType === "other" && !r.dice.length) return r.practice ? "Practice: nothing spent" : "Logged";
  const dice = r.diceAll.length > r.dice.length ? `[${r.diceAll.join(", ")}] → ${r.dice.join(", ")}` : `[${r.dice.join(", ")}]`;
  return `${r.expression}: ${dice}${r.modifier ? ` ${signed(r.modifier)}` : ""}`;
}

const KEY = "roll-tray-open";
function readHidden() { try { return localStorage.getItem(KEY) === "0"; } catch { return false; } }
function subscribe(cb: () => void) {
  window.addEventListener(KEY, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(KEY, cb); window.removeEventListener("storage", cb); };
}
