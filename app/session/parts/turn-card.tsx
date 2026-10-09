"use client";
// "Your turn, Vex": pick a target and an attack/spell, roll, then roll damage.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { signed, type Advantage } from "@/lib/dice";
import type { FullCharacter, Resource } from "@/lib/character-data";
import type { Combatant } from "@/lib/session-data";
import {
  allOptions, damageExpression, lowestFreeSlot, optionButtonLabel, type Option, type SpellBook, type SpellInfo,
} from "@/lib/rules";
import { rollForCharacter, type SavedRoll } from "../../characters/[id]/actions";
import { AdvToggle, ResultLine, Segment } from "./bits";

export function TurnCard({ character, library, canEdit, combatants, isTurn, inCombat, myInitiative }: {
  character: FullCharacter; library: SpellInfo[]; canEdit: boolean; combatants: Combatant[];
  isTurn: boolean; inCombat: boolean; myInitiative: number | null | undefined;
}) {
  const router = useRouter();
  const [spells, setSpells] = useState<SpellBook>(character.spells);
  const [resources, setResources] = useState<Resource[]>(character.resources);
  const c = useMemo(() => ({ ...character, spells }), [character, spells]);
  const options = useMemo(
    () => allOptions(c, library).filter((o) => o.kind !== "boost" && (o.damage || o.kind === "heal")),
    [c, library]
  );
  const targets = combatants.filter((x) => x.characterId !== character.id);
  const enemies = targets.filter((x) => x.monsterId && !x.ally);
  const [targetId, setTargetId] = useState<string | null>(enemies[0]?.id ?? null);
  const [key, setKey] = useState<string | null>(options[0]?.key ?? null);
  const [adv, setAdv] = useState<Advantage>("normal");
  const [attack, setAttack] = useState<SavedRoll | null>(null);
  const [damage, setDamage] = useState<SavedRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = options.find((o) => o.key === key) ?? null;
  const target = targets.find((t) => t.id === targetId) ?? null;
  const targetRef = target ? { characterId: target.characterId, monsterId: target.monsterId } : null;
  const short = character.name.split(" ")[0];
  const left = (o: Option) => {
    if (o.level && lowestFreeSlot(c, o.level) === null) return "No slots";
    const r = o.resource ? resources.find((x) => x.name === o.resource) : null;
    if (o.resource && (!r || (r.used ?? 0) >= r.max)) return `No ${o.resource}`;
    return null;
  };

  function go(fn: () => ReturnType<typeof rollForCharacter>, onDone: (r: SavedRoll) => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if ("error" in res) return setError(res.error);
      setSpells(res.spells);
      setResources(res.resources);
      onDone(res.roll);
      setTimeout(() => router.refresh(), 0); // update the log without keeping the button busy
    });
  }

  const bigLabel = !selected ? "Roll"
    : selected.kind === "save" ? `Cast · ${optionButtonLabel(c, selected)}`
    : selected.kind === "heal" ? "Roll healing"
    : selected.kind === "damage_only" ? "Roll damage"
    : "Roll attack";

  return (
    <section className={`rounded-[18px] border p-4 ${isTurn ? "border-[#8A5A24] bg-accent-surface" : "border-line bg-surface"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{isTurn ? `Your turn, ${short}` : short}</p>
          {!isTurn && inCombat && <p className="text-xs text-muted">Not your turn, but you can still roll (reactions, saves…)</p>}
        </div>
        <Link href={`/characters/${character.id}`} className="shrink-0 text-xs text-accent underline">Full sheet</Link>
      </div>

      {inCombat && myInitiative == null && canEdit && (
        <button type="button" disabled={pending}
          onClick={() => go(() => rollForCharacter(character.id, { kind: "initiative" }, adv), (r) => { setAttack(r); setDamage(null); })}
          className="mt-3 h-12 w-full rounded-xl border border-[#8A5A24] text-[15px] font-bold text-accent disabled:opacity-50">
          Roll initiative ({signed(Math.floor(((character.ability_scores.DEX ?? 10) - 10) / 2))})
        </button>
      )}

      {targets.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted">Target</p>
          <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
            <Segment active={targetId === null} onClick={() => setTargetId(null)}>None</Segment>
            {[...enemies, ...targets.filter((t) => !enemies.includes(t))].map((t) => (
              <Segment key={t.id} active={targetId === t.id} tone={enemies.includes(t) ? "danger" : "normal"} onClick={() => setTargetId(t.id)}>
                {t.shortName}
              </Segment>
            ))}
          </div>
        </div>
      )}

      {options.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No attacks or spells on this sheet yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {options.map((o) => {
            const blocked = left(o);
            return (
              <button key={o.key} type="button" onClick={() => setKey(o.key)} disabled={!!blocked}
                className={`min-h-12 rounded-xl border px-2 py-1.5 text-left text-sm leading-tight disabled:opacity-40 ${key === o.key ? "border-[#8A5A24] bg-bg font-bold" : "border-line text-soft"}`}>
                {o.name} <span className="font-normal text-muted">{blocked ?? optionButtonLabel(c, o)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3"><AdvToggle value={adv} onChange={setAdv} /></div>

      <button type="button" disabled={!canEdit || !selected || pending || !!(selected && left(selected))}
        onClick={() => selected && go(() => rollForCharacter(character.id, { kind: "use", key: selected.key }, adv, targetRef), (r) => { setAttack(r); setDamage(null); })}
        className="mt-3 h-16 w-full rounded-2xl bg-accent font-heading text-2xl font-bold text-accent-text disabled:opacity-50">
        {pending ? "Rolling…" : bigLabel}
      </button>

      {error && <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {attack && (
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-bg p-3">
          <ResultLine roll={attack} />
          <div className="text-right">
            {damage ? (
              <>
                <p className="text-xs text-muted">{damage.label}</p>
                <p className="text-lg font-bold text-accent">{damage.total} {damage.rollType === "heal" ? "HP" : (selected?.damage_type ?? "")}</p>
              </>
            ) : attack.followUp ? (
              <button type="button" disabled={pending}
                onClick={() => {
                  const o = options.find((x) => x.key === attack.followUp!.key);
                  if (!o) return;
                  go(() => rollForCharacter(character.id, { kind: "damage", key: o.key, slot: attack.followUp!.slot, parentRollId: attack.id }, "normal"), setDamage);
                }}
                className="h-11 w-full rounded-xl border border-danger-line bg-danger-bg px-2 text-sm font-bold text-danger">
                {attack.isCrit ? "Crit damage!" : "Roll damage"}
                {(() => { const o = options.find((x) => x.key === attack.followUp?.key); return o ? <span className="block text-xs font-normal">{damageExpression(c, o, attack.followUp?.slot)}</span> : null; })()}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
