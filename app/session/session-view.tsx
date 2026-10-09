"use client";
// Session mode screen (mockup "4 · Session mode").
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SessionData } from "@/lib/session-data";
import { endCombat, startSession } from "./actions";
import { DmPanel } from "./parts/dm-panel";
import { FreeRoll } from "./parts/free-roll";
import { MonsterCard } from "./parts/monster-card";
import { TableLog } from "./parts/table-log";
import { TurnCard } from "./parts/turn-card";
import { useLive } from "./use-live";

export function SessionView({ data }: { data: SessionData }) {
  useLive(data.campaign.id, data.session?.id ?? null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!data.session) {
    return (
      <>
        <p className="text-xs uppercase tracking-[0.12em] text-muted">{data.campaign.name}</p>
        <h1 className="mt-1 font-heading text-3xl font-bold">Session mode</h1>
        <section className="mt-6 rounded-[18px] border border-[#5A4024] bg-accent-surface p-5">
          <h2 className="font-heading text-2xl font-semibold">Session {data.nextSessionNumber} is ready</h2>
          <p className="mt-2 text-[15px] text-soft">All rolls are saved and turned into stats when the session ends.</p>
          {data.isDm ? (
            <button type="button" disabled={pending}
              onClick={() => start(async () => { const r = await startSession(); if (r?.error) setError(r.error); })}
              className="mt-5 h-12 rounded-xl bg-accent px-6 text-[15px] font-bold text-accent-text disabled:opacity-60">
              {pending ? "Starting…" : "Start session"}
            </button>
          ) : (
            <p className="mt-5 text-sm text-muted">Waiting for the DM to start. This screen updates by itself.</p>
          )}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </section>
        <div className="mt-5"><FreeRoll characterId={data.myCharacterIds[0] ?? null} isDm={data.isDm} /></div>
      </>
    );
  }

  const { combat, combatants, current } = data;
  const mine = combatants.find((c) => c.isMine);
  const focusChar = data.focus?.character ?? null;
  const focusCombatant = focusChar ? combatants.find((c) => c.characterId === focusChar.id) : null;
  const monsterIdsInFight = combatants.filter((c) => c.monsterId).map((c) => c.monsterId!) ;
  const waiting = combatants.filter((c) => c.initiative == null && !c.hidden).length;

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-[#F07A6A]">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#F07A6A]" />
            Live · Session {data.session.number}
          </p>
          <h1 className="mt-1 font-heading text-[26px] font-bold leading-tight">{combat ? `Combat · Round ${combat.round}` : "Exploring"}</h1>
        </div>
        {data.isDm && combat && (
          <button type="button" disabled={pending}
            onClick={() => start(async () => { await endCombat(combat.id); router.refresh(); })}
            className="h-11 shrink-0 rounded-xl border border-line bg-surface px-4 text-sm font-semibold">
            End combat
          </button>
        )}
      </header>

      {/* Initiative order */}
      {combat && (
        <nav className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Initiative order">
          {combatants.map((c) => {
            const isCurrent = current?.id === c.id;
            const cls = `flex min-h-16 min-w-20 shrink-0 flex-col items-center justify-center rounded-2xl border px-3 ${
              isCurrent ? "border-accent bg-accent-surface" : c.monsterId && !c.ally ? "border-danger-line bg-danger-bg" : "border-line bg-surface"}`;
            const inner = (
              <>
                <span className={`text-[15px] font-bold ${c.monsterId && !c.ally ? "text-danger" : ""}`}>{c.shortName}</span>
                <span className="text-xs text-muted">{c.initiative ?? (c.hidden ? "hidden" : "–")}</span>
              </>
            );
            const href = c.controllable ? `/session?focus=${c.monsterId ? `m:${c.monsterId}` : `c:${c.characterId}`}` : null;
            return href
              ? <Link key={c.id} href={href} scroll={false} className={cls} aria-current={isCurrent ? "true" : undefined}>{inner}</Link>
              : <div key={c.id} className={cls} aria-current={isCurrent ? "true" : undefined}>{inner}</div>;
          })}
        </nav>
      )}
      {combat && current && !current.controllable && (
        <p className="mt-3 text-sm text-muted">Waiting for <strong className="text-text">{current.name}</strong>…</p>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {data.focusMonster && data.isDm ? (
          <MonsterCard
            key={data.focusMonster.id}
            monster={data.focusMonster}
            isTurn={current?.monsterId === data.focusMonster.id}
            party={combatants.filter((c) => c.characterId)}
            hiddenByDefault={data.monstersHiddenByDefault}
          />
        ) : focusChar && data.focus ? (
          <TurnCard
            key={focusChar.id}
            character={focusChar}
            library={data.focus.library}
            canEdit={data.focus.canEdit}
            combatants={combatants}
            isTurn={!!combat && current?.characterId === focusChar.id}
            inCombat={!!combat}
            myInitiative={focusCombatant ? focusCombatant.initiative : undefined}
          />
        ) : !data.isDm ? (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-semibold">You don&apos;t have a character yet</p>
            <p className="mt-1 text-sm text-muted">Claim one on the <Link href="/characters" className="text-accent underline">Characters</Link> screen.</p>
          </div>
        ) : null}

        {data.isDm && (
          <DmPanel
            sessionId={data.session.id}
            combatId={combat?.id ?? null}
            monsters={data.monsters}
            inFightIds={monsterIdsInFight}
            hiddenByDefault={data.monstersHiddenByDefault}
            waitingForInitiative={waiting}
            savedFights={data.savedFights}
          />
        )}

        <FreeRoll characterId={mine?.characterId ?? data.myCharacterIds[0] ?? null} isDm={data.isDm} />
        <TableLog rows={data.log} />
      </div>
    </>
  );
}
