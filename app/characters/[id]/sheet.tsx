"use client";
// The interactive character sheet. Every tap on a bonus asks the server to roll and save it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { signed, type Advantage } from "@/lib/dice";
import { addQueued, offlineRoll, recorder, replayRng } from "@/lib/offline-rolls";
import { diceSides, physicalValues, shapeOf, type RollShape } from "@/lib/physical";
import { RealDicePad, useRealDice, type Typed } from "./parts/real-dice";
import { TargetPick, type Picked } from "./parts/target-pick";
import { aimOf, firstPick, type Aim, type AimChoice, type PartyMember } from "@/lib/targets";
import { aimChoices } from "./aim-actions";
import type { Target } from "@/lib/roll-service";
import { toConfirm } from "@/lib/sheet-confirm";
import { ConfirmNumbers } from "./parts/confirm-numbers";
import type { Feature, FullCharacter, Resource } from "@/lib/character-data";
import {
  ABILITIES, SKILLS, actionOf, allOptions, damageExpression, initiative, lowestFreeSlot, mods, optionButtonLabel, pb,
  planRoll, saveBonus, skillBonus, totalLevel, type Ability, type Option, type RollRequest, type SheetCharacter, type SpellBook, type SpellInfo,
} from "@/lib/rules";
import {
  changeHp, markAttack, practiceRoll, realDiceRoll, restoreAllSlots, rollQuick, undoRealDiceRoll, saveHomebrew, setInspiration, setConcentration, setResourceUsed, setSlotsUsed, type SavedRoll,
} from "./actions";
import { ConcentrationChip } from "./parts/concentration";
import { CustomizeButton } from "./parts/customize";
import { PrintButton } from "./parts/print-button";
import { TableCard } from "./parts/table-card";
import { OFF, useFight } from "./parts/fight-store";
import { attacksPerAction, bonusStandardActions, move, NEW_FIGHT, spend, startTurn, takeAction, turnFinished, turnLeft } from "@/lib/turn";
import { CombatPanel, type ReactionChoice } from "./parts/combat-panel";
import { SaveHelper } from "./parts/save-helper";
import { useSheetCombat } from "./parts/use-combat";
import { endFightFromSheet, endMyTurn, setMyConditions } from "./combat-actions";
import { addEffect, removeEffect } from "../../session/effect-actions";
import { damageParts } from "@/lib/breakdown";
import type { Combo } from "@/lib/combos";
import type { TableSession } from "@/lib/roll-service";
import { PortraitButton } from "../../components/map/portrait";
import { asShown, useDice } from "../../components/dice/dice-provider";
import { useWarmRolls } from "../../components/dice/use-warm-rolls";
import { BestMoves } from "./parts/best-moves";
import { FeaturesTab } from "./parts/features-tab";
import { GearTab } from "./parts/gear-tab";
import type { Gear } from "@/lib/items-data";
import { HpCard } from "./parts/hp-card";
import { RestPanel } from "./parts/rest-panel";
import { DeleteCharacter } from "./parts/delete-character";
import { HomebrewPanel } from "./parts/homebrew-panel";
import { EditNumbers, handSet } from "./parts/edit-numbers";
import { critRules, type Homebrew } from "@/lib/homebrew";
import { RollTray } from "./parts/roll-tray";
import { SpellsTab } from "./parts/spells-tab";
import { ACTION_LABEL, Empty, Pips, RollButton, RowButton, StatBox } from "./parts/ui";

type Tab = "Attacks" | "Spells" | "Skills" | "Features" | "Gear";

export function CharacterSheet({ character, canEdit, library: initialLibrary, featText, gear, levelPlan = null, portrait = null, live: initialLive = null, levelUpTo = null, party = [] }: {
  character: FullCharacter; canEdit: boolean; library: SpellInfo[]; featText: Record<string, string>; gear: Gear; levelPlan?: string | null; portrait?: string | null;
  /** everyone in the campaign: who a heal or a buff can go to */
  party?: PartyMember[];
  /** the DM said the party levels up to this level */
  levelUpTo?: number | null;
  live?: TableSession;
}) {
  const [live, setLive] = useState<TableSession>(initialLive);
  const [fight, setFight] = useFight(character.id);
  // the running fight (the DM's, or one played at the table): turn order, whose turn, conditions
  const { view, setView, reload: reloadCombat } = useSheetCombat(character.id, character.campaign_id, live?.id ?? null);
  const combat = view?.combat ?? null;
  const conditions = view?.conditions ?? [];
  const [turnWarning, setTurnWarning] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [targetAc, setTargetAc] = useState<number | null>(null); // typed on Best moves: attack rolls are checked against it
  const [hp, setHp] = useState({ cur: character.hp_current ?? character.hp_max ?? 0, temp: character.temp_hp ?? 0 });
  const [hitDiceUsed, setHitDiceUsed] = useState<Record<string, number>>(character.hit_dice_used ?? {});
  const [conc, setConc] = useState<{ spell: string } | null>(character.concentration ?? null);
  const [concNote, setConcNote] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>(character.resources);
  const [spells, setSpells] = useState<SpellBook>(character.spells);
  const [library, setLibrary] = useState<SpellInfo[]>(initialLibrary);
  const [homebrew, setHomebrew] = useState<Homebrew>(character.homebrew ?? {});
  const [inspired, setInspired] = useState(!!character.inspiration);
  const r2024 = character.rule_set === "2024";
  const [tab, setTab] = useState<Tab>("Attacks");
  const [advantage, setAdvantage] = useState<Advantage>("normal");
  const [practice, setPractice] = useState(false); // practice rolls: worked out, never saved, nothing spent
  const [last, setLast] = useState<(SavedRoll & { after?: string | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dice = useDice();
  useWarmRolls({ server: canEdit });
  const router = useRouter();

  // The character as it is right now (slots and spell list change while you play).
  const c: SheetCharacter & { features: (string | Feature)[] } = useMemo(() => ({ ...character, spells, homebrew }), [character, spells, homebrew]);
  const crit = critRules(c);
  const hand = handSet(homebrew.bonuses);
  const options = useMemo(() => allOptions(c, library), [c, library]);
  const m = mods(c);
  const classes = c.class_levels.map((cl) => cl.class);

  // in a shared fight (this character is in it), or fight mode is on for the running session
  const shared = !!combat?.meIn;
  const myTurn = !!combat?.current?.me;
  const inFight = shared || (!!live && fight.on && fight.sessionId === live.id && !combat);
  const perAction = attacksPerAction(c.class_levels, c.features);
  const speed = character.speed ?? 30;

  // The shared fight drives the turn: your turn comes up → action, bonus action, reaction and movement come back.
  // The fight ends → everything per turn resets (Rage and the like end too); HP, conditions and spent slots stay.
  const cId = combat?.meIn ? combat.id : null;
  const cKey = combat?.turnKey ?? null;
  const cRound = combat?.round ?? 1;
  const loaded = !!view;
  useEffect(() => {
    if (cId) {
      setFight((f) => {
        const fresh = myTurn ? startTurn(NEW_FIGHT, cRound) : { ...NEW_FIGHT, round: cRound, over: true };
        if (f.combatId !== cId) return { on: true, sessionId: live?.id ?? null, combatId: cId, turnKey: cKey, note: null, turn: fresh };
        if (f.turnKey === cKey) return f;
        return { ...f, turnKey: cKey, turn: myTurn ? startTurn(f.turn, cRound) : { ...f.turn, round: cRound, over: true } };
      });
    } else if (loaded) {
      setFight((f) => (f.combatId
        ? { ...OFF, note: "The fight is over. Actions, reactions and movement are reset, and Rage-style effects end. HP, conditions and spent spell slots stay until a rest." }
        : f));
    }
  }, [cId, cKey, cRound, myTurn, loaded, live?.id, setFight]);

  /** What the next roll is used as: an Opportunity Attack is a weapon attack that costs your reaction. */
  const spendAs = useRef<"reaction" | undefined>(undefined);

  /** Fight mode: what this roll costs this turn (checks and damage rolls cost nothing). */
  function spendTurn(request: RollRequest) {
    const as = spendAs.current;
    spendAs.current = undefined;
    if (!inFight || request.kind !== "use") return;
    const o = options.find((x) => x.key === request.key);
    if (!o || o.row_of) return;
    let warning: string | null = null;
    setFight((f) => {
      const r = spend(f.turn, o, perAction, as);
      warning = r.warning;
      const hasBonus = options.some((x) => actionOf(x) === "bonus" && !r.turn.ongoing.includes(x.name));
      return { ...f, turn: { ...r.turn, over: r.turn.over || (!as && turnFinished(r.turn, hasBonus)) } };
    });
    if (shared && !myTurn && warning && /turn is over/.test(warning)) warning = "It isn't your turn: only reactions now. The app counted it anyway.";
    setTurnWarning(warning);
  }

  /** Combat mode: Dash, Dodge, Hide… (your action, or your bonus action with Cunning Action). */
  function doAction(name: string, asBonus: boolean) {
    let warning: string | null = null;
    setFight((f) => { const r = takeAction(f.turn, name, asBonus); warning = r.warning; return { ...f, turn: r.turn }; });
    setTurnWarning(warning);
  }
  function doMove(feet: number) {
    let warning: string | null = null;
    setFight((f) => { const r = move(f.turn, feet, speed); warning = r.warning; return { ...f, turn: r.turn }; });
    setTurnWarning(warning);
  }
  function endTurn() {
    if (!combat) return;
    const key = combat.turnKey;
    setFight((f) => ({ ...f, turn: { ...f.turn, over: true } }));
    setTurnWarning(null);
    startTransition(async () => {
      const r = await endMyTurn(character.id, key);
      if ("error" in r) setError(r.error);
      await reloadCombat();
    });
  }
  function doReaction(r: ReactionChoice) {
    if (r.id.startsWith("oa:")) { spendAs.current = "reaction"; return doRoll({ kind: "use", key: r.id.slice(3) }, "reaction"); }
    if (r.roll) return doRoll({ kind: "use", key: r.id });
    // a feature (Uncanny Dodge…): nothing to roll, the reaction is used
    setFight((f) => ({ ...f, turn: { ...f.turn, reactionUsed: true } }));
    setTurnWarning(`${r.name}: reaction used. Tell the DM.`);
  }
  function saveConditions(next: string[]) {
    setView((v) => (v ? { ...v, conditions: next } : v));
    run(() => setMyConditions(character.id, next), (r) => setView((v) => (v ? { ...v, conditions: r.conditions } : v)));
  }
  /** Fights at the table: the player says if the attack hit, or if the target made its save (the DM knows). */
  function markHit(hit: boolean) {
    const r = last;
    if (!r) return;
    setLast({ ...r, success: hit });
    if (r.practice || r.offline) return;
    markAttack(character.id, r.id, hit).then((res) => { if ("error" in res) setError(res.error); }).catch(() => {});
  }

  /** One roll from start to finish (dice, tray, spent uses). Resolves with the saved roll, or null. */
  async function rollNow(asked: RollRequest, adv: Advantage, as?: "reaction"): Promise<SavedRoll | null> {
    spendAs.current = as;
    // attack rolls go against the AC typed on Best moves (the server decides hit or miss)
    const atk = asked.kind === "use" ? options.find((x) => x.key === asked.key) : null;
    const request: RollRequest = asked.kind === "use" && targetAc != null && (atk?.kind === "weapon" || atk?.kind === "spell_attack") ? { ...asked, ac: targetAc } : asked;
    if (practice) {
      const crit = request.kind === "damage" && !!last?.practice && last.isCrit;
      let res: Awaited<ReturnType<typeof practiceRoll>>;
      try { res = await practiceRoll(character.id, request, adv, crit); } catch { setError("Practice rolls need the internet. Turn practice off to roll for real: those work offline."); return null; }
      if ("error" in res) { setError(res.error); return null; }
      await dice.show(asShown(res.roll));
      setLast(res.roll);
      giveAdvantage(request);
      await showTriggered(res.roll, res.triggered);
      return res.roll; // nothing was spent or saved, so the sheet stays as it is
    }
    // A heal or a buff: ask who it goes to (healing changes their HP, a buff is logged on them)
    let aimed: { target: Target | null; more: Target[] } = { target: null, more: [] };
    if (request.kind === "use") {
      const who = await askTarget(atk, request.slot);
      if (who === null) return null; // cancelled
      const ref = (k: string): Target => (k.startsWith("m:") ? { monsterId: k.slice(2) } : k.startsWith("n:") ? { name: k.slice(2) } : { characterId: k.slice(2) });
      // a typed name goes last: creatures the app knows come first
      const sorted = [...who.filter((k) => !k.startsWith("n:")), ...who.filter((k) => k.startsWith("n:"))];
      aimed = { target: sorted[0] ? ref(sorted[0]) : null, more: sorted.slice(1).filter((k) => !k.startsWith("n:")).map(ref) };
    }
    // Real dice: ask what they show (or let the app roll)
    if (realDice) {
      const typed = await askDice(request, adv);
      if (typed === null) return null;
      if (typed !== "app") return rollReal(request, adv, typed, aimed);
    }
    // No internet: roll here, keep it on the phone, send it later (OfflineSync). An already-offline phone doesn't wait for the network.
    const offlineNow = typeof navigator !== "undefined" && navigator.onLine === false;
    let res: Awaited<ReturnType<typeof rollQuick>> | null = null;
    if (!offlineNow) { try { res = await rollQuick(character.id, request, adv, aimed.target, aimed.more); } catch { res = null; } } // the dice land first, the page refreshes after
    if (!res) return rollOffline(request, adv);
    if ("error" in res) { setError(res.error); return null; }
    spendTurn(request);
    await dice.show(asShown(res.roll));
    setLast(res.roll);
    applySelf(res.roll);
    giveAdvantage(request);
    await showTriggered(res.roll, res.triggered);
    if (res.concentration !== undefined) setConc(res.concentration);
    setConcNote(res.endedConcentration ? `You stopped concentrating on ${res.endedConcentration}.` : null);
    const cc = res.roll.applied?.concentration;
    if (cc && res.roll.applied?.target.characterId === character.id) { if (!cc.kept) setConc(null); setConcNote(concText(cc)); }
    setSpells(res.spells);
    setResources(res.resources);
    setTimeout(() => router.refresh(), 0); // other screens (stats, lists) see it now, without keeping the button busy
    return res.roll;
  }

  // ---- who a roll goes to: "Who gets Healing Word?", and in a fight "Who does Morningstar hit?"
  const [aimPick, setAimPick] = useState<{ title: string; aim: Aim; choices: AimChoice[]; initial: string[]; typeName?: boolean; recent?: string[]; done: (p: Picked | null) => void } | null>(null);
  const typedNames = useRef<string[]>([]); // enemies typed in this fight ("Goblin"), offered again next time
  const lastAim = useRef<Record<string, string[]>>({}); // last pick per option ("" = last enemy attacked)
  async function askTarget(o: Option | null | undefined, slot?: number): Promise<Picked | null> {
    if (!o || !aimOf(o, slot, true)) return [];
    // who's there right now (the fight changes between rolls); without internet: the party from page load
    let got: Awaited<ReturnType<typeof aimChoices>>;
    try { got = await aimChoices(character.id); } catch { got = { error: "offline" }; }
    const inFight = !("error" in got) && got.inFight;
    const choices: AimChoice[] = "error" in got
      ? party.map((p) => ({ key: `c:${p.id}`, name: p.name, side: "party", me: p.id === character.id, hp: p.hp, max: p.max, temp: p.temp, health: p.hp === 0 && p.max ? "down" : "unhurt" }))
      : got.choices;
    const aim = aimOf(o, slot, inFight);
    if (!aim) return [];
    const usable = choices.filter((c) => (aim.foe ? c.side === "enemy" || aim.many : c.side === "party"));
    // in a fight the enemies may not be in the app at all (played at the table): type a name instead
    const typeName = aim.foe && inFight;
    if (!typeName && (!usable.length || (aim.foe && !usable.some((c) => c.side === "enemy")))) return [];
    const before = lastAim.current[o.key] ?? (aim.foe ? lastAim.current[""] : undefined);
    const initial = before?.some((k) => k.startsWith("n:")) ? before : firstPick(aim, usable, before);
    return new Promise((resolve) => setAimPick({
      title: o.name, aim, choices: usable, initial, typeName, recent: typedNames.current,
      done: (p) => {
        setAimPick(null);
        if (p && p.length) { lastAim.current[o.key] = p; if (aim.foe) lastAim.current[""] = p; }
        for (const k of p ?? []) if (k.startsWith("n:")) typedNames.current = [k.slice(2), ...typedNames.current.filter((x) => x !== k.slice(2))].slice(0, 6);
        resolve(p);
      },
    }));
  }

  // ---- real dice: the number pad, then the usual roll with those dice
  const [realDice, setRealDice] = useRealDice();
  const [undoable, setUndoable] = useState<string | null>(null); // the real-dice roll that can still be taken back
  const [pad, setPad] = useState<{ title: string; shape: RollShape; done: (t: Typed | "app" | null) => void } | null>(null);
  const rollOpts = (request: RollRequest, adv: Advantage) => {
    const plan = planRoll(c, request, library);
    const critical = request.kind === "damage" && !!last?.isCrit && (last.id === request.parentRollId || !request.parentRollId);
    return { plan, opts: { advantage: plan.d20 ? adv : "normal" as Advantage, critical, critOn: plan.critOn, critExtra: plan.critExtra, critMode: plan.critMode } };
  };
  function askDice(request: RollRequest, adv: Advantage): Promise<Typed | "app" | null> {
    let r;
    try { r = rollOpts(request, adv); } catch { return Promise.resolve("app"); }
    if (!r.plan.expression) return Promise.resolve("app"); // nothing to roll (a save spell, a use)
    const shape = shapeOf(r.plan.expression, r.opts);
    if (!shape.d20s && !shape.others.length) return Promise.resolve("app");
    const label = options.find((o) => "key" in request && o.key === request.key)?.name ?? r.plan.source;
    return new Promise((resolve) => setPad({ title: `${label}${r.plan.rollType === "damage" ? " damage" : r.plan.rollType === "heal" ? " healing" : ""}`, shape, done: (t) => { setPad(null); resolve(t); } }));
  }
  async function rollReal(request: RollRequest, adv: Advantage, typed: Typed, aimed?: { target: Target | null; more: Target[] }): Promise<SavedRoll | null> {
    const { plan, opts } = rollOpts(request, adv);
    const v = physicalValues(diceSides(plan.expression!, opts), typed);
    if ("error" in v) { setError(v.error); return null; }
    const offlineNow = typeof navigator !== "undefined" && navigator.onLine === false;
    let res: Awaited<ReturnType<typeof realDiceRoll>> | null = null;
    if (!offlineNow) { try { res = await realDiceRoll(character.id, request, adv, v.values, aimed?.target, aimed?.more); } catch { res = null; } }
    if (!res) {
      const r = offlineRoll(c, library, request, adv, opts.critical, replayRng(v.values));
      if ("error" in r) { setError(r.error); return null; }
      addQueued({ id: r.id, characterId: character.id, request, advantage: adv, values: v.values, at: new Date().toISOString(), label: r.label, total: r.total, physical: true });
      spendTurn(request); setLast({ ...r, physical: true }); giveAdvantage(request);
      return r;
    }
    if ("error" in res) { setError(res.error); return null; }
    spendTurn(request);
    setLast({ ...res.roll, physical: true });
    setUndoable(res.roll.id);
    setTimeout(() => setUndoable((id) => (id === res.roll.id ? null : id)), 2 * 60_000);
    applySelf(res.roll);
    giveAdvantage(request);
    await showTriggered(res.roll, res.triggered);
    if (res.concentration !== undefined) setConc(res.concentration);
    setSpells(res.spells);
    setResources(res.resources);
    setTimeout(() => router.refresh(), 0);
    return res.roll;
  }
  /** Typed a wrong number: take the roll back (2 minutes) and type it again. */
  function undoReal() {
    const r = last;
    if (!r?.physical) return;
    setError(null);
    startTransition(async () => {
      const u = await undoRealDiceRoll(character.id, r.id);
      if ("error" in u) { setError(u.error); return; }
      setLast(null);
      router.refresh();
      await rollNow(r.request, advantage);
    });
  }

  /** A roll without internet: the same rules, dice from this phone, sent when it's back online. Slots and uses are spent then. */
  async function rollOffline(request: RollRequest, adv: Advantage): Promise<SavedRoll | null> {
    const rec = recorder();
    const crit = request.kind === "damage" && !!last?.offline && last.isCrit;
    const r = offlineRoll(c, library, request, adv, crit, rec.rng);
    if ("error" in r) { setError(r.error); return null; }
    addQueued({ id: r.id, characterId: character.id, request, advantage: adv, values: rec.values, at: new Date().toISOString(), label: r.label, total: r.total });
    spendTurn(request);
    await dice.show(asShown(r));
    setLast(r);
    giveAdvantage(request);
    return r;
  }

  function doRoll(request: RollRequest, as?: "reaction") {
    if (!canEdit || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await rollNow(request, advantage, as);
      if (r && request.kind === "initiative" && combat) await reloadCombat(); // your place in the order
    });
  }

  /** Best moves → "Do it": the boosts, then the attack or spell (with advantage when the move has it). */
  function doCombo(combo: Combo) {
    if (!canEdit || pending) return;
    setError(null);
    startTransition(async () => {
      for (const b of combo.parts.boosts) if (!(await rollNow({ kind: "use", key: b.key }, advantage))) return;
      const first = combo.parts.main ?? combo.parts.bonus;
      if (!first) return;
      const adv: Advantage = combo.parts.advantage ? "advantage" : advantage;
      if (combo.parts.advantage) setAdvantage("advantage");
      await rollNow({ kind: "use", key: first.key }, adv);
    });
  }

  // Rolls set off by this one (Wild Surge after Rage): their dice tumble next, and the tray shows the last one.
  async function showTriggered(by: SavedRoll | null, triggered?: SavedRoll[]) {
    for (const t of triggered ?? []) {
      await dice.show(asShown(t));
      setLast({ ...t, after: by?.label ?? null });
      applySelf(t);
    }
  }
  // Reckless Attack (or any trick that gives advantage): the next rolls are with advantage
  function giveAdvantage(request: RollRequest) {
    if (request.kind !== "use") return;
    const o = options.find((x) => x.key === request.key);
    if (o?.kind === "boost" && o.gives_advantage) setAdvantage("advantage");
  }
  // HP changed by a roll's "then" (temp HP from Wild Surge, damage from Magic Reserves)
  function applySelf(r: SavedRoll) {
    if (r.self?.hp_current !== undefined) setHp({ cur: r.self.hp_current, temp: r.self.temp_hp ?? 0 });
    // you healed yourself (Healing Word on "you")
    const mine = [r.applied, ...(r.appliedAll ?? [])].find((a) => a?.target.characterId === character.id && a.kind === "heal");
    if (mine?.hpAfter != null) { const cur = mine.hpAfter; setHp((h) => ({ ...h, cur })); }
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

  // the named numbers in the last damage or healing roll ("STR" 4), for the sum under the total
  const lastParts = (() => {
    if (!last || (last.rollType !== "damage" && last.rollType !== "heal")) return [];
    const req = last.request;
    if (req.kind !== "use" && req.kind !== "damage") return [];
    const o = options.find((x) => x.key === req.key);
    return o ? damageParts(c, o, req.slot ?? (o.level || undefined)) : [];
  })();

  // reactions you can take on anyone's turn
  const reactionChoices: ReactionChoice[] = (() => {
    const out: ReactionChoice[] = [];
    for (const o of options) {
      if (o.row_of || actionOf(o) !== "reaction") continue;
      out.push({ id: o.key, name: o.name, why: o.fromSpell ? `${o.level ? `Level ${o.level} spell` : "Cantrip"}${o.range ? ` · ${o.range}` : ""}` : o.note ?? "Uses your reaction", roll: true });
    }
    for (const w of options.filter((o) => o.kind === "weapon" && !o.ranged && !o.row_of).slice(0, 2)) {
      out.push({ id: `oa:${w.key}`, name: `Opportunity Attack · ${w.name}`, why: "Someone leaves your reach: one attack with it.", roll: true });
    }
    const have = new Set(c.features.map((f) => (typeof f === "string" ? f : f.name)));
    for (const [name, why] of FEATURE_REACTIONS) if (have.has(name) && !out.some((x) => x.name === name)) out.push({ id: `f:${name}`, name, why, roll: false });
    return out;
  })();

  const sheetOptions = options.filter((o) => !o.fromSpell && o.kind !== "boost" && !o.row_of);
  const spellOptions = options.filter((o) => o.fromSpell && (o.damage || o.kind === "heal"));
  const boosts = options.filter((o) => o.kind === "boost" && !o.fromSpell && !o.row_of);

  // How this character's crit works, for the damage button: the rules or the house rule, plus Brutal Critical
  const critHow = (o: Option) => {
    const die = o.damage?.match(/d(\d+)/)?.[1];
    const brutal = crit.extra > 0 && o.kind === "weapon" && !o.ranged && die ? ` + Brutal Critical ${crit.extra}d${die}` : "";
    return crit.mode === "double" ? `dice${brutal} rolled, then doubled` : `dice doubled${brutal}`;
  };

  // After an attack or a save spell, offer the damage roll (same slot level, crit-aware).
  const followUp = (() => {
    if (last?.next && !!last.practice === practice) {
      const next = last.next;
      return { label: `Roll ${next.label}`, onClick: () => doRoll({ kind: "use", key: next.key }) };
    }
    if (!last?.followUp || !!last.practice !== practice) return null;
    if (last.rollType === "attack" && last.success === false) return null; // a miss: no damage to roll
    const o = options.find((x) => x.key === last.followUp!.key);
    if (!o) return null;
    const saved = last.rollType === "save_dc" && last.success === true; // the target made its save
    if (saved && !o.half_on_save) return null;
    const expr = damageExpression(c, o, last.followUp.slot);
    return {
      label: last.isCrit ? `Roll crit damage (${expr}, ${critHow(o)})` : saved ? `Roll damage (${expr}, they take half)` : `Roll damage (${expr})`,
      onClick: () => doRoll(last.practice
        ? { kind: "damage", key: o.key, slot: last.followUp!.slot }
        : { kind: "damage", key: o.key, slot: last.followUp!.slot, parentRollId: last.id }),
    };
  })();

  return (
    <>
    {/* phones and tablets: one column. Laptops: the character on the left, the tabs on the right */}
    <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-8 xl:grid-cols-[24rem_minmax(0,1fr)]">
    <div className="lg:col-start-1 lg:row-start-1">
      <header>
        <div className="flex items-center gap-2">
          <Link href="/characters" aria-label="Back to characters" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-soft">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
          <div className="flex-1" />
          <PrintButton characterId={character.id} />
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

      {canEdit && levelUpTo && levelUpTo > totalLevel(c.class_levels) && (
        <Link href={`/characters/${character.id}/level-up${levelUpTo > totalLevel(c.class_levels) + 1 ? `?to=${levelUpTo}` : ""}`}
          className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border border-success-line bg-success-bg px-3 py-2 text-sm">
          <span aria-hidden className="text-lg">▲</span>
          <span className="min-w-0 flex-1"><b className="text-text">Your DM says: level {levelUpTo}!</b> <span className="text-soft">{levelPlan ? "Your plan is ready." : "Tap to level up."}</span></span>
          <span className="shrink-0 font-bold text-success">Level up ›</span>
        </Link>
      )}
      <Link href={`/tavern?c=${character.id}&mode=character`}
        className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-soft">
        <span aria-hidden className="text-accent">✦</span>
        <span className="min-w-0 flex-1 truncate">Ask the Tavern about {character.name}: combos, rules, features</span>
        <span aria-hidden className="text-accent">→</span>
      </Link>

      {canEdit && <ConfirmNumbers characterId={character.id} rows={toConfirm(character)} />}

      <HpCard cur={hp.cur} temp={hp.temp} max={character.hp_max ?? 0} canEdit={canEdit} pending={pending}
        onChange={(kind, n) => run(() => changeHp(character.id, kind, n), (r) => {
          setHp({ cur: r.hp_current, temp: r.temp_hp });
          if (r.concentration) { if (!r.concentration.kept) setConc(null); setConcNote(concText(r.concentration)); }
        })} />

      <ConcentrationChip spell={conc?.spell ?? null} note={concNote} canEdit={canEdit} pending={pending}
        choices={(spells.known ?? []).filter((n) => library.find((x) => x.name === n)?.concentration)}
        onSet={(spell) => run(() => setConcentration(character.id, spell), (r) => { setConc(r.concentration); setConcNote(null); })} />

      <button type="button" role="switch" aria-checked={inspired} disabled={!canEdit || pending}
        onClick={() => {
          const on = !inspired;
          setInspired(on);
          // spending it (2014): advantage on the next roll; 2024's Heroic Inspiration is a reroll, done by hand
          if (!on && !r2024) setAdvantage("advantage");
          run(() => setInspiration(character.id, on), (r) => setInspired(r.inspiration));
        }}
        className={`mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm ${inspired ? "border-accent-line bg-accent-surface" : "border-line bg-surface"}`}>
        <span aria-hidden className={`text-lg ${inspired ? "text-accent" : "text-muted"}`}>{inspired ? "★" : "☆"}</span>
        <span className="min-w-0 flex-1">
          <span className={`font-semibold ${inspired ? "text-accent" : ""}`}>{r2024 ? "Heroic Inspiration" : "Inspiration"}</span>
          <span className="block text-xs text-muted">
            {inspired ? (r2024 ? "Tap to spend it: reroll one die you just rolled" : "Tap to spend it: your next roll has advantage") : "None right now · tap when the DM gives it"}
          </span>
        </span>
      </button>

      {fight.note && !combat && (
        <p className="animate-pop mt-3 flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-soft" role="status">
          <span className="min-w-0 flex-1">{fight.note}</span>
          <button type="button" onClick={() => setFight((f) => ({ ...f, note: null }))} className="h-8 shrink-0 px-1 text-xs text-muted underline">OK</button>
        </p>
      )}
      <TableCard combatOn={combat ? (combat.meIn ? "in" : "out") : "none"} onJoined={() => void reloadCombat()}
        characterId={character.id} canEdit={canEdit} live={live} setLive={setLive} fight={fight} setFight={setFight}
        perAction={perAction} canSurge={resources.some((r) => /^action surge$/i.test(r.name) && (r.used ?? 0) < r.max)}
        spendSurge={() => {
          const i = resources.findIndex((r) => /^action surge$/i.test(r.name));
          if (i >= 0) run(() => setResourceUsed(character.id, i, (resources[i].used ?? 0) + 1), (r) => setResources(r.resources));
        }}
        warning={inFight ? turnWarning : null} />

      {shared && combat && (
        <CombatPanel combat={combat} t={fight.turn} perAction={perAction} speed={speed} canEdit={canEdit} pending={pending}
          warning={turnWarning} bonusStd={bonusStandardActions(c.class_levels, c.features)} reactions={reactionChoices}
          canSurge={resources.some((r) => /^action surge$/i.test(r.name) && (r.used ?? 0) < r.max)}
          conditions={conditions} note={null}
          onRollInit={() => doRoll({ kind: "initiative" })}
          onEndTurn={endTurn} onAction={doAction} onMove={doMove} onReaction={doReaction} onConditions={saveConditions}
          onSurge={() => {
            setFight((f) => ({ ...f, turn: { ...f.turn, actions: f.turn.actions + 1, over: false } }));
            const i = resources.findIndex((r) => /^action surge$/i.test(r.name));
            if (i >= 0) run(() => setResourceUsed(character.id, i, (resources[i].used ?? 0) + 1), (r) => setResources(r.resources));
          }}
          onDrop={(name) => setFight((f) => ({ ...f, turn: { ...f.turn, ongoing: f.turn.ongoing.filter((x) => x !== name), thisTurn: f.turn.thisTurn.filter((x) => x !== name) } }))}
          onSaveHelper={() => setSaveOpen(true)}
          onTimed={(p) => { if (combat.myCombatantId) run(() => addEffect(combat.myCombatantId!, p), () => void reloadCombat()); }}
          onRemoveTimed={(id) => { if (combat.myCombatantId) run(() => removeEffect(combat.myCombatantId!, id), () => void reloadCombat()); }}
          onEndFight={live?.kind === "table" || combat.isDm ? () => run(() => endFightFromSheet(character.id), () => void reloadCombat()) : undefined}
          saveHelper={saveOpen ? (
            <SaveHelper bonus={(a) => saveBonus(c, a)} canEdit={canEdit} pending={pending} onClose={() => setSaveOpen(false)}
              onRoll={(a) => new Promise((resolve) => {
                setError(null);
                startTransition(async () => { const r = await rollNow({ kind: "save", ability: a }, advantage); resolve(r?.total ?? null); });
              })}
              onApply={async (o) => {
                if (o.damage > 0) {
                  const r = await changeHp(character.id, "damage", o.damage);
                  if ("error" in r) setError(r.error);
                  else {
                    setHp({ cur: r.hp_current, temp: r.temp_hp });
                    if (r.concentration) { if (!r.concentration.kept) setConc(null); setConcNote(concText(r.concentration)); }
                  }
                }
                if (o.condition && !conditions.includes(o.condition)) saveConditions([...conditions, o.condition]);
              }} />
          ) : null} />
      )}

      <section className="mt-3 grid grid-cols-4 gap-2">
        <StatBox label="AC" value={character.ac ?? "–"} />
        <StatBox label="Speed" value={character.speed ?? "–"} />
        <StatBox label="Init" value={signed(initiative(c))} sub={hand.init ? "✎ set by hand" : canEdit ? "tap to roll" : undefined} onClick={canEdit ? () => doRoll({ kind: "initiative" }) : undefined} />
        <StatBox label="Prof." value={signed(pb(c))} sub={hand.prof ? "✎ set by hand" : `lvl ${totalLevel(c.class_levels)}`} />
      </section>

      <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">Ability checks</p>
      <section className="mt-1.5 grid grid-cols-6 gap-1.5">
        {ABILITIES.map((a) => (
          <button key={a} type="button" disabled={!canEdit} onClick={() => doRoll({ kind: "ability", ability: a })}
            className="flex min-h-20 flex-col items-center justify-center rounded-xl border border-line bg-surface py-2 active:border-accent">
            <span className="text-xs text-muted">{a}</span>
            <span className="text-xl font-bold">{signed(m[a])}</span>
            <span className="text-xs text-muted">{c.ability_scores[a] ?? 10}</span>
          </button>
        ))}
      </section>

      <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">Saving throws</p>
      <section className="mt-1.5 grid grid-cols-6 gap-1.5" aria-label="Saving throws">
        {ABILITIES.map((a) => {
          const prof = !!c.proficiencies.saves?.includes(a);
          return (
            <button key={a} type="button" disabled={!canEdit} onClick={() => doRoll({ kind: "save", ability: a })}
              aria-label={`${a} saving throw ${signed(saveBonus(c, a))}`}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border py-1.5 active:border-accent ${prof ? "border-accent-line bg-accent-surface" : "border-line bg-surface"}`}>
              <span className="text-[11px] text-muted">{a}{prof ? " ●" : ""}{hand.saves[a] ? " ✎" : ""}</span>
              <span className="text-base font-bold">{signed(saveBonus(c, a))}</span>
            </button>
          );
        })}
      </section>

      {canEdit && <EditNumbers character={character} homebrew={homebrew} onSaved={(h) => { setHomebrew(h); router.refresh(); }} />}

    </div>

    <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
      <nav className="mt-6 flex overflow-x-auto border-b border-line [scrollbar-width:none] lg:mt-0">
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
            <BestMoves c={c} options={options} turn={inFight ? turnLeft(fight.turn) : null} onDo={canEdit ? doCombo : undefined} busy={pending}
              ac={targetAc} onAc={canEdit ? setTargetAc : undefined} />
            <CritRule mode={crit.mode} range={crit.range} extra={crit.extra} disabled={!canEdit || pending}
              onChange={(mode) => {
                const next = { ...homebrew, crit_mode: mode === "double" ? ("double" as const) : undefined };
                setHomebrew(next);
                run(() => saveHomebrew(character.id, next), (r) => setHomebrew(r.homebrew));
              }} />
            {(homebrew.toggles?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-2">
                {(homebrew.toggles ?? []).map((t) => (
                  <button key={t.id} type="button" role="switch" aria-checked={t.on} disabled={!canEdit}
                    onClick={() => {
                      const next = { ...homebrew, toggles: (homebrew.toggles ?? []).map((x) => (x.id === t.id ? { ...x, on: !x.on } : x)) };
                      setHomebrew(next);
                      run(() => saveHomebrew(character.id, next), (r) => setHomebrew(r.homebrew));
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${t.on ? "border-accent-line bg-accent-surface" : "border-line bg-surface"}`}>
                    <span className="min-w-0">
                      <span className={`block font-semibold ${t.on ? "text-accent" : ""}`}>{t.name}</span>
                      <span className="block text-xs text-muted">+{t.damage}{t.damage_type ? ` ${t.damage_type}` : ""} on {t.applies_to === "*" ? "every weapon hit" : t.applies_to}</span>
                    </span>
                    <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${t.on ? "bg-accent" : "bg-line"}`}>
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${t.on ? "left-6" : "left-1"}`} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            <OptionGroup title="Weapons & attacks" items={sheetOptions} c={c} canEdit={canEdit} pending={pending} resourceLeft={resourceLeft} practice={practice} onUse={(o) => doRoll({ kind: "use", key: o.key })} />
            <OptionGroup title="Spells" items={spellOptions} c={c} canEdit={canEdit} pending={pending} resourceLeft={resourceLeft} practice={practice} onUse={(o) => doRoll({ kind: "use", key: o.key })}
              empty={c.spells?.ability ? "No damage or healing spells yet. See the Spells tab." : undefined} />
            <OptionGroup title="Class tricks" items={boosts} c={c} canEdit={canEdit} pending={pending} resourceLeft={resourceLeft} practice={practice} onUse={(o) => doRoll({ kind: "use", key: o.key })} />
          </div>
        )}

        {tab === "Spells" && (
          <SpellsTab
            characterId={character.id} c={c} options={options} library={library} canEdit={canEdit} pending={pending} classes={classes} practice={practice}
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
                <RowButton key={skill} label={hand.skills[skill] ? `${skill} ✎` : skill} hint={ability as Ability} bonus={skillBonus(c, skill)}
                  proficient={!!c.proficiencies.skills?.includes(skill)} expertise={!!c.proficiencies.expertise?.includes(skill)}
                  disabled={!canEdit} onClick={() => doRoll({ kind: "skill", skill })} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">● proficient · ●● expertise</p>
          </>
        )}

        {tab === "Features" && (
          <>
            {canEdit && (
              <HomebrewPanel characterId={character.id} name={character.name} homebrew={homebrew} setHomebrew={setHomebrew} features={c.features}
                attacks={c.attacks} resources={resources} setResources={setResources} classLevels={c.class_levels} ruleSet={character.rule_set} />
            )}
            <FeaturesTab features={character.features} featText={featText} />
          </>
        )}

        {tab === "Gear" && <GearTab characterId={character.id} rules={character.rule_set ?? "2024"} gear={gear} canEdit={canEdit} />}
      </section>
    </div>

    <div className="lg:col-start-1 lg:row-start-2">

      {resources.length > 0 && (
        <section className="mt-5 grid grid-cols-2 gap-3">
          {resources.map((r, i) => (
            <div key={r.name} className="rounded-2xl border border-line p-4">
              <p className="text-sm text-soft">{r.name} · {r.max - (r.used ?? 0)} / {r.max}</p>
              <div className="mt-1">
                <Pips max={r.max} used={r.used ?? 0} label={r.name} disabled={!canEdit} onChange={(used) => {
                  setResources(resources.map((x, j) => (j === i ? { ...x, used } : x)));
                  run(() => setResourceUsed(character.id, i, used, practice), (res) => {
                    setResources(res.resources);
                    if (res.triggered?.length) startTransition(async () => { await showTriggered({ label: `${r.name} used` } as SavedRoll, res.triggered); });
                  });
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

      {canEdit && <DeleteCharacter characterId={character.id} name={character.name} />}

    </div>
    </div>

      {canEdit && <RollTray last={last} error={error} pending={pending} advantage={advantage} setAdvantage={setAdvantage} damage={followUp}
        practice={practice} setPractice={(on) => { setPractice(on); setLast(null); setError(null); }}
        realDice={realDice} setRealDice={setRealDice} onUndoReal={last && last.id === undoable ? undoReal : undefined}
        parts={lastParts} onMark={canEdit ? markHit : undefined} markFirst={inFight} />}
      {pad && <RealDicePad title={pad.title} shape={pad.shape} onDone={pad.done} />}
      {aimPick && (
        <TargetPick title={aimPick.title} heal={aimPick.aim.heal} foe={aimPick.aim.foe} many={aimPick.aim.many} max={aimPick.aim.max}
          choices={aimPick.choices} initial={aimPick.initial} onDone={aimPick.done} typeName={aimPick.typeName} recentNames={aimPick.recent} />
      )}
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
    o.custom ? "own rule" : null,
  ].filter(Boolean).join(" · ");
}

function OptionGroup({ title, items, c, canEdit, pending, resourceLeft, onUse, empty, practice = false }: {
  title: string; items: Option[]; c: SheetCharacter; canEdit: boolean; pending: boolean; practice?: boolean;
  resourceLeft: (name?: string) => number; onUse: (o: Option) => void; empty?: string;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
      <div className="mt-2 flex flex-col gap-2">
        {items.length === 0 && empty && <Empty text={empty} />}
        {items.map((o) => {
          // practice rolls don't spend anything, so empty slots / resources don't block them
          const noSlot = !practice && !!o.level && lowestFreeSlot(c, o.level) === null;
          const noResource = !practice && resourceLeft(o.resource) <= 0;
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

/** Reactions that come from features (nothing to roll: the reaction is used and the DM is told). */
const FEATURE_REACTIONS: [string, string][] = [
  ["Uncanny Dodge", "An attack you can see hits you: halve its damage."],
  ["Defensive Duelist", "A melee attack would hit you: add your proficiency bonus to your AC."],
  ["Parry", "A melee attack hits you: reduce the damage with a Superiority Die."],
  ["Riposte", "A melee attack misses you: attack back with a Superiority Die."],
  ["Sentinel", "A creature near you attacks someone else: attack it."],
  ["Protection", "Someone attacks an ally next to you: give it disadvantage (shield in hand)."],
  ["Interception", "An ally next to you is hit: reduce the damage."],
  ["Deflect Missiles", "A ranged weapon attack hits you: reduce the damage, maybe throw it back."],
  ["Slow Fall", "You fall: reduce the falling damage."],
  ["Mage Slayer", "A creature near you casts a spell: attack it."],
  ["War Caster", "Someone leaves your reach: cast a spell at them instead of an Opportunity Attack."],
];

function concText(c: { spell: string; dc: number; total: number | null; kept: boolean; reason: string }) {
  if (c.reason === "down") return `Dropped to 0 HP: ${c.spell} ends.`;
  return `Concentration save for ${c.spell}: ${c.total} vs DC ${c.dc}. ${c.kept ? "Still concentrating." : `${c.spell} ends.`}`;
}

/** Critical hits: the rules (roll the damage dice twice) or the table's house rule (roll once, double what the dice rolled). */
function CritRule({ mode, range, extra, disabled, onChange }: {
  mode: "dice" | "double"; range: number; extra: number; disabled: boolean; onChange: (m: "dice" | "double") => void;
}) {
  const opts: { id: "dice" | "double"; title: string; sub: string }[] = [
    { id: "dice", title: "The rules", sub: extra ? "Roll the damage dice twice; Brutal Critical dice once" : "Roll the damage dice twice" },
    { id: "double", title: "House rule", sub: extra ? "Roll the dice once (Brutal Critical too), double what they rolled" : "Roll the dice once, double what they rolled" },
  ];
  return (
    <section aria-label="Critical hits" className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Critical hits · on {range === 20 ? "a 20" : `${range}–20`}{extra > 0 ? ` · Brutal Critical +${extra} ${extra === 1 ? "die" : "dice"}` : ""}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How critical hits work">
        {opts.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={mode === o.id} disabled={disabled} onClick={() => mode !== o.id && onChange(o.id)}
            className={`rounded-xl border px-3 py-2 text-left ${mode === o.id ? "border-accent bg-accent-surface" : "border-line"}`}>
            <span className={`block text-sm font-bold ${mode === o.id ? "text-accent" : ""}`}>{o.title}</span>
            <span className="block text-xs leading-snug text-muted">{o.sub}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Modifiers are never doubled. Flat bonuses like Rage count once.</p>
    </section>
  );
}
