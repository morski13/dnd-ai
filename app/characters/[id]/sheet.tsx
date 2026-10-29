"use client";
// The interactive character sheet. Every tap on a bonus asks the server to roll and save it.
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { signed, type Advantage } from "@/lib/dice";
import type { Feature, FullCharacter, Resource } from "@/lib/character-data";
import {
  ABILITIES, SKILLS, actionOf, allOptions, damageExpression, initiative, lowestFreeSlot, mods, optionButtonLabel, pb,
  saveBonus, skillBonus, totalLevel, type Ability, type Option, type RollRequest, type SheetCharacter, type SpellBook, type SpellInfo,
} from "@/lib/rules";
import {
  changeHp, restoreAllSlots, rollForCharacter, setConcentration, setResourceUsed, setSlotsUsed, type SavedRoll,
} from "./actions";
import { ConcentrationChip } from "./parts/concentration";
import { CustomizeButton } from "./parts/customize";
import { PortraitButton } from "../../components/map/portrait";
import { asShown, useDice } from "../../components/dice/dice-provider";
import { BestMoves } from "./parts/best-moves";
import { FeaturesTab } from "./parts/features-tab";
import { GearTab } from "./parts/gear-tab";
import type { Gear } from "@/lib/items-data";
import { HpCard } from "./parts/hp-card";
import { RestPanel } from "./parts/rest-panel";
import { RollTray } from "./parts/roll-tray";
import { SpellsTab } from "./parts/spells-tab";
import { ACTION_LABEL, Empty, Pips, RollButton, RowButton, StatBox } from "./parts/ui";

type Tab = "Attacks" | "Spells" | "Skills" | "Features" | "Gear";

export function CharacterSheet({ character, canEdit, library: initialLibrary, featText, gear, levelPlan = null, portrait = null }: {
  character: FullCharacter; canEdit: boolean; library: SpellInfo[]; featText: Record<string, string>; gear: Gear; levelPlan?: string | null; portrait?: string | null;
}) {
  const [hp, setHp] = useState({ cur: character.hp_current ?? character.hp_max ?? 0, temp: character.temp_hp ?? 0 });
  const [hitDiceUsed, setHitDiceUsed] = useState<Record<string, number>>(character.hit_dice_used ?? {});
  const [conc, setConc] = useState<{ spell: string } | null>(character.concentration ?? null);
  const [concNote, setConcNote] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>(character.resources);
  const [spells, setSpells] = useState<SpellBook>(character.spells);
  const [library, setLibrary] = useState<SpellInfo[]>(initialLibrary);
  const [tab, setTab] = useState<Tab>("Attacks");
  const [advantage, setAdvantage] = useState<Advantage>("normal");
  const [last, setLast] = useState<SavedRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dice = useDice();

  // The character as it is right now (slots and spell list change while you play).
  const c: SheetCharacter & { features: (string | Feature)[] } = useMemo(() => ({ ...character, spells }), [character, spells]);
  const options = useMemo(() => allOptions(c, library), [c, library]);
  const m = mods(c);
  const classes = c.class_levels.map((cl) => cl.class);

  function doRoll(request: RollRequest) {
    if (!canEdit || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await rollForCharacter(character.id, request, advantage);
      if ("error" in res) return setError(res.error);
      await dice.show(asShown(res.roll));
      setLast(res.roll);
      if (res.concentration !== undefined) setConc(res.concentration);
      setConcNote(res.endedConcentration ? `You stopped concentrating on ${res.endedConcentration}.` : null);
      const cc = res.roll.applied?.concentration;
      if (cc && res.roll.applied?.target.characterId === character.id) { if (!cc.kept) setConc(null); setConcNote(concText(cc)); }
      setSpells(res.spells);
      setResources(res.resources);
    });
  }

  function run<T>(fn: () => Promise<T | { error: string }>, done: (r: T) => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && typeof res === "object" && "error" in res) setError((res as { error: string }).error);
      else done(res as T);
    });
  }

  const resourceLeft = (name?: string) => {
    if (!name) return Infinity;
    const r = resources.find((x) => x.name === name);
    return r ? r.max - (r.used ?? 0) : 0;
  };

  const classLine = [
    character.species,
    c.class_levels.map((cl) => `${cl.class} ${cl.level}${c.class_levels.length === 1 && cl.subclass ? ` (${cl.subclass})` : ""}`).join(" / "),
  ].filter(Boolean).join(" · ");

  const sheetOptions = options.filter((o) => !o.fromSpell && o.kind !== "boost");
  const spellOptions = options.filter((o) => o.fromSpell && (o.damage || o.kind === "heal"));
  const boosts = options.filter((o) => o.kind === "boost" && !o.fromSpell);

  // After an attack or a save spell, offer the damage roll (same slot level, crit-aware).
  const followUp = (() => {
    if (!last?.followUp) return null;
    const o = options.find((x) => x.key === last.followUp!.key);
    if (!o) return null;
    const expr = damageExpression(c, o, last.followUp.slot);
    return {
      label: last.isCrit ? `Roll crit damage (${expr}, dice doubled)` : `Roll damage (${expr})`,
      onClick: () => doRoll({ kind: "damage", key: o.key, slot: last.followUp!.slot, parentRollId: last.id }),
    };
  })();

  return (
    <>
      <header>
        <div className="flex items-center gap-2">
          <Link href="/characters" aria-label="Back to characters" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-soft">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
          <div className="flex-1" />
          {canEdit && <CustomizeButton characterId={character.id} />}
          {canEdit && totalLevel(c.class_levels) < 20 && (
            <Link href={`/characters/${character.id}/level-up`}
              className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-accent-line bg-accent-surface px-3 text-sm font-bold text-accent">
              <span aria-hidden>▲</span> Level up{levelPlan ? <span className="text-xs font-normal text-success"> · plan ready</span> : null}
            </Link>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <PortraitButton kind="character" id={character.id} name={character.name} src={portrait} canEdit={canEdit} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-3xl font-bold leading-tight [overflow-wrap:anywhere]">{character.name}</h1>
            <p className="text-[15px] text-muted">{classLine}</p>
            {!canEdit && <p className="mt-1 text-xs text-muted">View only: this isn&apos;t your character.</p>}
          </div>
        </div>
      </header>

      <Link href={`/tavern?c=${character.id}&mode=character`}
        className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-soft">
        <span aria-hidden className="text-accent">✦</span>
        <span className="min-w-0 flex-1 truncate">Ask the Tavern about {character.name}: combos, rules, features</span>
        <span aria-hidden className="text-accent">→</span>
      </Link>

      <HpCard cur={hp.cur} temp={hp.temp} max={character.hp_max ?? 0} canEdit={canEdit} pending={pending}
        onChange={(kind, n) => run(() => changeHp(character.id, kind, n), (r) => {
          setHp({ cur: r.hp_current, temp: r.temp_hp });
          if (r.concentration) { if (!r.concentration.kept) setConc(null); setConcNote(concText(r.concentration)); }
        })} />

      <ConcentrationChip spell={conc?.spell ?? null} note={concNote} canEdit={canEdit} pending={pending}
        choices={(spells.known ?? []).filter((n) => library.find((x) => x.name === n)?.concentration)}
        onSet={(spell) => run(() => setConcentration(character.id, spell), (r) => { setConc(r.concentration); setConcNote(null); })} />

      <section className="mt-3 grid grid-cols-4 gap-2">
        <StatBox label="AC" value={character.ac ?? "–"} sheet={character.sheet_values.ac !== undefined && character.sheet_values.ac !== character.ac ? character.sheet_values.ac : undefined} />
        <StatBox label="Speed" value={character.speed ?? "–"} sheet={character.sheet_values.speed !== undefined && character.sheet_values.speed !== character.speed ? character.sheet_values.speed : undefined} />
        <StatBox label="Init" value={signed(initiative(c))} sub={canEdit ? "tap to roll" : undefined} onClick={canEdit ? () => doRoll({ kind: "initiative" }) : undefined} />
        <StatBox label="Prof." value={signed(pb(c))} sub={`lvl ${totalLevel(c.class_levels)}`} />
      </section>

      <section className="mt-3 grid grid-cols-6 gap-1.5">
        {ABILITIES.map((a) => (
          <button key={a} type="button" disabled={!canEdit} onClick={() => doRoll({ kind: "ability", ability: a })}
            className="flex min-h-20 flex-col items-center justify-center rounded-xl border border-line bg-surface py-2 active:border-accent">
            <span className="text-xs text-muted">{a}</span>
            <span className="text-xl font-bold">{signed(m[a])}</span>
            <span className="text-xs text-muted">{c.ability_scores[a] ?? 10}</span>
          </button>
        ))}
      </section>

      <nav className="mt-6 flex overflow-x-auto border-b border-line [scrollbar-width:none]">
        {(["Attacks", "Spells", "Skills", "Features", "Gear"] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`-mb-px h-12 flex-auto whitespace-nowrap border-b-2 px-1 text-[13px] min-[360px]:px-2 min-[360px]:text-sm ${tab === t ? "border-accent font-bold text-accent" : "border-transparent text-soft"}`}>
            {t}
          </button>
        ))}
      </nav>

      <section className="mt-4">
        {tab === "Attacks" && (
          <div className="flex flex-col gap-5">
            <BestMoves c={c} options={options} />
            <OptionGroup title="Weapons & attacks" items={sheetOptions} c={c} canEdit={canEdit} pending={pending} resourceLeft={resourceLeft} onUse={(o) => doRoll({ kind: "use", key: o.key })} />
            <OptionGroup title="Spells" items={spellOptions} c={c} canEdit={canEdit} pending={pending} resourceLeft={resourceLeft} onUse={(o) => doRoll({ kind: "use", key: o.key })}
              empty={c.spells?.ability ? "No damage or healing spells yet. See the Spells tab." : undefined} />
            <OptionGroup title="Class tricks" items={boosts} c={c} canEdit={canEdit} pending={pending} resourceLeft={resourceLeft} onUse={(o) => doRoll({ kind: "use", key: o.key })} />
          </div>
        )}

        {tab === "Spells" && (
          <SpellsTab
            characterId={character.id} c={c} options={options} library={library} canEdit={canEdit} pending={pending} classes={classes}
            onCast={(key, slot) => doRoll({ kind: "use", key, slot })}
            onSlots={(level, used) => {
              setSpells({ ...spells, slots_used: { ...spells.slots_used, [String(level)]: used } });
              run(() => setSlotsUsed(character.id, level, used), (r) => setSpells(r.spells));
            }}
            onRestoreSlots={() => run(() => restoreAllSlots(character.id), (r) => setSpells(r.spells))}
            onSpellsChange={setSpells}
            onLibraryAdd={(s) => setLibrary((lib) => (lib.some((x) => x.name === s.name) ? lib : [...lib, s]))}
          />
        )}

        {tab === "Skills" && (
          <>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Saving throws</p>
            <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(5.25rem,1fr))] gap-2">
              {ABILITIES.map((a) => (
                <RowButton key={a} label={a} bonus={saveBonus(c, a)} proficient={!!c.proficiencies.saves?.includes(a)} disabled={!canEdit}
                  onClick={() => doRoll({ kind: "save", ability: a })} />
              ))}
            </div>
            <p className="mt-5 text-xs uppercase tracking-[0.12em] text-muted">Skills</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {Object.entries(SKILLS).map(([skill, ability]) => (
                <RowButton key={skill} label={skill} hint={ability as Ability} bonus={skillBonus(c, skill)}
                  proficient={!!c.proficiencies.skills?.includes(skill)} expertise={!!c.proficiencies.expertise?.includes(skill)}
                  disabled={!canEdit} onClick={() => doRoll({ kind: "skill", skill })} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">● proficient · ●● expertise</p>
          </>
        )}

        {tab === "Features" && <FeaturesTab features={character.features} featText={featText} />}

        {tab === "Gear" && <GearTab characterId={character.id} rules={character.rule_set ?? "2024"} gear={gear} canEdit={canEdit} />}
      </section>

      {resources.length > 0 && (
        <section className="mt-5 grid grid-cols-2 gap-3">
          {resources.map((r, i) => (
            <div key={r.name} className="rounded-2xl border border-line p-4">
              <p className="text-sm text-soft">{r.name} · {r.max - (r.used ?? 0)} / {r.max}</p>
              <div className="mt-1">
                <Pips max={r.max} used={r.used ?? 0} label={r.name} disabled={!canEdit} onChange={(used) => {
                  setResources(resources.map((x, j) => (j === i ? { ...x, used } : x)));
                  run(() => setResourceUsed(character.id, i, used), (res) => setResources(res.resources));
                }} />
              </div>
              {r.recharge && <p className="mt-1 text-xs text-muted">Back on a {r.recharge}</p>}
            </div>
          ))}
        </section>
      )}

      {canEdit && c.class_levels.length > 0 && (
        <RestPanel characterId={character.id} classLevels={c.class_levels} conMod={m.CON} hitDiceUsed={hitDiceUsed} hp={{ cur: hp.cur, max: character.hp_max ?? 0 }}
          onRested={(r) => { setHp({ cur: r.hp_current, temp: r.temp_hp }); setResources(r.resources); setSpells(r.spells); setHitDiceUsed(r.hit_dice_used); if (r.kind === "long") setConc(null); }} />
      )}

      {canEdit && <RollTray last={last} error={error} pending={pending} advantage={advantage} setAdvantage={setAdvantage} damage={followUp} />}
    </>
  );
}

function describe(c: SheetCharacter, o: Option) {
  const dmg = o.damage ? damageExpression(c, o, o.level || undefined) : "";
  const main =
    o.kind === "save" ? `${o.save_ability} save · ${dmg} ${o.damage_type ?? ""}${o.half_on_save ? " (half on save)" : ""}`
    : o.kind === "heal" ? `${dmg} healing`
    : o.kind === "boost" ? (o.damage ? `+${dmg}` : o.damage_bonus ? `+${o.damage_bonus} damage` : "")
    : dmg ? `${dmg} ${o.damage_type ?? ""}` : "";
  const act = actionOf(o);
  return [
    main.trim(),
    act !== "action" && act !== "free" ? ACTION_LABEL[act] : null,
    o.level ? `level ${o.level} spell` : o.fromSpell ? "cantrip" : null,
    o.resource ? `uses ${o.resource}` : null,
    o.range,
    o.note,
  ].filter(Boolean).join(" · ");
}

function OptionGroup({ title, items, c, canEdit, pending, resourceLeft, onUse, empty }: {
  title: string; items: Option[]; c: SheetCharacter; canEdit: boolean; pending: boolean;
  resourceLeft: (name?: string) => number; onUse: (o: Option) => void; empty?: string;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
      <div className="mt-2 flex flex-col gap-2">
        {items.length === 0 && empty && <Empty text={empty} />}
        {items.map((o) => {
          const noSlot = !!o.level && lowestFreeSlot(c, o.level) === null;
          const noResource = resourceLeft(o.resource) <= 0;
          const label = noSlot ? "No slots" : noResource ? `No ${o.resource}` : optionButtonLabel(c, o);
          return (
            <div key={o.key} className="flex items-center gap-3 rounded-2xl bg-surface p-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{o.name}</p>
                <p className="text-sm text-muted">{describe(c, o)}</p>
              </div>
              <RollButton
                label={label}
                tone={o.kind === "heal" ? "heal" : o.kind === "boost" && !o.damage ? "quiet" : "accent"}
                disabled={!canEdit || pending || noSlot || noResource}
                onClick={() => onUse(o)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function concText(c: { spell: string; dc: number; total: number | null; kept: boolean; reason: string }) {
  if (c.reason === "down") return `Dropped to 0 HP: ${c.spell} ends.`;
  return `Concentration save for ${c.spell}: ${c.total} vs DC ${c.dc}. ${c.kept ? "Still concentrating." : `${c.spell} ends.`}`;
}
