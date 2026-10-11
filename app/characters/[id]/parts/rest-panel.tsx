"use client";
// Short rest (spend hit dice) and long rest (everything back), with the hit dice rolled on screen.
import { useState, useTransition } from "react";
import type { Resource } from "@/lib/character-data";
import type { RestResult } from "@/lib/rest-service";
import { averageHitDie, hitDiceLeft } from "@/lib/rests";
import type { SpellBook } from "@/lib/rules";
import { useDice } from "../../../components/dice/dice-provider";
import { BottomSheet, Stepper } from "../../../items/parts/ui";
import { takeLongRest, takeShortRest } from "../rest-actions";

export function RestPanel({ characterId, classLevels, conMod, hitDiceUsed, hp, onRested }: {
  characterId: string; classLevels: { class: string; level: number }[]; conMod: number; hitDiceUsed: Record<string, number>;
  hp: { cur: number; max: number };
  onRested: (r: { kind: "short" | "long"; hp_current: number; temp_hp: number; resources: Resource[]; spells: SpellBook; hit_dice_used: Record<string, number> }) => void;
}) {
  const [open, setOpen] = useState<"short" | "long" | null>(null);
  const [spend, setSpend] = useState<Record<string, number>>({});
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dice = useDice();
  const left = hitDiceLeft({ class_levels: classLevels, hit_dice_used: hitDiceUsed });
  const totalLeft = left.reduce((s, d) => s + d.left, 0);
  const preview = Math.round(left.reduce((s, d) => s + (spend[d.die] ?? 0) * averageHitDie(d.die, conMod), 0));
  const close = () => { setOpen(null); setSpend({}); setError(null); };

  function finish(r: RestResult | { error: string }) {
    if ("error" in r) return setError(r.error);
    onRested(r);
    setDone(r.kind === "short"
      ? `Short rest: ${r.healed ? `healed ${r.healed} HP` : "no healing"}; short-rest abilities are back.`
      : `Long rest: full HP, every spell slot, ability use and hit die back.${r.ended ? ` You stopped concentrating on ${r.ended}.` : ""}`);
    close();
  }

  return (
    <section className="mt-5" aria-label="Rest">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen("short")} className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-soft">Short rest</button>
        <button type="button" onClick={() => setOpen("long")} className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-soft">Long rest</button>
      </div>
      <p className="mt-1.5 text-xs text-muted">Hit dice: {left.map((d) => `${d.left}/${d.total} d${d.die}`).join(" · ") || "none"}</p>
      {done && <p className="animate-pop mt-2 rounded-xl bg-success-bg px-3 py-2 text-sm text-success" role="status">{done}</p>}

      {open === "short" && (
        <BottomSheet title="Short rest" onClose={close}>
          <p className="text-sm text-soft">Rest for an hour. Spend hit dice to heal (each die + your CON {conMod >= 0 ? `+${conMod}` : conMod}). Abilities that come back on a short rest are restored.</p>
          {totalLeft === 0 ? <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm text-muted">No hit dice left. They come back on a long rest.</p> : (
            <ul className="mt-3 flex flex-col gap-2">
              {left.filter((d) => d.left > 0).map((d) => (
                <li key={d.die} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-2">
                  <span className="text-sm"><b>d{d.die}</b> <span className="text-muted">· {d.left} left</span></span>
                  <Stepper value={spend[d.die] ?? 0} min={0} max={d.left} label={`d${d.die} to spend`} onChange={(n) => setSpend({ ...spend, [d.die]: n })} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-muted">HP {hp.cur}/{hp.max}{preview ? ` · about +${preview}` : ""}</p>
          <button type="button" disabled={pending} onClick={() => start(async () => {
            const r = await takeShortRest(characterId, spend);
            if (!("error" in r)) for (const x of r.rolls) await dice.show({ expression: x.expression, dice: x.dice, diceAll: x.dice, total: x.total, label: `Hit dice (d${x.die})`, tone: "heal" });
            finish(r);
          })} className="mt-3 h-12 w-full rounded-xl bg-accent font-bold text-accent-text">
            {pending ? "Resting…" : Object.values(spend).some(Boolean) ? "Roll & rest" : "Rest without hit dice"}
          </button>
          {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
        </BottomSheet>
      )}
      {open === "long" && (
        <BottomSheet title="Long rest" onClose={close}>
          <p className="text-sm text-soft">Eight hours of rest. You get back:</p>
          <ul className="mt-2 space-y-1 text-sm text-soft">
            <li>• All hit points ({hp.max}); temporary HP ends</li>
            <li>• Every spell slot and every ability use</li>
            <li>• Spent hit dice (2024 rules: all, 2014: half)</li>
            <li>• Death saves reset; concentration ends</li>
          </ul>
          <button type="button" disabled={pending} onClick={() => start(async () => finish(await takeLongRest(characterId)))}
            className="mt-4 h-12 w-full rounded-xl bg-accent font-bold text-accent-text">{pending ? "Resting…" : "Take a long rest"}</button>
          {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
        </BottomSheet>
      )}
    </section>
  );
}
