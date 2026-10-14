"use client";
// Fight moderator pieces: HP bars, "what just happened" with fix/undo, death saves, conditions.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Applied } from "@/lib/moderator/apply";
import { CONDITIONS, FACTORS, type DeathSaves, type Factor, type Health } from "@/lib/moderator/hp";
import type { Combatant } from "@/lib/session-data";
import { useDice } from "../../components/dice/dice-provider";
import { adjustEffect, rollDeathSave, setConditions, stabilize, type DeathSaveResult } from "../moderator-actions";

export const HEALTH_LABEL: Record<Health, string> = { unhurt: "Unhurt", hurt: "Hurt", bloodied: "Bloodied", down: "Down" };
const HEALTH_COLOR: Record<Health, string> = { unhurt: "#7BC86C", hurt: "#C9C46A", bloodied: "#E0913A", down: "#F07A6A" };

function barColor(pct: number) { return pct > 50 ? "#7BC86C" : pct > 25 ? "#E0913A" : "#F07A6A"; }

/** A thin HP bar. With exact numbers when you may see them, else just how hurt it looks. */
export function HpBar({ hp, max, temp = 0, health, size = "md" }: { hp: number | null; max: number | null; temp?: number; health: Health; size?: "sm" | "md" }) {
  const exact = hp != null && !!max;
  const pct = exact ? Math.max(0, Math.min(100, (hp! / max!) * 100)) : health === "down" ? 0 : health === "bloodied" ? 40 : health === "hurt" ? 75 : 100;
  const h = size === "sm" ? "h-1" : "h-2";
  return (
    <div className="w-full">
      <div className={`relative ${h} w-full overflow-hidden rounded-full bg-bg`} aria-hidden>
        <div className="bar-fill h-full rounded-full" style={{ width: `${pct}%`, background: exact ? barColor(pct) : HEALTH_COLOR[health], opacity: exact ? 1 : 0.8 }} />
        {temp > 0 && <div className="absolute inset-y-0 right-0 rounded-full bg-[#7FB8D4]" style={{ width: `${Math.min(30, (temp / (max || 1)) * 100)}%` }} />}
      </div>
      {size === "md" && (
        <p className="mt-1 text-xs text-muted">
          {exact ? <><span className="font-semibold text-text">{hp}</span> / {max} HP{temp > 0 && <span className="text-[#7FB8D4]"> +{temp} temp</span>}</> : HEALTH_LABEL[health]}
        </p>
      )}
    </div>
  );
}

/** "Goblin 2 takes 12 · 7 → 0 HP · Down!" with Half / Resistant / … / Undo. */
export function AppliedNote({ applied: initial }: { applied: Applied }) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const name = a.target.name;
  const hpLine = a.hpBefore != null && a.hpAfter != null ? `${a.hpBefore} → ${a.hpAfter} HP` : HEALTH_LABEL[a.health];

  function fix(to: Factor | "undo") {
    setError(null);
    start(async () => {
      const r = await adjustEffect(a.effectId, to);
      if ("error" in r) return setError(r.error);
      setA(r);
      setTimeout(() => router.refresh(), 0);
    });
  }

  if (a.undone) {
    return <p className="rounded-xl border border-line bg-bg px-3 py-2 text-sm text-muted">Undone: {name}&apos;s HP is back to {a.hpAfter ?? "where it was"}.</p>;
  }
  const big = a.dead ? (a.target.monsterId ? "Defeated!" : "Dead!") : a.dropped ? "Down!" : a.revived ? "Back on their feet!" : null;
  return (
    <div key={`${a.effectId}${a.factor}`} className={`animate-pop rounded-xl border px-3 py-2 ${a.kind === "heal" ? "border-success-line bg-success-bg" : "border-danger-line bg-danger-bg"}`} role="status">
      <p className="text-sm">
        <span className="font-bold">{name}</span>{" "}
        {a.kind === "heal" ? <>heals <b className="text-success">{a.amount}</b></> : a.amount < 0 ? <>is hit</> : <>takes <b className="text-danger">{a.amount}</b>{a.factor !== "full" && <span className="text-muted"> ({FACTORS.find((f) => f.id === a.factor)?.label.toLowerCase()}, rolled {a.rolled})</span>}</>}
        <span className="text-muted"> · {hpLine}</span>
      </p>
      {big && <p className={`font-heading text-lg font-bold ${a.kind === "heal" ? "text-success" : "text-danger"} ${a.dropped || a.dead ? "animate-shake" : ""}`}>{big}</p>}
      {a.deathFails > 0 && !a.dead && <p className="text-xs text-danger">Hit while down: {a.deathFails} failed death save{a.deathFails > 1 ? "s" : ""}.</p>}
      {a.tempLost > 0 && <p className="text-xs text-[#7FB8D4]">{a.tempLost} came off temporary HP.</p>}
      {a.concentration && (
        <p className={`text-xs ${a.concentration.kept ? "text-soft" : "font-semibold text-danger"}`}>
          {a.concentration.reason === "down" ? `Down: ${a.concentration.spell} ends.`
            : `Concentration (${a.concentration.spell}): ${a.concentration.total} vs DC ${a.concentration.dc}, ${a.concentration.kept ? "kept" : "lost"}.`}
          {a.target.monsterId && <span className="text-muted"> (secret)</span>}
        </p>
      )}
      {a.canAdjust && (
        <div className="mt-2 flex flex-wrap gap-1">
          {a.kind === "damage" && FACTORS.map((f) => (
            <button key={f.id} type="button" disabled={pending || a.factor === f.id} onClick={() => fix(f.id)}
              className={`h-8 rounded-lg border px-2 text-xs ${a.factor === f.id ? "border-accent-strong font-bold text-text" : "border-line text-soft"}`}>{f.label}</button>
          ))}
          <button type="button" disabled={pending} onClick={() => fix("undo")} className="h-8 rounded-lg border border-line px-2 text-xs text-muted">Undo</button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Three little boxes for successes and failures. */
function Tally({ saves }: { saves: DeathSaves }) {
  const dots = (n: number, color: string, label: string) => (
    <span className="flex items-center gap-1" aria-label={`${n} ${label}`}>
      {[0, 1, 2].map((i) => <span key={i} className="inline-block h-3.5 w-3.5 rounded-full border" style={{ borderColor: color, background: i < n ? color : "transparent" }} />)}
    </span>
  );
  return (
    <div className="flex items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">Saved {dots(saves.successes, "#7BC86C", "successes")}</span>
      <span className="flex items-center gap-1.5">Failed {dots(saves.failures, "#F07A6A", "failures")}</span>
    </div>
  );
}

/** At 0 HP: death saves instead of attacks. */
export function DeathSavePanel({ combatant, characterId, name, canRoll, isDm, secret }: {
  combatant: Combatant | null; characterId: string; name: string; canRoll: boolean; isDm: boolean; secret: boolean;
}) {
  const router = useRouter();
  const dice = useDice();
  const [last, setLast] = useState<DeathSaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const saves = last?.saves ?? combatant?.deathSaves ?? null;

  if (saves?.dead) return <div className="mt-3 rounded-xl border border-danger-line bg-danger-bg p-4 text-center"><p className="font-heading text-2xl font-bold text-danger">{name} has died</p><p className="mt-1 text-sm text-soft">Only magic can bring them back now.</p></div>;
  if (last?.hp && last.hp > 0) return <p className="mt-3 rounded-xl border border-success-line bg-success-bg p-3 text-sm font-bold text-success">Natural 20! {name} is back up with 1 HP.</p>;

  return (
    <div className="mt-3 rounded-xl border border-danger-line bg-danger-bg p-4">
      <p className="font-heading text-xl font-bold text-danger">{name} is dying</p>
      {saves?.stable ? (
        <p className="mt-1 text-sm text-soft">Stable: unconscious, but no more death saves. Healing wakes them up.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-soft">Roll a d20 on your turn: 10+ is a success, 1 counts twice, 20 brings you back with 1 HP. Healing wakes you up.</p>
          {saves && <div className="mt-2"><Tally saves={saves} /></div>}
          {secret && !isDm && <p className="mt-2 text-xs text-muted">House rule: death saves are secret. Only the DM sees how they go.</p>}
          {canRoll && (
            <button type="button" disabled={pending} className="mt-3 h-14 w-full rounded-2xl bg-danger font-heading text-xl font-bold text-bg disabled:opacity-60"
              onClick={() => { setError(null); start(async () => {
                const r = await rollDeathSave(characterId);
                if ("error" in r) return setError(r.error);
                if (r.d20 != null) await dice.show({ expression: "1d20", dice: [r.d20], diceAll: [r.d20], total: r.d20, isCrit: r.d20 === 20, isFumble: r.d20 === 1, label: "Death save" });
                setLast(r);
                setTimeout(() => router.refresh(), 0);
              }); }}>
              {pending ? "Rolling…" : "Roll death save"}
            </button>
          )}
          {last && (
            <p className="mt-2 text-sm font-semibold text-text">
              {last.secret && last.d20 == null ? "Rolled in secret. The DM knows." : `Rolled ${last.d20}: ${last.outcome}.`}
            </p>
          )}
        </>
      )}
      {isDm && !saves?.stable && !saves?.dead && (
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await stabilize(characterId); if (r?.error) setError(r.error); router.refresh(); })}
          className="mt-2 h-10 w-full rounded-xl border border-line text-sm text-soft">Stabilize (Medicine / Spare the Dying)</button>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Conditions on someone in the fight. */
export function Conditions({ combatant, canEdit }: { combatant: Combatant; canEdit: boolean }) {
  const router = useRouter();
  const [list, setList] = useState<string[]>(combatant.conditions);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toggle = (c: string) => {
    const next = list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
    setList(next);
    start(async () => { await setConditions(combatant.id, next); router.refresh(); });
  };
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((c) => (
          <button key={c} type="button" disabled={!canEdit || pending} onClick={() => toggle(c)}
            className="animate-pop h-7 rounded-full border border-accent-strong bg-bg px-2.5 text-xs font-semibold text-accent" aria-label={`Remove ${c}`}>
            {c}{canEdit && " ×"}
          </button>
        ))}
        {canEdit && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="h-7 rounded-full border border-dashed border-line px-2.5 text-xs text-muted">{open ? "Done" : "+ Condition"}</button>
        )}
        {!list.length && !canEdit && <span className="text-xs text-muted">No conditions</span>}
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {CONDITIONS.map((c) => (
            <button key={c} type="button" onClick={() => toggle(c)} aria-pressed={list.includes(c)}
              className={`h-8 rounded-lg border text-[11px] ${list.includes(c) ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}
