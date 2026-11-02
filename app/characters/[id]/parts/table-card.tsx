"use client";
// "Track this game" + fight mode, on the character sheet.
//  - Tracking: when the DM doesn't run Session mode, a player starts a session here so the table's rolls
//    count in everyone's stats. If one is running (the DM's or another player's), the sheet just shows it.
//  - Fight mode: the app counts this turn's Action (and the attacks in it), Bonus Action and Reaction.
//    "End turn" any time; when everything is used the turn closes by itself.
import { useState, useTransition } from "react";
import type { TableSession } from "@/lib/roll-service";
import { actionsLeft, actionSurge, endLine, NEW_FIGHT, nextTurn, type Turn } from "@/lib/turn";
import { endTableSession, startTableSession } from "../../../session/actions";
import type { Fight } from "./fight-store";

export function TableCard({ characterId, canEdit, live, setLive, fight, setFight, perAction, canSurge, spendSurge, warning }: {
  characterId: string; canEdit: boolean;
  live: TableSession; setLive: (s: TableSession) => void;
  fight: Fight; setFight: (f: Fight | ((f: Fight) => Fight)) => void;
  perAction: number; canSurge: boolean; spendSurge: () => void; warning: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = fight.on && fight.sessionId === (live?.id ?? null) ? fight.turn : null;

  const track = () => start(async () => {
    setError(null);
    const r = await startTableSession(characterId);
    if ("error" in r) return setError(r.error);
    setLive(r.session);
  });
  const stop = () => start(async () => {
    if (!live) return;
    setError(null);
    const r = await endTableSession(characterId, live.id);
    if ("error" in r) return setError(r.error);
    setLive(null);
    setFight({ on: false, turn: NEW_FIGHT, sessionId: null });
  });
  const fightOn = () => setFight({ on: true, turn: NEW_FIGHT, sessionId: live?.id ?? null });
  const fightOff = () => setFight({ on: false, turn: NEW_FIGHT, sessionId: null });

  return (
    <section className="mt-3 rounded-2xl border border-line bg-surface p-3" aria-label="Game tracking and fight mode">
      {/* tracking */}
      <div className="flex items-center gap-3">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${live ? "animate-pulse bg-danger" : "bg-line"}`} />
        <div className="min-w-0 flex-1 text-sm">
          {live ? (
            <>
              <p className="font-semibold">Session {live.number} · rolls count in the stats</p>
              <p className="text-xs text-muted">{live.kind === "dm" ? "Run by the DM in Session mode" : `Started by ${live.mine ? "you" : live.startedBy ?? "a player"} · the DM can take over in Session`}</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Not tracking this game</p>
              <p className="text-xs text-muted">Rolls are saved, but only rolls in a session count in the stats.</p>
            </>
          )}
        </div>
        {canEdit && !live && <button type="button" onClick={track} disabled={pending} className="h-10 shrink-0 rounded-xl bg-accent px-3 text-sm font-bold text-accent-text disabled:opacity-60">{pending ? "…" : "Track game"}</button>}
        {canEdit && live?.kind === "table" && <button type="button" onClick={stop} disabled={pending} className="h-10 shrink-0 rounded-xl border border-line px-3 text-sm font-bold text-soft disabled:opacity-60">{pending ? "…" : "End"}</button>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}

      {/* fight mode */}
      {canEdit && live && (
        <div className="mt-3 border-t border-line pt-3">
          <button type="button" role="switch" aria-checked={!!t} onClick={t ? fightOff : fightOn}
            className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
            <span className="min-w-0">
              <span className={`block font-semibold ${t ? "text-accent" : ""}`}>⚔ Fight mode</span>
              <span className="block text-xs text-muted">{t ? `Round ${t.round} · the app counts your actions` : "Count actions and bonus actions each turn"}</span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${t ? "bg-accent" : "bg-line"}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${t ? "left-6" : "left-1"}`} />
            </span>
          </button>
          {t && <TurnPanel t={t} perAction={perAction} canSurge={canSurge} warning={warning}
            onEnd={() => setFight((f) => ({ ...f, turn: { ...f.turn, over: true } }))}
            onNext={() => setFight((f) => ({ ...f, turn: nextTurn(f.turn) }))}
            onSurge={() => { setFight((f) => ({ ...f, turn: actionSurge(f.turn) })); spendSurge(); }}
            onDrop={(name) => setFight((f) => ({ ...f, turn: { ...f.turn, ongoing: f.turn.ongoing.filter((x) => x !== name) } }))} />}
        </div>
      )}
    </section>
  );
}

function TurnPanel({ t, perAction, canSurge, warning, onEnd, onNext, onSurge, onDrop }: {
  t: Turn; perAction: number; canSurge: boolean; warning: string | null; onEnd: () => void; onNext: () => void; onSurge: () => void; onDrop: (name: string) => void;
}) {
  if (t.over) {
    return (
      <div className="animate-rise mt-2 rounded-xl border border-accent-line bg-accent-surface px-4 py-4 text-center" role="status">
        <p className="font-heading text-2xl font-bold text-accent">Your turn is over</p>
        <p className="mt-1 text-sm text-soft">{endLine(t.round)}</p>
        <p className="mt-2 text-xs text-muted">Reaction: {t.reactionUsed ? "used" : "ready (it comes back on your next turn)"}</p>
        <button type="button" onClick={onNext} className="mt-3 h-11 w-full rounded-xl bg-accent font-bold text-accent-text">Start my next turn (round {t.round + 1})</button>
      </div>
    );
  }
  const left = actionsLeft(t);
  const actionText = t.attacksLeft > 0 ? `${t.attacksLeft} more ${t.attacksLeft === 1 ? "attack" : "attacks"}` : left > 0 ? (left > 1 ? `${left} actions` : perAction > 1 ? `ready · ${perAction} attacks` : "ready") : "used";
  return (
    <div className="mt-2">
      <div className="grid grid-cols-3 gap-2" role="list" aria-label="This turn">
        <Pip label="Action" text={actionText} ready={left > 0 || t.attacksLeft > 0} />
        <Pip label="Bonus action" text={t.bonusUsed ? "used" : "ready"} ready={!t.bonusUsed} />
        <Pip label="Reaction" text={t.reactionUsed ? "used" : "ready"} ready={!t.reactionUsed} />
      </div>
      {t.ongoing.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Still on:</span>
          {t.ongoing.map((n) => (
            <button key={n} type="button" onClick={() => onDrop(n)} aria-label={`${n} has ended`}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-accent-line px-2.5 font-bold text-accent">{n} <span aria-hidden className="text-muted">✕</span></button>
          ))}
        </div>
      )}
      {warning && <p role="alert" className="mt-2 rounded-lg border border-accent-line bg-accent-surface px-3 py-2 text-xs text-accent">{warning}</p>}
      <div className="mt-2 flex gap-2">
        {canSurge && left === 0 && <button type="button" onClick={onSurge} className="h-10 flex-1 rounded-xl border border-accent-line px-3 text-sm font-bold text-accent">+ Action Surge</button>}
        <button type="button" onClick={onEnd} className="h-10 flex-1 rounded-xl border border-line px-3 text-sm font-bold text-soft">End turn</button>
      </div>
    </div>
  );
}

function Pip({ label, text, ready }: { label: string; text: string; ready: boolean }) {
  return (
    <div role="listitem" className={`rounded-xl border px-2 py-2 text-center ${ready ? "border-accent-line bg-accent-surface" : "border-line bg-bg opacity-70"}`}>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`text-sm font-bold ${ready ? "text-accent" : "text-muted line-through"}`}>{text}</p>
    </div>
  );
}
