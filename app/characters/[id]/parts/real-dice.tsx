"use client";
// Real dice: a number pad for what your physical dice show (the d20, both d20s with advantage, or the damage dice total).
// "Let the app roll" rolls it the usual way instead. The setting "I use real dice" is kept on this device.
import { useState, useSyncExternalStore } from "react";
import { diceLabel, type RollShape } from "@/lib/physical";

const KEY = "real-dice";
export function useRealDice(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore((cb) => { window.addEventListener(KEY, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(KEY, cb); window.removeEventListener("storage", cb); }; },
    () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }, () => false);
  const set = (v: boolean) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* fine */ } window.dispatchEvent(new Event(KEY)); };
  return [on, set];
}

export type Typed = { d20: number[]; sum: number | null };

export function RealDicePad({ title, shape, onDone }: { title: string; shape: RollShape; onDone: (t: Typed | "app" | null) => void }) {
  const boxes = [...Array.from({ length: shape.d20s }, (_, i) => shape.d20s > 1 ? `d20 #${i + 1}` : "d20"), ...(shape.others.length ? [diceLabel(shape.others)] : [])];
  const [vals, setVals] = useState<string[]>(boxes.map(() => ""));
  const [at, setAt] = useState(0);
  const max = (i: number) => (i < shape.d20s ? 20 : shape.others.reduce((a, b) => a + b, 0));
  const min = (i: number) => (i < shape.d20s ? 1 : shape.others.length);
  const valid = vals.every((v, i) => v !== "" && Number(v) >= min(i) && Number(v) <= max(i));
  const press = (k: string) => {
    setVals((vs) => vs.map((v, i) => {
      if (i !== at) return v;
      if (k === "⌫") return v.slice(0, -1);
      const next = (v + k).replace(/^0+/, "");
      return Number(next) > max(i) ? v : next;
    }));
    if (k !== "⌫" && at < boxes.length - 1 && Number(vals[at] + k) * 10 > max(at)) setAt(at + 1); // the number can't get longer: next box
  };
  const done = () => onDone({ d20: vals.slice(0, shape.d20s).map(Number), sum: shape.others.length ? Number(vals[shape.d20s]) : null });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm sm:items-center" role="dialog" aria-modal aria-label="Type your real dice">
      <div className="w-full max-w-sm rounded-t-3xl border border-line bg-surface-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Real dice</p>
        <p className="font-heading text-xl font-bold">{title}</p>
        <p className="text-sm text-muted">Type what the dice show{shape.modifierText ? `; the app adds ${shape.modifierText}` : ""}{shape.others.length ? `. For ${diceLabel(shape.others)} type the total of those dice` : ""}.</p>
        <div className="mt-3 flex gap-2">
          {boxes.map((b, i) => (
            <button key={b} type="button" onClick={() => setAt(i)} aria-pressed={at === i}
              className={`min-w-0 flex-1 rounded-xl border px-2 py-2 text-left ${at === i ? "border-accent-strong bg-accent-surface" : "border-line bg-bg"}`}>
              <span className="block text-xs text-muted">{b}</span>
              <span className="block font-heading text-3xl font-bold">{vals[i] || "–"}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"].map((k) => (
            <button key={k} type="button" onClick={() => press(k)} className="h-14 rounded-xl border border-line bg-bg text-2xl font-bold">{k}</button>
          ))}
          <button type="button" onClick={done} disabled={!valid} className="h-14 rounded-xl bg-accent text-lg font-bold text-accent-text disabled:opacity-40">OK</button>
        </div>
        <div className="mt-3 flex justify-between gap-2 text-sm">
          <button type="button" onClick={() => onDone(null)} className="h-11 px-2 text-muted underline">Cancel</button>
          <button type="button" onClick={() => onDone("app")} className="h-11 px-2 text-accent underline">Let the app roll</button>
        </div>
      </div>
    </div>
  );
}
