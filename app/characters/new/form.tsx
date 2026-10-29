"use client";
// The character creator: the basics, ability scores, skills; HP, saves, slots and class resources are worked out for you.
import { useMemo, useState, useTransition } from "react";
import { averageHp, CLASS_NAMES, CLASSES, classResources, SPECIES, spellSlots, STANDARD_ARRAY, type Rules } from "@/lib/classes";
import { ABILITIES, SKILLS, type Ability } from "@/lib/rules";
import type { ImportedSheet } from "@/lib/sheet-import/types";
import { ImportedParts, type Extras } from "../import/parts";
import { createCharacter } from "./actions";

const field = "h-12 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";
const mod = (n: number) => Math.floor((n - 10) / 2);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Filled in from an imported sheet: everything stays editable before it's saved. */
function startFrom(sheet: ImportedSheet | undefined) {
  return {
    name: sheet?.name ?? "", playerName: sheet?.playerName ?? "", species: sheet?.species ?? "", background: sheet?.background ?? "",
    classes: sheet?.classes.length ? sheet.classes.map((c) => ({ ...c })) : [{ class: "Fighter", subclass: "", level: 1 }],
    scores: Object.fromEntries(ABILITIES.map((a) => [a, sheet?.scores[a] ?? 10])) as Record<Ability, number>,
    skills: sheet?.skills ?? [], hp: sheet?.hp ? String(sheet.hp) : "", ac: sheet?.ac ? String(sheet.ac) : "", speed: String(sheet?.speed ?? 30),
  };
}

export function CharacterForm({ isDm, campaignRules, imported }: { isDm: boolean; campaignRules: string; imported?: ImportedSheet }) {
  const [start0] = useState(() => startFrom(imported));
  const [name, setName] = useState(start0.name);
  const [playerName, setPlayerName] = useState(start0.playerName);
  const [forMe, setForMe] = useState(!isDm);
  const [species, setSpecies] = useState(start0.species);
  const [background, setBackground] = useState(start0.background);
  const [rules, setRules] = useState<Rules>(campaignRules === "2014" ? "2014" : "2024");
  const [classes, setClasses] = useState(start0.classes);
  const [scores, setScores] = useState<Record<Ability, number>>(start0.scores);
  const [skills, setSkills] = useState<string[]>(start0.skills);
  const [hp, setHp] = useState(start0.hp);
  const [ac, setAc] = useState(start0.ac);
  const [speed, setSpeed] = useState(start0.speed);
  const [extras, setExtras] = useState<Extras | null>(() => (imported ? {
    saves: imported.saves, expertise: imported.expertise, attacks: imported.attacks, spells: imported.spells, equipment: imported.equipment,
    coins: imported.coins, features: imported.features, spellAbility: imported.spellAbility, unknownClasses: imported.unknownClasses,
  } : null));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const main = CLASSES[classes[0].class];
  const autoHp = averageHp(classes, scores.CON);
  const { slots } = useMemo(() => spellSlots(classes, rules), [classes, rules]);
  const resources = useMemo(() => classResources(classes, scores, rules), [classes, scores, rules]);
  const level = classes.reduce((s, c) => s + c.level, 0);

  const setClass = (i: number, patch: Partial<(typeof classes)[number]>) => setClasses(classes.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const standard = () => {
    // best scores into the class's main abilities (spellcasting first, then its saves)
    const order: Ability[] = [...new Set([...(main.spell ? [main.spell] : []), ...main.saves, "CON" as Ability, "DEX" as Ability, ...ABILITIES])];
    setScores(Object.fromEntries(order.map((a, i) => [a, STANDARD_ARRAY[i]])) as Record<Ability, number>);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createCharacter({ name, playerName, species, background, rules, classes, scores, skills, hp: hp ? Number(hp) : null, ac: ac ? Number(ac) : null, speed: speed ? Number(speed) : null, forMe,
        ...(extras ? { imported: { ...extras, expertise: extras.expertise.filter((x) => skills.includes(x)) } } : {}) });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <label className="text-sm text-soft">Character name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className={`${field} mt-1`} placeholder="Nella Quickfoot" /></label>
        {isDm && (
          <>
            <label className="text-sm text-soft">Player (optional)<input value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={40} className={`${field} mt-1`} placeholder="Who will play them?" /></label>
            <label className="flex items-center gap-2 text-sm text-soft"><input type="checkbox" checked={forMe} onChange={(e) => setForMe(e.target.checked)} className="h-5 w-5 accent-accent" />This character is mine (otherwise a player claims it)</label>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-soft">Species<input value={species} onChange={(e) => setSpecies(e.target.value)} list="species" maxLength={40} className={`${field} mt-1`} /></label>
          <label className="text-sm text-soft">Background<input value={background} onChange={(e) => setBackground(e.target.value)} maxLength={40} className={`${field} mt-1`} placeholder="Criminal" /></label>
        </div>
        <datalist id="species">{SPECIES.map((s) => <option key={s} value={s} />)}</datalist>
        {campaignRules === "mixed" && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rules">
            {(["2024", "2014"] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={rules === r} onClick={() => setRules(r)}
                className={`h-11 rounded-xl border text-sm ${rules === r ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{r} rules</button>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Class">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Class · level {level}</p>
        {classes.map((c, i) => (
          <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_4.5rem] gap-2">
            <select value={c.class} onChange={(e) => setClass(i, { class: e.target.value })} aria-label="Class" className={field}>
              {CLASS_NAMES.map((n) => <option key={n}>{n}</option>)}
            </select>
            <input value={c.subclass} onChange={(e) => setClass(i, { subclass: e.target.value })} placeholder="Subclass" aria-label="Subclass" maxLength={40} className={field} />
            <input value={c.level} onChange={(e) => setClass(i, { level: Math.max(1, Math.min(20, Number(e.target.value.replace(/\D/g, "")) || 1)) })} inputMode="numeric" aria-label="Level" className={`${field} text-center`} />
          </div>
        ))}
        <div className="mt-2 flex gap-3 text-sm">
          {classes.length < 3 && <button type="button" onClick={() => setClasses([...classes, { class: "Rogue", subclass: "", level: 1 }])} className="inline-flex min-h-10 items-center text-accent underline">+ Multiclass</button>}
          {classes.length > 1 && <button type="button" onClick={() => setClasses(classes.slice(0, -1))} className="text-muted underline">Remove last class</button>}
        </div>
      </section>

      <section aria-label="Ability scores">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Ability scores</p>
          <button type="button" onClick={standard} className="inline-flex min-h-10 items-center text-sm text-accent underline">Use the standard array</button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ABILITIES.map((a) => (
            <label key={a} className="rounded-xl border border-line bg-surface px-2 py-2 text-center">
              <span className="block text-xs text-muted">{a}{main.saves.includes(a) && " · save"}</span>
              <input value={scores[a]} onChange={(e) => setScores({ ...scores, [a]: Math.max(1, Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
                inputMode="numeric" aria-label={a} className="w-full bg-transparent text-center text-xl font-bold outline-none" />
              <span className="block text-xs text-soft">{signed(mod(scores[a]))}</span>
            </label>
          ))}
        </div>
      </section>

      <section aria-label="Skills">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Skills · {classes[0].class} picks {main.skillCount} (plus your background&apos;s)</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.keys(SKILLS).map((s) => {
            const on = skills.includes(s);
            const suggested = main.skills.includes(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => setSkills(on ? skills.filter((x) => x !== s) : [...skills, s])}
                className={`h-9 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent-surface font-bold text-accent" : suggested ? "border-line text-soft" : "border-dashed border-line text-muted"}`}>{s}</button>
            );
          })}
        </div>
      </section>

      <section aria-label="Hit points and armor" className="grid grid-cols-3 gap-2">
        <label className="text-sm text-soft">HP<input value={hp} onChange={(e) => setHp(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={String(autoHp)} className={`${field} mt-1 text-center`} /></label>
        <label className="text-sm text-soft">AC<input value={ac} onChange={(e) => setAc(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={String(10 + mod(scores.DEX))} className={`${field} mt-1 text-center`} /></label>
        <label className="text-sm text-soft">Speed<input value={speed} onChange={(e) => setSpeed(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${field} mt-1 text-center`} /></label>
      </section>

      {extras && <ImportedParts value={extras} onChange={setExtras} skills={skills} rules={rules} />}

      <section className="rounded-2xl border border-line bg-surface p-4 text-sm text-soft" aria-label="Worked out for you">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Worked out for you</p>
        <p className="mt-2">HP {hp || autoHp}{!hp && " (average)"} · saves {(extras?.saves.length ? extras.saves : main.saves).join(" & ")} · hit dice {classes.map((c) => `${c.level}d${CLASSES[c.class].hitDie}`).join(" + ")}</p>
        {Object.keys(slots).length > 0 && <p className="mt-1">Spell slots: {Object.entries(slots).map(([l, n]) => `${n}× level ${l}`).join(", ")}</p>}
        {resources.length > 0 && <p className="mt-1">{resources.map((r) => `${r.name} ${r.max}`).join(" · ")}</p>}
        <p className="mt-2 text-xs text-muted">{extras ? "Your sheet's attacks, spells, equipment, coins and features are added too." : "Add weapons in the Gear tab and spells in the Spells tab after you save."}</p>
      </section>

      {error && <p className="rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
      <button disabled={pending} className="h-12 rounded-xl bg-accent text-[15px] font-bold text-accent-text">{pending ? "Making…" : "Make character"}</button>
    </form>
  );
}
