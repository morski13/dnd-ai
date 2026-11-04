"use client";
// Combat mode on the full character sheet. The fight is shared (the DM's, or one played at the table):
// the turn order and whose turn it is come from the fight; this sheet counts your Action, Bonus action,
// Reaction and movement, offers the actions everyone has (Dash, Dodge…), your reactions off your turn,
// your conditions, and "End turn", which hands the turn to the next one in the order.
import Link from "next/link";
import { useState } from "react";
import { CONDITIONS } from "@/lib/moderator/hp";
import { actionsLeft, moveBudget, STANDARD_ACTIONS, type Turn } from "@/lib/turn";
import type { SheetCombat } from "../combat-actions";

export type ReactionChoice = { id: string; name: string; why: string; roll: boolean };

export function CombatPanel({ combat, t, perAction, speed, canEdit, pending, warning, canSurge, bonusStd, reactions, conditions, note,
  onRollInit, onEndTurn, onAction, onMove, onSurge, onDrop, onReaction, onConditions, saveHelper, onSaveHelper, onEndFight }: {
  combat: NonNullable<SheetCombat>; t: Turn; perAction: number; speed: number; canEdit: boolean; pending: boolean;
  warning: string | null; canSurge: boolean; bonusStd: Set<string>;
  reactions: ReactionChoice[]; conditions: string[]; note: string | null;
  onRollInit: () => void; onEndTurn: () => void; onAction: (name: string, asBonus: boolean) => void; onMove: (ft: number) => void;
  onSurge: () => void; onDrop: (name: string) => void; onReaction: (r: ReactionChoice) => void; onConditions: (next: string[]) => void;
  saveHelper: React.ReactNode | null; onSaveHelper: () => void;
  /** players running the game themselves (or the DM): end the whole fight here */
  onEndFight?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const myTurn = !!combat.current?.me;
  const left = actionsLeft(t);
  const budget = moveBudget(t, speed);
  const actionText = !myTurn ? "on your turn" : t.attacksLeft > 0 ? `${t.attacksLeft} more ${t.attacksLeft === 1 ? "attack" : "attacks"}` : left > 0 ? (left > 1 ? `${left} actions` : perAction > 1 ? `ready · ${perAction} attacks` : "ready") : "used";
  const next = (() => {
    const i = combat.order.findIndex((c) => c.current);
    for (let k = 1; k <= combat.order.length; k++) { const c = combat.order[(i + k) % combat.order.length]; if (!c.out) return c; }
    return null;
  })();
  const still = [...t.ongoing, ...t.thisTurn.filter((x) => x === "Dodge" || x === "Disengage")];

  return (
    <section className="mt-3 rounded-2xl border border-accent-line bg-surface p-3" aria-label="Combat">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg text-accent">⚔</span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-xl font-bold leading-tight">Combat · Round {combat.round}</p>
          <p className="text-xs text-muted">{combat.mode === "table" ? "Played at the table: the app counts turns and rolls" : "Run by the DM in Session mode"}</p>
        </div>
        <Link href="/session" className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-line px-2.5 text-xs text-soft">Session ›</Link>
      </div>

      {/* turn order */}
      <ol className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]" aria-label="Initiative order">
        {combat.order.map((c) => (
          <li key={c.id} aria-current={c.current ? "true" : undefined}
            className={`flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-2 py-1 ${c.current ? "border-accent bg-accent-surface" : c.enemy ? "border-danger-line bg-danger-bg" : "border-line bg-bg"} ${c.out ? "opacity-45" : ""}`}>
            <span className={`max-w-24 truncate text-sm font-bold ${c.enemy ? "text-danger" : c.me ? "text-accent" : ""}`}>{c.me ? "You" : c.name}</span>
            <span className="text-[11px] text-muted">{c.initiative ?? (c.hidden ? "hidden" : "–")}</span>
          </li>
        ))}
      </ol>

      {note && <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-xs text-soft" role="status">{note}</p>}

      {combat.myInitiative == null && (
        <button type="button" disabled={!canEdit || pending} onClick={onRollInit}
          className="mt-2 h-12 w-full rounded-xl bg-accent font-bold text-accent-text disabled:opacity-50">Roll initiative</button>
      )}

      <p className={`mt-2 text-center text-sm font-bold ${myTurn ? "text-accent" : "text-soft"}`} role="status">
        {myTurn ? (t.over ? "Everything used: end your turn" : "Your turn!") : combat.current ? `${combat.current.name}'s turn` : "Waiting for initiative"}
        {!myTurn && combat.waiting > 0 ? <span className="block text-xs font-normal text-muted">{combat.waiting} still {combat.waiting === 1 ? "has" : "have"} to roll initiative</span> : null}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-2" role="list" aria-label="This turn">
        <Pip label="Action" text={actionText} ready={myTurn && (left > 0 || t.attacksLeft > 0)} />
        <Pip label="Bonus action" text={!myTurn ? "on your turn" : t.bonusUsed ? "used" : "ready"} ready={myTurn && !t.bonusUsed} />
        <Pip label="Reaction" text={t.reactionUsed ? "used" : "ready"} ready={!t.reactionUsed} />
      </div>

      {/* movement */}
      {myTurn && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-bg px-3 py-1.5" aria-label="Movement">
          <p className="min-w-0 flex-1 text-sm">
            <span className="text-muted">Moved </span><b className={t.moved > budget ? "text-danger" : ""}>{t.moved}</b><span className="text-muted"> / {budget} ft</span>
            {t.dashes ? <span className="text-xs text-muted"> · Dash ×{t.dashes}</span> : null}
          </p>
          {[-5, 5, 10, 30].map((ft) => (
            <button key={ft} type="button" disabled={!canEdit || (ft < 0 && t.moved === 0)} onClick={() => onMove(ft)} aria-label={`${ft < 0 ? "Take back" : "Move"} ${Math.abs(ft)} feet`}
              className="h-9 min-w-9 rounded-lg border border-line px-1.5 text-xs font-bold text-soft disabled:opacity-40">{ft > 0 ? `+${ft}` : ft}</button>
          ))}
        </div>
      )}

      {still.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Still on:</span>
          {still.map((n) => (
            <button key={n} type="button" onClick={() => onDrop(n)} aria-label={`${n} has ended`}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-accent-line px-2.5 font-bold text-accent">{n} <span aria-hidden className="text-muted">✕</span></button>
          ))}
        </div>
      )}
      {warning && <p role="alert" className="mt-2 rounded-lg border border-accent-line bg-accent-surface px-3 py-2 text-xs text-accent">{warning}</p>}

      {/* the actions everyone has */}
      {myTurn && !t.over && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Actions anyone can take</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-1.5">
            {STANDARD_ACTIONS.map((a) => {
              const asBonus = bonusStd.has(a.name);
              const noAction = left === 0;
              return (
                <li key={a.name} className="flex gap-1">
                  <button type="button" disabled={!canEdit || pending} onClick={() => onAction(a.name, false)} title={a.what}
                    className={`min-h-11 min-w-0 flex-1 rounded-lg border px-2 text-left text-sm font-semibold ${noAction ? "border-line text-muted" : "border-line bg-bg"}`}>
                    {a.name}<span className="block text-[10px] font-normal text-muted">{noAction ? "no action left" : "uses your action"}</span>
                  </button>
                  {asBonus && (
                    <button type="button" disabled={!canEdit || pending || t.bonusUsed} onClick={() => onAction(a.name, true)} aria-label={`${a.name} as a bonus action (Cunning Action)`}
                      className="min-h-11 shrink-0 rounded-lg border border-accent-line px-2 text-[11px] font-bold text-accent disabled:opacity-40">Bonus</button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[11px] text-muted">Attacks and spells: tap them on your sheet as usual. They count here by themselves.</p>
        </div>
      )}

      {/* reactions: any time, also on other turns */}
      {reactions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Reactions {myTurn ? "" : "· on anyone's turn"}</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {reactions.map((r) => (
              <li key={r.id}>
                <button type="button" disabled={!canEdit || pending || t.reactionUsed} onClick={() => onReaction(r)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5 text-left disabled:opacity-45">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{r.name}</span>
                    <span className="block text-[11px] leading-snug text-muted">{r.why}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-accent">{t.reactionUsed ? "used" : r.roll ? "Roll" : "Use"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* conditions: they stay after the fight, until removed or a long rest */}
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">Conditions</span>
          {conditions.length === 0 && <span className="text-xs text-muted">none</span>}
          {conditions.map((c) => (
            <button key={c} type="button" disabled={!canEdit} onClick={() => onConditions(conditions.filter((x) => x !== c))} aria-label={`Remove ${c}`}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-danger-line bg-danger-bg px-2.5 text-xs font-bold text-danger">{c} <span aria-hidden>✕</span></button>
          ))}
          {canEdit && !adding && <button type="button" onClick={() => setAdding(true)} className="h-8 rounded-full border border-line px-2.5 text-xs text-soft">+ Add</button>}
        </div>
        {adding && (
          <select autoFocus aria-label="Add a condition" defaultValue="" onChange={(e) => { if (e.target.value) onConditions([...conditions, e.target.value]); setAdding(false); }} onBlur={() => setAdding(false)}
            className="mt-1.5 h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm">
            <option value="">Pick a condition…</option>
            {CONDITIONS.filter((c) => !conditions.includes(c) && c !== "Concentrating").map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {saveHelper ?? (
        <button type="button" disabled={!canEdit} onClick={onSaveHelper} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg border border-line px-3 text-left text-sm">
          <span><b>Hit by a spell?</b> <span className="text-muted">Roll the save, take the damage</span></span><span aria-hidden className="text-accent">›</span>
        </button>
      )}

      <div className="mt-3 flex gap-2">
        {myTurn && canSurge && left === 0 && !t.over && <button type="button" onClick={onSurge} className="h-11 flex-1 rounded-xl border border-accent-line px-3 text-sm font-bold text-accent">+ Action Surge</button>}
        {myTurn && (
          <button type="button" disabled={!canEdit || pending} onClick={onEndTurn}
            className={`h-11 flex-[2] rounded-xl px-3 text-sm font-bold disabled:opacity-50 ${t.over ? "bg-accent text-accent-text" : "border border-line text-soft"}`}>
            End turn{next && !next.current ? ` → ${next.me ? "you" : next.name}` : ""}
          </button>
        )}
      </div>
      {onEndFight && (
        <button type="button" disabled={!canEdit || pending} onClick={() => { if (confirm("End the fight for everyone?")) onEndFight(); }}
          className="mt-2 h-10 w-full rounded-xl text-xs text-muted underline">End the fight</button>
      )}
    </section>
  );
}

function Pip({ label, text, ready }: { label: string; text: string; ready: boolean }) {
  return (
    <div role="listitem" className={`rounded-xl border px-2 py-2 text-center ${ready ? "border-accent-line bg-accent-surface" : "border-line bg-bg opacity-70"}`}>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`text-sm font-bold ${ready ? "text-accent" : "text-muted"} ${text === "used" ? "line-through" : ""}`}>{text}</p>
    </div>
  );
}
