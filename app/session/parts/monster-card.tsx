"use client";
// DM: roll for a monster (secret by default, per the house rules).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Combatant, QuickAction } from "@/lib/session-data";
import { monsterRoll, type QuickRoll } from "../actions";
import { ResultLine, Segment } from "./bits";

const KINDS = [
  { key: "attack", label: "Attack" }, { key: "damage", label: "Damage" },
  { key: "save", label: "Save" }, { key: "check", label: "Check" }, { key: "other", label: "Other" },
] as const;

export function MonsterCard({ monster, isTurn, party, hiddenByDefault }: {
  monster: { id: string; name: string; actions?: QuickAction[] }; isTurn: boolean; party: Combatant[]; hiddenByDefault: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("Attack");
  const [expression, setExpression] = useState("1d20+4");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("attack");
  const [targetId, setTargetId] = useState<string | null>(party[0]?.characterId ?? null);
  const [hidden, setHidden] = useState(hiddenByDefault);
  const [last, setLast] = useState<QuickRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function doRoll() {
    setError(null);
    start(async () => {
      const res = await monsterRoll(monster.id, { label, expression, kind, hidden, targetCharacterId: targetId });
      if ("error" in res) return setError(res.error);
      setLast(res);
      setTimeout(() => router.refresh(), 0); // update the log without keeping the button busy
    });
  }

  const input = "h-11 min-w-0 rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";
  return (
    <section className={`rounded-[18px] border p-4 ${isTurn ? "border-danger-line bg-danger-bg" : "border-line bg-surface"}`}>
      <p className="text-lg font-bold">{isTurn ? `${monster.name}'s turn` : monster.name}</p>
      <p className="text-xs text-muted">Only you (the DM) see this card.</p>

      {!!monster.actions?.length && (
        <div className="mt-3">
          <p className="text-xs text-muted">From its stat block (tap to fill in)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {monster.actions.flatMap((a) => a.kind === "attack" ? [
              <Segment key={a.name + "a"} active={label === a.name && kind === "attack"} onClick={() => { setKind("attack"); setLabel(a.name); setExpression(`1d20${(a.bonus ?? 0) >= 0 ? "+" : ""}${a.bonus ?? 0}`); }}>
                {a.name} {(a.bonus ?? 0) >= 0 ? "+" : ""}{a.bonus}
              </Segment>,
              <Segment key={a.name + "d"} active={label === `${a.name} damage`} onClick={() => { setKind("damage"); setLabel(`${a.name} damage`); setExpression(a.damage ?? "1d6"); }}>
                {a.damage}
              </Segment>,
            ] : [
              <Segment key={a.name} active={label === a.name} onClick={() => { setKind("damage"); setLabel(`${a.name} (DC ${a.dc} ${a.save_ability})`); setExpression(a.damage ?? "1d6"); }}>
                {a.name.replace(/ \(.*\)$/, "")} DC {a.dc}
              </Segment>,
            ])}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {KINDS.map((k) => (
          <Segment key={k.key} active={kind === k.key} onClick={() => {
            setKind(k.key);
            if (k.key === "attack") { setLabel("Attack"); setExpression("1d20+4"); }
            if (k.key === "damage") { setLabel("Damage"); setExpression("1d8+2"); }
            if (k.key === "save" || k.key === "check") { setLabel(k.label); setExpression("1d20+0"); }
          }}>{k.label}</Segment>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-[1fr_8rem] gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Greatclub" className={input} aria-label="What is it" />
        <input value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="1d20+6" className={input} aria-label="Dice" />
      </div>

      {(kind === "attack" || kind === "damage") && party.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          <Segment active={targetId === null} onClick={() => setTargetId(null)}>No target</Segment>
          {party.map((p) => (
            <Segment key={p.id} active={targetId === p.characterId} onClick={() => setTargetId(p.characterId)}>{p.shortName}</Segment>
          ))}
        </div>
      )}

      <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-soft">
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-5 w-5 accent-[#E0913A]" />
        Secret roll (players see &quot;DM roll, hidden&quot; until the fight ends)
      </label>

      <button type="button" onClick={doRoll} disabled={pending}
        className="mt-2 h-14 w-full rounded-2xl bg-accent font-heading text-xl font-bold text-accent-text disabled:opacity-50">
        {pending ? "Rolling…" : `Roll ${label || "it"}`}
      </button>
      {error && <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-sm text-danger">{error}</p>}
      {last && (
        <div className="mt-3 rounded-xl bg-bg p-3">
          <ResultLine roll={{ ...last, rollType: kind }} />
          {last.hidden && <p className="mt-1 text-xs text-muted">Hidden from players</p>}
        </div>
      )}
    </section>
  );
}
