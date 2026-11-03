"use client";
// DM: build a fight on the spot. Search the monster library, add your homebrew monsters and NPCs, bring in
// your own characters, and see the odds of the fight before you start it (DM only). Also adds to a running fight.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Odds } from "@/lib/encounter/live";
import { planCount, type FightPlan, type PlanPick, type Side } from "@/lib/fight-plan";
import type { FightBuilderData } from "@/lib/session-data";
import { SrdSearch } from "../../fights/[id]/parts/add-monsters";
import { addToFight, planOddsInput, startQuickFight } from "../build-actions";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const KIND_LABEL = { homebrew: "Homebrew", npc: "NPC", monster: "Monster" } as const;

export function FightBuilder({ mode, data, inFightIds = [], onDone }: {
  mode: { kind: "start"; sessionId: string } | { kind: "add"; combatId: string };
  data: FightBuilderData;
  inFightIds?: string[];       // characters and monsters already fighting (add mode)
  onDone?: () => void;
}) {
  const router = useRouter();
  const adding = mode.kind === "add";
  const [players, setPlayers] = useState<string[]>(adding ? [] : data.players.map((p) => p.id));
  const [dmChars, setDmChars] = useState<string[]>([]);
  const [picks, setPicks] = useState<PlanPick[]>([]);
  const [side, setSide] = useState<Side>("enemy");
  const [tab, setTab] = useState<"search" | "yours" | "characters">("search");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const plan: FightPlan = useMemo(() => ({ players, dmCharacters: dmChars, picks }), [players, dmChars, picks]);
  const n = planCount(plan);
  const freePlayers = data.players.filter((p) => !inFightIds.includes(p.id));
  const freeDmChars = data.dmCharacters.filter((c) => !inFightIds.includes(c.id));
  const freeCreatures = data.creatures.filter((c) => !inFightIds.includes(c.id));

  function add(p: Omit<PlanPick, "count">, single = false) {
    setPicks((all) => {
      const i = all.findIndex((x) => x.source === p.source && x.ref === p.ref && x.side === p.side);
      if (i >= 0) return single ? all : all.map((x, j) => (j === i ? { ...x, count: Math.min(20, x.count + 1) } : x));
      return [...all, { ...p, count: 1 }];
    });
  }
  const setCount = (i: number, c: number) => setPicks((all) => (c <= 0 ? all.filter((_, j) => j !== i) : all.map((x, j) => (j === i ? { ...x, count: Math.min(20, c) } : x))));
  const flip = (i: number) => setPicks((all) => all.map((x, j) => (j === i ? { ...x, side: x.side === "enemy" ? "ally" : "enemy" } : x)));
  const isTemplate = (p: PlanPick) => p.source === "srd" || data.creatures.find((c) => c.id === p.ref)?.kind === "homebrew";

  function go() {
    setError(null);
    start(async () => {
      const res = mode.kind === "start" ? await startQuickFight(mode.sessionId, plan, name) : await addToFight(mode.combatId, plan);
      if ("error" in res) { setError(res.error); return; }
      setPicks([]); setDmChars([]);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <p className="font-semibold">{adding ? "Add to the fight" : "Build a fight"}</p>

      {!adding && (
        <>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted">Players</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {data.players.length === 0 && <p className="text-sm text-muted">No player characters in this campaign yet.</p>}
            {data.players.map((p) => {
              const on = players.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => setPlayers(on ? players.filter((x) => x !== p.id) : [...players, p.id])}
                  className={`min-h-10 rounded-full border px-3 text-sm ${on ? "border-accent-strong bg-accent-surface font-semibold" : "border-line text-muted line-through"}`}>
                  {p.name} <span className="text-xs text-muted">lv {p.level}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {adding && freePlayers.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Players not in it yet:</span>
          {freePlayers.map((p) => {
            const on = players.includes(p.id);
            return <button key={p.id} type="button" aria-pressed={on} onClick={() => setPlayers(on ? players.filter((x) => x !== p.id) : [...players, p.id])}
              className={`min-h-9 rounded-full border px-3 text-sm ${on ? "border-accent-strong bg-accent-surface font-semibold" : "border-line text-soft"}`}>{on ? "✓ " : "+ "}{p.name}</button>;
          })}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 rounded-xl bg-bg p-1" role="group" aria-label="Side for what you add">
        {(["enemy", "ally"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSide(s)} aria-pressed={side === s}
            className={`h-10 rounded-lg text-sm ${side === s ? "bg-surface font-bold" : "text-muted"}`}>
            {s === "enemy" ? "Add as enemy" : "Add as ally"}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {([["search", "Search"], ["yours", `Yours (${freeCreatures.length})`], ["characters", `Your characters (${freeDmChars.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`min-h-10 flex-1 rounded-lg border px-1 text-xs leading-tight ${tab === k ? "border-accent-strong font-bold" : "border-line text-soft"}`}>{l}</button>
        ))}
      </div>

      {tab === "search" && <SrdSearch partyLevel={data.partyLevel} onAdd={(st) => add({ source: "srd", ref: st.name, name: st.name, side })} />}

      {tab === "yours" && (
        <ul className="mt-3 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {freeCreatures.length === 0 && <li className="text-sm text-muted">Monsters and NPCs you make in Homebrew show up here.</li>}
          {freeCreatures.map((m) => {
            const picked = picks.find((p) => p.source === "campaign" && p.ref === m.id);
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}</p>
                  <p className="text-xs text-muted">{KIND_LABEL[m.kind]} · AC {m.ac ?? "?"} · HP {m.hp ?? "?"}{m.hpMax && m.hp !== m.hpMax ? ` / ${m.hpMax}` : ""}{m.simulated ? "" : " · no stat block, not in the odds"}</p>
                </div>
                <button type="button" disabled={!!picked && m.kind !== "homebrew"}
                  onClick={() => add({ source: "campaign", ref: m.id, name: m.name, side }, m.kind !== "homebrew")}
                  className="h-11 shrink-0 rounded-xl border border-line px-3 text-sm disabled:opacity-50">{picked && m.kind !== "homebrew" ? "Added" : "Add"}</button>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "characters" && (
        <ul className="mt-3 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {freeDmChars.length === 0 && <li className="text-sm text-muted">Characters you make (NPCs with a full sheet) show up here. Players&apos; characters are listed above.</li>}
          {freeDmChars.map((c) => {
            const on = dmChars.includes(c.id);
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{c.name}</p><p className="text-xs text-muted">Level {c.level}{c.unclaimed ? " · not claimed by a player" : ""} · fights on the party&apos;s side</p></div>
                <button type="button" onClick={() => setDmChars(on ? dmChars.filter((x) => x !== c.id) : [...dmChars, c.id])}
                  className={`h-11 shrink-0 rounded-xl border px-3 text-sm ${on ? "border-accent-strong text-accent" : "border-line"}`}>{on ? "Added ✓" : "Add"}</button>
              </li>
            );
          })}
        </ul>
      )}

      {(picks.length > 0 || dmChars.length > 0) && (
        <>
          <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">{adding ? "Joining now" : "In this fight"}</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {picks.map((p, i) => (
              <li key={`${p.source}:${p.ref}:${p.side}`} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                <button type="button" onClick={() => flip(i)} title="Switch side"
                  className={`h-8 shrink-0 rounded-full border px-2 text-xs font-bold ${p.side === "enemy" ? "border-danger-line text-danger" : "border-success-line text-success"}`}>
                  {p.side === "enemy" ? "Enemy" : "Ally"}
                </button>
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                {isTemplate(p) ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => setCount(i, p.count - 1)} aria-label={`One less ${p.name}`} className="h-9 w-9 rounded-lg border border-line text-lg">−</button>
                    <span className="w-6 text-center tabular-nums">{p.count}</span>
                    <button type="button" onClick={() => setCount(i, p.count + 1)} aria-label={`One more ${p.name}`} className="h-9 w-9 rounded-lg border border-line text-lg">+</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setCount(i, 0)} aria-label={`Take ${p.name} out`} className="h-9 w-9 shrink-0 rounded-lg border border-line">✕</button>
                )}
              </li>
            ))}
            {dmChars.map((id) => {
              const c = data.dmCharacters.find((x) => x.id === id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                  <span className="h-8 shrink-0 rounded-full border border-success-line px-2 text-xs font-bold leading-8 text-success">Ally</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{c?.name ?? "?"}</span>
                  <button type="button" onClick={() => setDmChars(dmChars.filter((x) => x !== id))} aria-label={`Take ${c?.name} out`} className="h-9 w-9 shrink-0 rounded-lg border border-line">✕</button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <PlanOdds plan={plan} combatId={mode.kind === "add" ? mode.combatId : null} />

      {!adding && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fight name (optional), e.g. Bridge ambush"
          className="mt-3 h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent" />
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={pending || (!adding && n.enemies === 0) || (adding && !picks.length && !dmChars.length && !players.length)} onClick={go}
        className="mt-2 h-12 w-full rounded-xl bg-accent font-bold text-accent-text disabled:opacity-50">
        {pending ? "…" : adding
          ? `Add to the fight${n.enemies + n.allies + n.players ? ` (${n.enemies + n.allies + n.players})` : ""}`
          : n.enemies ? `Start fight · ${n.players} players vs ${n.enemies} ${n.enemies === 1 ? "enemy" : "enemies"}${n.allies ? ` + ${n.allies} ${n.allies === 1 ? "ally" : "allies"}` : ""}` : "Add an enemy to start"}
      </button>
    </div>
  );
}

/** DM only: the odds of the planned fight, played 500 times in the browser, redone after every change. */
function PlanOdds({ plan, combatId }: { plan: FightPlan; combatId: string | null }) {
  const [state, setState] = useState<{ odds: Odds | null; notCounted: string[]; busy: boolean; error?: string }>({ odds: null, notCounted: [], busy: false });
  const ask = useRef(0);
  const key = JSON.stringify(plan);
  const empty = !plan.picks.length && !plan.dmCharacters.length && (!combatId || !plan.players.length);
  useEffect(() => {
    if (empty) return;
    const id = ++ask.current;
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, busy: true }));
      const got = await planOddsInput(JSON.parse(key) as FightPlan, combatId).catch(() => ({ error: "Couldn't work out the odds." }));
      if (id !== ask.current) return;
      if ("error" in got) { setState({ odds: null, notCounted: [], busy: false, error: got.error }); return; }
      const { odds } = await import("@/lib/encounter/live");
      await new Promise((r) => setTimeout(r, 0)); // let the screen paint first
      const o = odds(got.input);
      if (id === ask.current) setState({ odds: o, notCounted: got.notCounted, busy: false });
    }, 500);
    return () => clearTimeout(t);
  }, [key, combatId, empty]);

  if (empty) return null;
  const o = state.odds;
  const tone = !o ? "border-line text-muted" : o.pWin >= 0.85 ? "border-success-line text-success" : o.pWin >= 0.6 ? "border-accent-line text-accent" : "border-danger-line text-danger";
  return (
    <div className={`mt-3 rounded-xl border bg-surface px-3 py-2 text-sm ${tone}`} aria-live="polite">
      <div className="flex items-center gap-2">
        <span aria-hidden>📊</span>
        <span className="min-w-0 flex-1">
          {state.error ? state.error
            : state.busy && !o ? "Working out the odds…"
            : o ? <><b>{combatId ? "With them in it:" : "If you start now:"}</b> party wins {pct(o.pWin)} · someone drops {pct(o.pDown)} · death {pct(o.pDeath)}</>
            : "Add enemies with a stat block to see the odds."}
        </span>
        <span className="shrink-0 text-xs text-muted">DM only</span>
      </div>
      {state.notCounted.length > 0 && <p className="mt-1 text-xs text-muted">Not counted (no stat block): {state.notCounted.join(", ")}</p>}
    </div>
  );
}
