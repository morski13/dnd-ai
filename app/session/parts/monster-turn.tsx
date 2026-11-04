"use client";
// DM: a monster's turn in one place. Best moves (the app suggests, the DM picks), Multiattack rolled attack by
// attack (a hit rolls its damage; reactions still get their few seconds), breath weapons with recharge,
// and legendary actions.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { Combatant } from "@/lib/session-data";
import { monsterRoll, type QuickRoll } from "../actions";
import { windowState } from "../reaction-actions";
import { monsterTurn, setRecharge, spendLegendary, rollSaveAction, type TurnInfo } from "../monster-actions";
import { useDice } from "../../components/dice/dice-provider";
import { Segment } from "./bits";

type Attack = TurnInfo["attacks"][number];

export function MonsterTurn({ monsterId, party, targetId, setTargetId, hidden, onRolled, isTurn }: {
  monsterId: string; party: Combatant[]; targetId: string | null; setTargetId: (id: string | null) => void; hidden: boolean;
  onRolled: (r: QuickRoll) => void; isTurn: boolean;
}) {
  const router = useRouter();
  const dice = useDice();
  const [info, setInfo] = useState<TurnInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [left, setLeft] = useState<string[]>([]); // attacks of a Multiattack still to roll (the target went down)
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [breath, setBreath] = useState<{ name: string; picked: string[] } | null>(null);

  const load = useCallback(() => {
    monsterTurn(monsterId).then((r) => { if ("error" in r) setError(r.error); else { setInfo(r); setError(null); } }).catch(() => {});
  }, [monsterId]);
  useEffect(() => { load(); }, [load, isTurn]);

  const target = party.find((p) => p.characterId === targetId) ?? null;

  /** Waits for a reaction pop-up to close; the attack may have turned into a miss (Shield). */
  async function waitWindow(w: QuickRoll["window"], success: boolean | null) {
    if (!w) return success;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const st = await windowState(w.id).catch(() => null);
      if (st && !("error" in st) && !st.open) {
        if (st.used.length) setLog((l) => [...l, `Reacted: ${st.used.join(", ")}`]);
        return st.success ?? success;
      }
    }
    return success;
  }

  /** Rolls the attacks one by one on the target; each hit rolls its damage. Stops when the target drops. */
  async function runAttacks(names: string[], on: string | null) {
    if (!info || !on) { setError("Pick a target first."); return; }
    setBusy(true); setError(null); setLog([]); setLeft([]);
    const all: Attack[] = [...info.attacks, ...info.bonus.map((b) => ({ ...b, ranged: false }))];
    for (let i = 0; i < names.length; i++) {
      const a = all.find((x) => x.name === names[i]);
      if (!a) continue;
      const atk = await monsterRoll(monsterId, { label: a.name, expression: `1d20${a.bonus >= 0 ? "+" : ""}${a.bonus}`, kind: "attack", hidden, targetCharacterId: on });
      if ("error" in atk) { setError(atk.error); break; }
      await dice.show({ ...atk, tone: "plain" });
      onRolled(atk);
      const hit = await waitWindow(atk.window, atk.success);
      if (!hit) { setLog((l) => [...l, `${a.name}: ${atk.total}${atk.isFumble ? " (natural 1)" : ""}, miss`]); continue; }
      const dmg = await monsterRoll(monsterId, { label: `${a.name} damage`, expression: a.damage, kind: "damage", hidden, targetCharacterId: on, crit: atk.isCrit, damageType: a.type });
      if ("error" in dmg) { setError(dmg.error); break; }
      await dice.show({ ...dmg, tone: "damage" });
      onRolled(dmg);
      const ap = dmg.applied;
      setLog((l) => [...l, `${a.name}: ${atk.total}${atk.isCrit ? " CRIT" : ""}, hit · ${ap ? ap.amount : dmg.total} ${a.type ?? "damage"}${ap?.defense ? ` (${ap.defense})` : ""}${ap?.dropped ? ` · ${ap.target.name} is down` : ""}`]);
      if (dmg.window) await waitWindow(dmg.window, null);
      if (ap?.dropped || ap?.hpAfter === 0) {
        const rest = names.slice(i + 1);
        if (rest.length) { setLeft(rest); setLog((l) => [...l, `${rest.length} attack${rest.length > 1 ? "s" : ""} left: pick another target and continue.`]); }
        break;
      }
    }
    setBusy(false);
    load();
    setTimeout(() => router.refresh(), 0);
  }

  function rollBreath() {
    if (!breath) return;
    const b = breath;
    start(async () => {
      const r = await rollSaveAction(monsterId, b.name, b.picked, hidden);
      if ("error" in r) return setError(r.error);
      if (r.total != null) await dice.show({ label: b.name, expression: r.expression ?? "", total: r.total, dice: [], diceAll: [], modifier: 0, isCrit: false, isFumble: false, success: null, target: null, hidden, tone: "damage" } as QuickRoll & { tone: "damage" });
      setLog([`${b.name}:`, ...r.lines]); setBreath(null);
      load();
      setTimeout(() => router.refresh(), 0);
    });
  }

  function legendary(delta: 1 | -1) {
    start(async () => {
      const r = await spendLegendary(monsterId, delta);
      if ("error" in r) return setError(r.error);
      setInfo((i) => (i?.legendary ? { ...i, legendary: { ...i.legendary, left: r.left } } : i));
    });
  }

  if (!info) return error ? <p className="mt-3 text-xs text-muted">{error}</p> : null;
  const live = party.filter((p) => !p.out);
  const working = busy || pending;

  return (
    <div className="mt-3 rounded-xl border border-line bg-bg p-3" aria-label="Monster turn">
      {!info.ready && <p className="mb-2 text-xs text-danger">Run supabase/40-monster-turns.sql to keep track of recharge and legendary actions.</p>}

      {/* the app suggests, the DM picks */}
      {info.moves.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Best moves</p>
          <ol className="mt-1 space-y-1.5">
            {info.moves.map((m, i) => (
              <li key={m.title} className="rounded-lg border border-line bg-surface px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-accent">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{m.title}</p>
                    <ul className="text-xs text-soft">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                  <button type="button" disabled={working} onClick={() => {
                    const p = party.find((x) => x.id === m.targetId);
                    if (!p?.characterId) return;
                    setTargetId(p.characterId);
                    if (m.save) setBreath({ name: m.save, picked: [p.characterId] });
                    else void runAttacks(m.attacks, p.characterId);
                  }} className="h-9 shrink-0 rounded-lg bg-accent px-3 text-xs font-bold text-accent-text disabled:opacity-50">Do it</button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* target for the attacks */}
      <p className="mt-3 text-xs text-muted">Target</p>
      <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
        {live.map((p) => (
          <Segment key={p.id} active={targetId === p.characterId} onClick={() => setTargetId(p.characterId)}>{p.shortName}{p.hp === 0 ? " (down)" : ""}</Segment>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {info.multi && (
          <button type="button" disabled={working || !target} onClick={() => runAttacks(info.multi!, targetId)}
            className="min-h-10 rounded-lg bg-accent px-3 text-sm font-bold text-accent-text disabled:opacity-50">
            Multiattack: {info.multi.join(", ")}
          </button>
        )}
        {info.attacks.map((a) => (
          <button key={a.name} type="button" disabled={working || !target} onClick={() => runAttacks([a.name], targetId)}
            className="min-h-10 rounded-lg border border-line px-3 text-sm disabled:opacity-50">
            {a.name} {a.bonus >= 0 ? "+" : ""}{a.bonus} · {a.damage}
          </button>
        ))}
        {info.bonus.map((a) => (
          <button key={`b${a.name}`} type="button" disabled={working || !target} onClick={() => runAttacks([a.name], targetId)}
            className="min-h-10 rounded-lg border border-line px-3 text-sm disabled:opacity-50">
            Bonus: {a.name} · {a.damage}
          </button>
        ))}
        {left.length > 0 && (
          <button type="button" disabled={working || !target} onClick={() => runAttacks(left, targetId)}
            className="min-h-10 rounded-lg border border-accent bg-accent-surface px-3 text-sm font-bold text-accent disabled:opacity-50">
            Continue: {left.join(", ")}{target ? ` on ${target.shortName}` : ""}
          </button>
        )}
      </div>

      {/* breath weapons and other save actions */}
      {info.saves.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {info.saves.map((s) => (
            <div key={s.name} className="flex items-center gap-2">
              <button type="button" disabled={working || !s.ok} onClick={() => setBreath({ name: s.name, picked: targetId ? [targetId] : [] })}
                className="min-h-10 flex-1 rounded-lg border border-line px-3 text-left text-sm disabled:opacity-50">
                <b>{s.name}</b> · {s.ability} DC {s.dc}{s.damage ? ` · ${s.damage}${s.type ? ` ${s.type}` : ""}` : ""}
                {s.recharge ? ` · recharge ${s.recharge}–6` : ""}{s.perDay ? ` · ${s.used}/${s.perDay} per day` : ""}
                {!s.ok && <span className="block text-xs text-danger">{s.why}</span>}
              </button>
              {s.recharge && (
                <button type="button" disabled={working} onClick={() => start(async () => { const r = await setRecharge(monsterId, s.name, !s.ok); if (r && "error" in r) setError(r.error); load(); })}
                  className="h-10 shrink-0 rounded-lg border border-line px-2 text-xs text-soft">{s.ok ? "Mark used" : "It's back"}</button>
              )}
            </div>
          ))}
        </div>
      )}
      {breath && (
        <div className="mt-2 rounded-lg border border-accent-line bg-accent-surface p-2.5">
          <p className="text-sm font-semibold">Who is caught in {breath.name}?</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {live.map((p) => p.characterId && (
              <Segment key={p.id} active={breath.picked.includes(p.characterId)} onClick={() => setBreath((b) => b && ({ ...b, picked: b.picked.includes(p.characterId!) ? b.picked.filter((x) => x !== p.characterId) : [...b.picked, p.characterId!] }))}>
                {p.shortName}
              </Segment>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={working || !breath.picked.length} onClick={rollBreath} className="h-10 flex-1 rounded-lg bg-accent text-sm font-bold text-accent-text disabled:opacity-50">
              {pending ? "Rolling…" : `Roll ${breath.name} (${breath.picked.length})`}
            </button>
            <button type="button" onClick={() => setBreath(null)} className="h-10 rounded-lg border border-line px-3 text-sm text-soft">Cancel</button>
          </div>
        </div>
      )}

      {info.legendary && (
        <div className="mt-3 flex items-center gap-2">
          <p className="flex-1 text-sm"><b>Legendary actions</b> {info.legendary.left}/{info.legendary.max} left <span className="text-xs text-muted">(back at the start of its turn)</span></p>
          <button type="button" disabled={working || info.legendary.left === info.legendary.max} onClick={() => legendary(-1)} className="h-9 rounded-lg border border-line px-2 text-xs text-soft">Undo</button>
          <button type="button" disabled={working || info.legendary.left === 0} onClick={() => legendary(1)} className="h-9 rounded-lg bg-accent px-3 text-xs font-bold text-accent-text disabled:opacity-50">Use one</button>
        </div>
      )}
      {info.note && <p className="mt-2 text-xs text-soft">Recharge: {info.note}</p>}
      {busy && <p className="mt-2 text-xs text-accent" role="status">Rolling…</p>}
      {log.length > 0 && <ul className="mt-2 space-y-0.5 text-sm" role="status">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
