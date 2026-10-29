"use client";
// Builder steps 4-5: ability scores (standard array, point buy, rolling, or typed in) and class skills.
import { abilityBonuses, finalScores, givenSkills, POINT_COST, POINTS, pointsUsed, STANDARD, suggestedArray } from "@/lib/builder/engine";
import { CLASS_ORDER } from "@/lib/builder/special";
import type { ScoreMethod } from "@/lib/builder/types";
import { ABILITIES, type Ability } from "@/lib/rules";
import { ChipPicker, Count, Label, StepTitle, mod, sign } from "./ui";
import type { StepProps } from "./steps-who";

const METHODS: [ScoreMethod, string, string][] = [
  ["standard", "Standard array", "15, 14, 13, 12, 10, 8: put each where you want it."],
  ["pointbuy", "Point buy", `Spend ${POINTS} points; every score 8 to 15.`],
  ["roll", "Roll 4d6", "Roll four dice, keep the best three, six times."],
  ["manual", "Type them in", "You already have scores (from the DM or paper)."],
];
const FULL: Record<Ability, string> = { STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma" };

function roll4d6(): number {
  const r = Array.from({ length: 4 }, () => 1 + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * 6)).sort((a, b) => b - a);
  return r[0] + r[1] + r[2];
}

export function AbilityScores({ d, set, data, rolled, setRolled }: StepProps & { rolled: number[]; setRolled: (r: number[]) => void }) {
  const bonuses = abilityBonuses(d, data);
  const final = finalScores(d, data);
  const order = CLASS_ORDER[d.cls] ?? [...ABILITIES];
  const setMethod = (m: ScoreMethod) => {
    if (m === "standard") set({ method: m, base: suggestedArray(order) });
    else if (m === "pointbuy") set({ method: m, base: { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 } });
    else if (m === "roll") { const r = Array.from({ length: 6 }, roll4d6).sort((a, b) => b - a); setRolled(r); set({ method: m, base: Object.fromEntries(order.map((a, i) => [a, r[i]])) as Record<Ability, number> }); }
    else set({ method: m });
  };
  const pool = d.method === "standard" ? STANDARD : d.method === "roll" ? rolled : [];
  /** put a value from the pool on an ability, swapping with whoever had it */
  const assign = (a: Ability, v: number) => {
    const other = ABILITIES.find((x) => x !== a && d.base[x] === v);
    set({ base: { ...d.base, [a]: v, ...(other ? { [other]: d.base[a] } : {}) } });
  };
  const used = pointsUsed(d.base);
  const step = (a: Ability, by: number) => {
    const v = d.base[a] + by;
    if (v < 8 || v > 15) return;
    const next = { ...d.base, [a]: v };
    if (pointsUsed(next) <= POINTS) set({ base: next });
  };

  return (
    <div>
      <StepTitle title="Ability scores" help="How strong, quick, tough, clever, wise and charming you are." />
      <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to make your scores">
        {METHODS.map(([m, t, h]) => (
          <button key={m} type="button" role="radio" aria-checked={d.method === m} onClick={() => setMethod(m)}
            className={`rounded-xl border px-3 py-2 text-left ${d.method === m ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"}`}>
            <span className="block font-semibold">{t}</span><span className="block text-xs text-muted">{h}</span>
          </button>
        ))}
      </div>

      {d.method === "roll" && rolled.length < 6 && (
        <button type="button" onClick={() => setMethod("roll")} className="mt-4 h-14 w-full rounded-2xl bg-accent font-heading text-xl font-bold text-accent-text">Roll my six scores</button>
      )}
      {d.method === "roll" && rolled.length === 6 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-soft">
          Rolled: <b className="text-text">{rolled.join(", ")}</b>
          <button type="button" onClick={() => setMethod("roll")} className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-accent">Roll again</button>
        </div>
      )}
      {(d.method === "standard" || (d.method === "roll" && rolled.length === 6)) && d.cls && (
        <button type="button" onClick={() => set({ base: Object.fromEntries(order.map((a, i) => [a, [...pool].sort((x, y) => y - x)[i]])) as Record<Ability, number> })}
          className="mt-2 inline-flex min-h-10 items-center text-sm text-accent underline">Best order for a {d.cls}</button>
      )}
      {d.method === "pointbuy" && <p className="mt-3 text-sm text-soft" role="status">Points left: <b className={POINTS - used < 0 ? "text-danger" : "text-text"}>{POINTS - used}</b> of {POINTS}</p>}

      {!(d.method === "roll" && rolled.length < 6) && <ul className="mt-3 flex flex-col gap-2">
        {ABILITIES.map((a) => {
          const bonus = bonuses.filter((b) => b.a === a).reduce((s, b) => s + b.b, 0);
          return (
            <li key={a} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
              <span className="w-[4.75rem] shrink-0">
                <span className="block font-semibold">{a}</span>
                <span className="block truncate text-xs text-muted">{d.method === "pointbuy" ? `${POINT_COST[d.base[a]]} pt` : FULL[a]}</span>
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {pool.length > 0 ? (
                  <select value={d.base[a]} onChange={(e) => assign(a, Number(e.target.value))} aria-label={`${a} score`}
                    className="h-11 min-w-0 rounded-xl border border-line bg-bg px-2 text-[15px] font-bold">
                    {[...new Set(pool)].sort((x, y) => y - x).map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : d.method === "pointbuy" ? (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => step(a, -1)} aria-label={`Lower ${a}`} className="h-11 w-10 shrink-0 rounded-xl border border-line text-lg">−</button>
                    <span className="w-7 text-center text-lg font-bold">{d.base[a]}</span>
                    <button type="button" onClick={() => step(a, 1)} aria-label={`Raise ${a}`} className="h-11 w-10 shrink-0 rounded-xl border border-line text-lg">+</button>
                  </span>
                ) : (
                  <input value={d.base[a]} inputMode="numeric" aria-label={`${a} score`}
                    onChange={(e) => set({ base: { ...d.base, [a]: Math.max(1, Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 0)) } })}
                    className="h-11 w-16 rounded-xl border border-line bg-bg text-center text-[15px] font-bold" />
                )}
                {bonus > 0 && <span className="shrink-0 text-sm text-success">+{bonus}</span>}
              </span>
              <span className="w-11 shrink-0 text-right"><span className="block text-lg font-bold">{final[a]}</span><span className="block text-xs text-muted">{sign(mod(final[a]))}</span></span>
            </li>
          );
        })}
      </ul>}
      {bonuses.length > 0 && <p className="mt-2 text-xs text-muted">Bonuses: {bonuses.map((b) => `${b.a} +${b.b} (${b.from})`).join(", ")}.</p>}
      {data.rules === "2024" && !bonuses.length && <p className="mt-2 text-xs text-muted">Your background&apos;s bonuses are added once you pick it.</p>}
    </div>
  );
}

export function SkillsStep({ d, set, data }: StepProps) {
  const cb = data.classes[d.cls];
  const given = givenSkills(d, data);
  if (!cb?.skills) return <StepTitle title="Skills" help="Pick a class first." />;
  const open = cb.skills.from.filter((s) => !given.has(s));
  const need = Math.min(cb.skills.choose, open.length);
  return (
    <div>
      <StepTitle title="Skills" help={`A ${d.cls} picks ${cb.skills.choose} from the list. Green ones you already have.`} />
      <div className="mt-4 flex items-baseline justify-between"><Label>{d.cls} skills</Label><Count have={d.classSkills.filter((s) => !given.has(s)).length} need={need} /></div>
      <ChipPicker label={`${d.cls} skills`} options={cb.skills.from} picked={d.classSkills.filter((s) => !given.has(s))} choose={need} locked={given}
        onChange={(v) => set({ classSkills: v })} />
      {given.size > 0 && (
        <>
          <Label>You already have</Label>
          <p className="mt-1 text-sm text-soft">{[...given.entries()].map(([s, from]) => `${s} (${from})`).join(", ")}</p>
        </>
      )}
    </div>
  );
}

