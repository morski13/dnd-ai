// Rolls without internet (pure, tested; runs in the browser). When the phone is offline the sheet rolls here,
// remembers every die, and keeps the roll in a queue on the phone. Back online, each roll is sent to the server,
// which replays the same dice through the usual roll (spells slots, resources, targets, stats), so nothing differs
// from a roll made online, except that it's saved a little later.
import { roll, secureRng, type Advantage, type Rng } from "./dice";
import { allOptions, planRoll, rowKey, tableRow, type RollRequest, type SheetCharacter, type SpellInfo } from "./rules";

/** An RNG that remembers each die it rolls. */
export function recorder(): { rng: Rng; values: number[] } {
  const values: number[] = [];
  return { values, rng: (sides) => { const v = secureRng(sides); values.push(v); return v; } };
}

/** Plays back recorded dice (a value that doesn't fit the die is rolled fresh). */
export function replayRng(values: number[]): Rng {
  let i = 0;
  return (sides) => {
    const v = values[i++];
    return Number.isInteger(v) && v >= 1 && v <= sides ? v : secureRng(sides);
  };
}

export type QueuedRoll = {
  id: string;                 // "offline-…": also what a damage roll after it points at
  characterId: string;
  request: RollRequest;
  advantage: Advantage;
  values: number[];
  at: string;                 // when it was rolled
  label: string;
  total: number | null;
  physical?: boolean;         // real dice, typed in while offline
};

const hitOrMiss = (total: number | null, ac: number | null, nat20: boolean, nat1: boolean) =>
  nat20 ? true : nat1 ? false : total == null || ac == null ? null : total >= ac;
const typedAc = (r: RollRequest) => (r.kind === "use" && Number.isFinite(r.ac) ? Math.max(1, Math.min(40, Math.round(r.ac!))) : null);

/** The roll as the sheet's tray shows it (the same shape as a saved roll). */
export type OfflineRoll = {
  id: string; label: string; rollType: string; expression: string; total: number | null; dice: number[]; diceAll: number[]; modifier: number;
  isCrit: boolean; isFumble: boolean; dc?: number; ability?: string; inSession: boolean; offline: true; request: RollRequest;
  followUp?: { key: string; slot?: number }; success?: boolean | null; vsAc?: number | null; target?: null; applied?: null;
  table?: { row: string; text?: string }; next?: { key: string; label: string; many?: boolean }; self?: null;
};

/**
 * Work out and roll one roll on the phone. `critical`: damage after an attack that crit.
 * Slots and resources aren't spent here: the server spends them when the roll is sent.
 */
export function offlineRoll(c: SheetCharacter, library: SpellInfo[], request: RollRequest, advantage: Advantage, critical: boolean, rng: Rng): OfflineRoll | { error: string } {
  let plan;
  try { plan = planRoll(c, request, library); } catch (e) { return { error: (e as Error).message }; }
  const crit = request.kind === "damage" && critical;
  let result: ReturnType<typeof roll> | null = null;
  try {
    const adv: Advantage = plan.d20 && (advantage === "advantage" || advantage === "disadvantage") ? advantage : "normal";
    result = plan.expression ? roll(plan.expression, { advantage: adv, critical: crit, critOn: plan.critOn, critExtra: plan.critExtra, critMode: plan.critMode, rng }) : null;
  } catch (e) { return { error: `Can't roll "${plan.expression}": ${(e as Error).message}` }; }
  const opt = request.kind === "use" || request.kind === "damage" ? allOptions(c, library).find((x) => x.key === request.key) : undefined;
  const row = opt?.kind === "table" && result ? tableRow(opt, result.total) : null;
  const slotNote = plan.spellSlot ? ` (level ${plan.spellSlot})` : "";
  const label =
    plan.rollType === "attack" ? `${plan.source} attack`
    : plan.rollType === "damage" ? `${plan.source} damage${crit ? (result?.doubled ? " (crit! dice ×2)" : " (crit!)") : ""}`
    : plan.rollType === "heal" ? `${plan.source} healing`
    : plan.rollType === "other" ? (row ? `${plan.source}: ${result?.total} · ${row.name}` : result ? plan.source : `${plan.source}: used`)
    : plan.source;
  const ac = typedAc(request);
  return {
    id: `offline-${crypto.randomUUID()}`,
    label: label + slotNote,
    rollType: plan.rollType,
    expression: result?.expression ?? "",
    total: result?.total ?? null,
    dice: result?.dice ?? [],
    diceAll: result?.diceAll ?? [],
    modifier: result?.modifier ?? 0,
    isCrit: !!result?.isCrit && plan.d20,
    isFumble: !!result?.isFumble && plan.d20,
    dc: plan.dc,
    ability: plan.ability,
    inSession: false,
    offline: true,
    request,
    followUp: plan.followUp && request.kind === "use" ? { key: request.key, slot: plan.spellSlot } : undefined,
    success: plan.rollType === "attack" && result ? hitOrMiss(result.total, ac, result.isCrit, result.isFumble) : null,
    vsAc: plan.rollType === "attack" ? ac : null,
    target: null, applied: null, self: null,
    ...(row ? { table: { row: row.name, text: row.text }, next: row.effect ? { key: rowKey(opt!.name, row.min), label: row.name, many: !!row.effect.many } : undefined } : {}),
  };
}

// ---------------------------------------------------------------- the queue on this phone

const KEY = "offline-rolls-v1";
const EVENT = "offline-rolls";

export function queued(): QueuedRoll[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedRoll[]; } catch { return []; }
}
function write(list: QueuedRoll[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-300))); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new Event(EVENT));
}
export const addQueued = (q: QueuedRoll) => write([...queued(), q]);
export const removeQueued = (id: string) => write(queued().filter((q) => q.id !== id));
/** For useSyncExternalStore: the queue changes in this tab (EVENT) or in another tab (storage). */
export function onQueue(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}
/** A stable snapshot string for useSyncExternalStore. */
export const queueSnapshot = () => { try { return localStorage.getItem(KEY) ?? "[]"; } catch { return "[]"; } };
