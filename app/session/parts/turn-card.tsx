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
import { rollForCharacter, type RollResponse, type SavedRoll } from "../../characters/[id]/actions";
import { asShown, useDice } from "../../components/dice/dice-provider";
import { AdvToggle, ResultLine, Segment } from "./bits";
import { AppliedNote, Conditions, DeathSavePanel, HpBar } from "./moderator";
import { healthOf } from "@/lib/moderator/hp";
import { parseArea } from "@/lib/maps/area";
import { useMapAim } from "./map-aim";

export function TurnCard({ character, library, canEdit, combatants, isTurn, inCombat, myInitiative, isDm = false, deathSavesSecret = false }: {
  character: FullCharacter; library: SpellInfo[]; canEdit: boolean; combatants: Combatant[];
  isTurn: boolean; inCombat: boolean; myInitiative: number | null | undefined; isDm?: boolean; deathSavesSecret?: boolean;
}) {
  const router = useRouter();
  const [spells, setSpells] = useState<SpellBook>(character.spells);
  const [resources, setResources] = useState<Resource[]>(character.resources);
  const c = useMemo(() => ({ ...character, spells }), [character, spells]);
  const options = useMemo(
    () => allOptions(c, library).filter((o) => o.kind !== "boost" && (o.damage || o.kind === "heal")),
    [c, library]
  );
  const meC = combatants.find((x) => x.characterId === character.id) ?? null;
  const others = combatants.filter((x) => x.characterId !== character.id);
  const targets = meC ? [...others, meC] : others;
  const enemies = others.filter((x) => x.monsterId && !x.ally && !x.out);
  const hp = meC?.hp ?? character.hp_current ?? character.hp_max ?? 0;
  const dying = hp === 0 && (character.hp_max ?? 0) > 0;
  const [targetId, setTargetId] = useState<string | null>(enemies[0]?.id ?? null);
  const [also, setAlso] = useState<string[]>([]);            // save spells (Fireball): more targets
  const [saves, setSaves] = useState<RollResponse["saves"]>(undefined);
  const [appliedAll, setAppliedAll] = useState<RollResponse["appliedAll"]>(undefined);
  const [key, setKey] = useState<string | null>(options[0]?.key ?? null);
  const [adv, setAdv] = useState<Advantage>("normal");
  const [attack, setAttack] = useState<SavedRoll | null>(null);
  const [damage, setDamage] = useState<SavedRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dice = useDice();
  const mapAim = useMapAim();

  const selected = options.find((o) => o.key === key) ?? null;
  const target = targets.find((t) => t.id === targetId) ?? null;
  const targetRef = target ? { characterId: target.characterId, monsterId: target.monsterId } : null;
  const multi = selected?.kind === "save";
  const moreRefs = multi ? targets.filter((t) => also.includes(t.id) && t.id !== targetId).map((t) => ({ characterId: t.characterId, monsterId: t.monsterId })) : [];
  const short = character.name.split(" ")[0];
  const left = (o: Option) => {
    if (o.level && lowestFreeSlot(c, o.level) === null) return "No slots";
    const r = o.resource ? resources.find((x) => x.name === o.resource) : null;
    if (o.resource && (!r || (r.used ?? 0) >= r.max)) return `No ${o.resource}`;
    return null;
  };

  async function landed(res: RollResponse, onDone: (r: SavedRoll) => void) {
      await dice.show(asShown(res.roll));
      setSpells(res.spells);
      setResources(res.resources);
      if (res.roll.rollType === "save_dc") { setSaves(res.saves); setAppliedAll(undefined); }
      else if (res.roll.rollType === "damage") setAppliedAll(res.appliedAll);
      else { setSaves(undefined); setAppliedAll(undefined); }
      onDone(res.roll);
      setTimeout(() => router.refresh(), 0); // update the log without keeping the button busy
  }
  function go(fn: () => ReturnType<typeof rollForCharacter>, onDone: (r: SavedRoll) => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if ("error" in res) return setError(res.error);
      await landed(res, onDone);
    });
  }

  // Picking a healing spell aims it at the most hurt friend; an attack at the first enemy still standing.
  function pickOption(o: Option) {
    setKey(o.key);
    const t = targets.find((x) => x.id === targetId);
    if (o.kind === "heal") {
      const friends = targets.filter((x) => (x.characterId || x.ally) && x.hp != null && x.hpMax);
      const hurt = friends.sort((a, b) => a.hp! / a.hpMax! - b.hp! / b.hpMax!)[0];
      if (hurt && (!t || !(t.characterId || t.ally))) setTargetId(hurt.id);
    } else if (!t || !(t.monsterId && !t.ally) || t.out) {
      setTargetId(enemies[0]?.id ?? null);
    }
  }

  // an area spell (Fireball, Bless…) with a battle map in the fight: place it on the map instead
  const area = selected?.fromSpell ? parseArea(selected.fromSpell.description ?? "", selected.fromSpell.range ?? null) : null;
  const canAim = !!(area && mapAim?.onMap(character.id) && canEdit);
  const aiming = mapAim?.aim?.characterId === character.id && mapAim.aim.optionKey === selected?.key;
  function aimIt() {
    if (!selected || !area || !mapAim) return;
    setError(null);
    mapAim.setAim({
      characterId: character.id, optionKey: selected.key, name: selected.name, spec: area, heal: selected.kind === "heal", advantage: adv,
      onDone: (res) => start(async () => { await landed(res, (r) => { setAttack(r); setDamage(null); }); }),
    });
  }

  const bigLabel = !selected ? "Roll"
    : selected.kind === "save" ? `Cast · ${optionButtonLabel(c, selected)}`
    : selected.kind === "heal" ? "Roll healing"
    : selected.kind === "damage_only" ? "Roll damage"
    : "Roll attack";

  return (
    <section className={`rounded-[18px] border p-4 ${isTurn ? "animate-turn border-accent-strong bg-accent-surface" : "border-line bg-surface"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{isTurn ? `Your turn, ${short}` : short}</p>
          {!isTurn && inCombat && <p className="text-xs text-muted">Not your turn, but you can still roll (reactions, saves…)</p>}
        </div>
        <Link href={`/characters/${character.id}`} className="shrink-0 text-xs text-accent underline">Full sheet</Link>
      </div>

      <div className="mt-2">
        <HpBar hp={hp} max={character.hp_max} temp={meC?.temp ?? character.temp_hp ?? 0} health={healthOf(hp, character.hp_max)} />
      </div>
      {meC && <Conditions key={meC.conditions.join()} combatant={meC} canEdit={canEdit} />}

      {dying ? (
        <DeathSavePanel combatant={meC} characterId={character.id} name={short} canRoll={canEdit} isDm={isDm} secret={deathSavesSecret} />
      ) : (<>
      {inCombat && myInitiative == null && canEdit && (
        <button type="button" disabled={pending}
          onClick={() => go(() => rollForCharacter(character.id, { kind: "initiative" }, adv), (r) => { setAttack(r); setDamage(null); })}
          className="mt-3 h-12 w-full rounded-xl border border-accent-strong text-[15px] font-bold text-accent disabled:opacity-50">
          Roll initiative ({signed(Math.floor(((character.ability_scores.DEX ?? 10) - 10) / 2))})
        </button>
      )}

      {targets.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted">{multi ? "Targets (tap several for an area spell)" : "Target"}</p>
          <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
            <Segment active={targetId === null} onClick={() => setTargetId(null)}>None</Segment>
            {[...enemies, ...targets.filter((t) => !enemies.includes(t))].map((t) => (
              <Segment key={t.id} active={targetId === t.id || (multi && also.includes(t.id))} tone={enemies.includes(t) ? "danger" : "normal"}
                onClick={() => {
                  if (!multi || targetId === null) return setTargetId(t.id);
                  if (t.id === targetId) { const [next, ...rest] = also; setTargetId(next ?? null); setAlso(rest); return; }
                  setAlso(also.includes(t.id) ? also.filter((x) => x !== t.id) : [...also, t.id]);
                }}>
                {t.id === meC?.id ? "Me" : t.shortName}{t.out ? " ✕" : ""}
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
              <button key={o.key} type="button" onClick={() => pickOption(o)} disabled={!!blocked}
                className={`min-h-12 rounded-xl border px-2 py-1.5 text-left text-sm leading-tight disabled:opacity-40 ${key === o.key ? "border-accent-strong bg-bg font-bold" : "border-line text-soft"}`}>
                {o.name} <span className="font-normal text-muted">{blocked ?? optionButtonLabel(c, o)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3"><AdvToggle value={adv} onChange={setAdv} /></div>

      {canAim && selected && (
        <button type="button" disabled={pending || !!left(selected)} onClick={() => (aiming ? mapAim?.setAim(null) : aimIt())}
          className="mt-3 h-16 w-full rounded-2xl bg-accent font-heading text-2xl font-bold text-accent-text disabled:opacity-50">
          {aiming ? "Aiming on the map… (cancel)" : `Aim ${selected.name} on the map`}
        </button>
      )}
      <button type="button" disabled={!canEdit || !selected || pending || !!(selected && left(selected))}
        onClick={() => selected && go(() => rollForCharacter(character.id, { kind: "use", key: selected.key }, adv, targetRef, moreRefs), (r) => { setAttack(r); setDamage(null); })}
        className={canAim ? "mt-2 h-11 w-full rounded-xl border border-line text-sm text-soft disabled:opacity-50" : "mt-3 h-16 w-full rounded-2xl bg-accent font-heading text-2xl font-bold text-accent-text disabled:opacity-50"}>
        {pending ? "Rolling…" : canAim ? `${bigLabel} without the map` : bigLabel}
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
            ) : attack.followUp && attack.success === false ? (
              <p className="pt-2 text-sm font-semibold text-muted">Missed: no damage</p>
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
      {saves && saves.length > 0 && !damage && (
        <ul className="mt-2 space-y-1 rounded-xl bg-bg p-3 text-sm" aria-label="Saving throws">
          {saves.map((sv, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>{sv.name}</span>
              {sv.success === null ? <span className="text-muted">rolled in secret</span>
                : <span className={sv.success ? "text-soft" : "font-semibold text-danger"}>{sv.total} vs DC {sv.dc} · {sv.success ? "saved" : "failed"}{sv.secret && <span className="text-muted"> (secret)</span>}</span>}
            </li>
          ))}
        </ul>
      )}
      {appliedAll && appliedAll.length > 1 ? (
        <div className="mt-2 space-y-2">{appliedAll.map((a) => <AppliedNote key={a.effectId} applied={a} />)}</div>
      ) : (attack?.applied || damage?.applied) && (
        <div className="mt-2">
          <AppliedNote key={(damage ?? attack)!.id} applied={(damage?.applied ?? attack?.applied)!} />
        </div>
      )}
      {damage?.missed && <p className="mt-2 text-sm text-muted">That attack missed, so the damage wasn&apos;t applied.</p>}
      </>)}
    </section>
  );
}
