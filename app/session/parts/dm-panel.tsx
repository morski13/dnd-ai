"use client";
// DM tools: start a fight, add monsters, roll monster initiative, next turn, end fight / session.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { addMonster, endCombat, endSession, nextTurn, rollNpcInitiative, startCombat, startSavedFight } from "../actions";
import { TierBadge } from "../../fights/tier";

type Monster = { id: string; name: string; ac: number | null; hp_max: number | null; hp_current: number | null };

export function DmPanel({ sessionId, combatId, monsters, inFightIds, hiddenByDefault, waitingForInitiative, savedFights }: {
  sessionId: string; combatId: string | null; monsters: Monster[]; inFightIds: string[];
  hiddenByDefault: boolean; waitingForInitiative: number;
  savedFights: { id: string; name: string; tier: string | null }[];
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
                <input type="checkbox" checked={picked.includes(m.id)} className="h-5 w-5 accent-[#E0913A]"
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
          {waitingForInitiative > 0 && (
            <div className="mt-3 rounded-xl border border-line p-3">
              <p className="text-sm text-soft">{waitingForInitiative} still need initiative. Players roll their own; you roll for monsters and unclaimed characters.</p>
              <label className="mt-1 flex min-h-11 items-center gap-3 text-sm text-soft">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="h-5 w-5 accent-[#E0913A]" />
                Monster initiative is secret
              </label>
              <button type="button" disabled={pending} onClick={() => act(() => rollNpcInitiative(combatId, secret))}
                className="h-11 w-full rounded-xl border border-[#8A5A24] font-bold text-accent disabled:opacity-50">
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
