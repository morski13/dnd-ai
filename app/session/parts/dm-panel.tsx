"use client";
// DM tools: start a fight, add monsters, roll monster initiative, next turn, end fight / session.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { addMonster, endCombat, endSession, nextTurn, rollNpcInitiative, startCombat, startSavedFight } from "../actions";
import { TierBadge } from "../../fights/tier";
import { partyRest, setAutoApply } from "../moderator-actions";
import type { ThemeId } from "@/lib/themes";
import { TableTheme } from "./table-theme";
import { setFightMap } from "../map-actions";

type Monster = { id: string; name: string; ac: number | null; hp_max: number | null; hp_current: number | null };

export function DmPanel({ sessionId, combatId, monsters, inFightIds, hiddenByDefault, waitingForInitiative, savedFights, autoApply, theme = "tavern", maps = [], mapInFight = null }: {
  sessionId: string; combatId: string | null; monsters: Monster[]; inFightIds: string[];
  hiddenByDefault: boolean; waitingForInitiative: number;
  savedFights: { id: string; name: string; tier: string | null }[];
  autoApply: boolean;
  theme?: ThemeId;
  maps?: { id: string; name: string; cols: number; rows: number }[];
  mapInFight?: string | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [secret, setSecret] = useState(hiddenByDefault);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function act(fn: () => Promise<unknown>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && typeof res === "object" && "error" in res) setError(String((res as { error: string }).error));
      router.refresh();
    });
  }

  const available = monsters.filter((m) => !inFightIds.includes(m.id) && (m.hp_current ?? 1) > 0);

  return (
    <section className="rounded-2xl border border-line bg-surface-2 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">DM tools</p>
      <button type="button" role="switch" aria-checked={autoApply} disabled={pending}
        onClick={() => act(() => setAutoApply(!autoApply))}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left">
        <span>
          <span className="block text-sm font-semibold">Apply damage automatically</span>
          <span className="block text-xs text-muted">Damage and healing rolls with a target change HP right away</span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${autoApply ? "bg-accent" : "bg-line"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${autoApply ? "left-6" : "left-1"}`} />
        </span>
      </button>

      <TableTheme current={theme} />

      {!combatId && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={pending} onClick={() => act(() => partyRest("short"))} className="h-10 rounded-xl border border-line text-xs font-semibold text-soft">Party: short rest</button>
          <button type="button" disabled={pending} onClick={() => { if (confirm("Long rest for the whole party? Everyone gets full HP, slots and abilities back.")) act(() => partyRest("long")); }}
            className="h-10 rounded-xl border border-line text-xs font-semibold text-soft">Party: long rest</button>
        </div>
      )}

      {!combatId ? (
        <>
          <p className="mt-3 text-sm text-soft">Your saved fights</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {savedFights.length === 0 && (
              <li className="text-sm text-muted">None yet. Plan one in the <Link href="/fights" className="text-accent underline">Fight planner</Link>.</li>
            )}
            {savedFights.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
                {f.tier && <TierBadge tier={f.tier} />}
                <button type="button" disabled={pending} onClick={() => act(() => startSavedFight(sessionId, f.id))}
                  className="h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-50">Start</button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-soft">Or a quick fight. The whole party joins; tick the monsters:</p>
          <div className="mt-2 flex flex-col gap-1">
            {available.length === 0 && <p className="text-sm text-muted">No monsters yet. Add one below.</p>}
            {available.map((m) => (
              <label key={m.id} className="flex min-h-11 items-center gap-3 text-[15px]">
                <input type="checkbox" checked={picked.includes(m.id)} className="h-5 w-5 accent-accent"
                  onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} />
                {m.name} <span className="text-xs text-muted">AC {m.ac ?? "?"} · HP {m.hp_current ?? "?"}</span>
              </label>
            ))}
          </div>
          {adding
            ? <NewMonster combatId={null} onDone={(id) => { setAdding(false); if (id) setPicked((p) => [...p, id]); router.refresh(); }} />
            : <button type="button" onClick={() => setAdding(true)} className="mt-1 h-11 text-sm text-accent">+ New monster</button>}
          <button type="button" disabled={pending} onClick={() => act(() => startCombat(sessionId, picked))}
            className="mt-2 h-12 w-full rounded-xl bg-accent font-bold text-accent-text disabled:opacity-50">
            Start fight{picked.length ? ` (${picked.length} monster${picked.length > 1 ? "s" : ""})` : ""}
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={pending} onClick={() => act(() => nextTurn(combatId))}
            className="mt-3 h-14 w-full rounded-xl bg-accent font-heading text-xl font-bold text-accent-text disabled:opacity-50">
            Next turn →
          </button>
          <div className="mt-3 rounded-xl border border-line p-3" aria-label="Battle map for this fight">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Battle map</p>
              <Link href="/maps" className="inline-flex min-h-10 items-center px-1 text-xs text-accent underline">{maps.length ? "Manage maps" : "Add a map"}</Link>
            </div>
            {maps.length === 0 ? (
              <p className="mt-1 text-xs text-muted">Upload a map picture (or make a plain grid) to play this fight on a map.</p>
            ) : (
              <div className="mt-2 flex gap-2">
                <select aria-label="Map for this fight" value={mapInFight ?? ""} disabled={pending}
                  onChange={(e) => { const v = e.target.value || null; if (!v && !confirm("Take the map away from this fight?")) return; act(() => setFightMap(v)); }}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-sm">
                  <option value="">No map</option>
                  {maps.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.cols}×{m.rows})</option>)}
                </select>
              </div>
            )}
          </div>
          {waitingForInitiative > 0 && (
            <div className="mt-3 rounded-xl border border-line p-3">
              <p className="text-sm text-soft">{waitingForInitiative} still need initiative. Players roll their own; you roll for monsters and unclaimed characters.</p>
              <label className="mt-1 flex min-h-11 items-center gap-3 text-sm text-soft">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="h-5 w-5 accent-accent" />
                Monster initiative is secret
              </label>
              <button type="button" disabled={pending} onClick={() => act(() => rollNpcInitiative(combatId, secret))}
                className="min-h-11 w-full rounded-xl border border-accent-strong px-3 py-2 font-bold leading-snug text-accent disabled:opacity-50">
                Roll for monsters &amp; unclaimed
              </button>
            </div>
          )}
          {adding
            ? <NewMonster combatId={combatId} onDone={() => { setAdding(false); router.refresh(); }} />
            : <button type="button" onClick={() => setAdding(true)} className="mt-2 h-11 text-sm text-accent">+ Add a monster to the fight</button>}
          <button type="button" disabled={pending} onClick={() => act(() => endCombat(combatId))}
            className="mt-2 h-11 w-full rounded-xl border border-line text-sm text-soft">
            End fight (reveals secret rolls)
          </button>
        </>
      )}

      <button type="button" disabled={pending}
        onClick={() => { if (confirm("End the session for everyone?")) act(() => endSession(sessionId)); }}
        className="mt-4 h-11 w-full rounded-xl border border-danger-line text-sm text-danger">
        End session
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

function NewMonster({ combatId, onDone }: { combatId: string | null; onDone: (id?: string) => void }) {
  const [form, setForm] = useState({ name: "", ac: "13", hp: "20", initBonus: "1" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "h-11 min-w-0 rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";
  return (
    <form className="mt-2 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addMonster({ name: form.name, ac: Number(form.ac), hp: Number(form.hp), initBonus: Number(form.initBonus) }, combatId);
          if ("error" in res) setError(res.error); else onDone(res.id);
        });
      }}>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name, e.g. Ogre" required className={`${input} w-full`} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {([["ac", "AC"], ["hp", "HP"], ["initBonus", "Init +"]] as const).map(([k, l]) => (
          <label key={k} className="text-xs text-muted">{l}
            <input inputMode="numeric" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value.replace(/[^\d-]/g, "") })} className={`${input} mt-1 w-full`} />
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={pending} className="h-11 flex-1 rounded-xl bg-accent text-sm font-bold text-accent-text disabled:opacity-50">Add monster</button>
        <button type="button" onClick={() => onDone()} className="h-11 rounded-xl border border-line px-3 text-sm text-soft">Cancel</button>
      </div>
    </form>
  );
}
