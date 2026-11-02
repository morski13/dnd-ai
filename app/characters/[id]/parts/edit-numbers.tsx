"use client";
// "Edit numbers": every number on the sheet can be set by hand, for homebrew, magic items the app
// doesn't know, or an imported sheet the app read wrong. Base values (HP max, AC, speed, scores,
// proficiencies) are replaced; extras (initiative, saves, skills, spell DC / attack) are added on top
// of what the app works out, so they keep working after a level-up. A fixed proficiency bonus replaces
// the one from the level.
import { useState, useTransition } from "react";
import { signed } from "@/lib/dice";
import type { FullCharacter } from "@/lib/character-data";
import type { Bonuses, Homebrew } from "@/lib/homebrew";
import { ABILITIES, abilityMod, profBonus, SKILLS, totalLevel, type Ability } from "@/lib/rules";
import { saveNumbers } from "../actions";

const box = "h-11 w-full rounded-lg border border-line bg-bg px-2 text-center text-base font-bold outline-none focus:border-accent";

/** Keeps what's typed as text (so "-" and "" are allowed while typing). */
const toNum = (s: string) => (s.trim() === "" || s.trim() === "-" ? 0 : Number(s));
const clean = (s: string, neg: boolean) => s.replace(neg ? /[^\d-]/g : /\D/g, "").replace(/(?!^)-/g, "").slice(0, 4);

/** Hand-set numbers, for markers on the sheet. */
export function handSet(b: Bonuses | undefined | null) {
  const x = b ?? {};
  return {
    any: !!(x.prof != null || x.init || x.spell_dc || x.spell_attack || Object.keys(x.saves ?? {}).length || Object.keys(x.skills ?? {}).length),
    prof: x.prof != null, init: !!x.init, saves: x.saves ?? {}, skills: x.skills ?? {},
  };
}

export function EditNumbers({ character, homebrew, onSaved }: {
  character: FullCharacter; homebrew: Homebrew; onSaved: (h: Homebrew) => void;
}) {
  const [open, setOpen] = useState(false);
  const marks = handSet(homebrew.bonuses);
  return (
    <section className="mt-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 text-left text-sm">
        <span aria-hidden className="text-lg text-accent">✎</span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold">Edit numbers</span>
          <span className="block text-xs text-muted">{marks.any ? "Some numbers are set by hand (✎)" : "HP, AC, speed, scores, saves, skills: for homebrew or magic items"}</span>
        </span>
        <span aria-hidden className="text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && <Editor character={character} homebrew={homebrew} onDone={(h) => { if (h) onSaved(h); setOpen(false); }} />}
    </section>
  );
}

function Editor({ character, homebrew, onDone }: { character: FullCharacter; homebrew: Homebrew; onDone: (h: Homebrew | null) => void }) {
  const b = homebrew.bonuses ?? {};
  const level = totalLevel(character.class_levels);
  const [hp, setHp] = useState(String(character.hp_max ?? ""));
  const [ac, setAc] = useState(String(character.ac ?? ""));
  const [speed, setSpeed] = useState(String(character.speed ?? ""));
  const [scores, setScores] = useState<Record<Ability, string>>(() => Object.fromEntries(ABILITIES.map((a) => [a, String(character.ability_scores[a] ?? 10)])) as Record<Ability, string>);
  const [saves, setSaves] = useState<Ability[]>(character.proficiencies.saves ?? []);
  const [skills, setSkills] = useState<string[]>(character.proficiencies.skills ?? []);
  const [expertise, setExpertise] = useState<string[]>(character.proficiencies.expertise ?? []);
  const [prof, setProf] = useState(b.prof != null ? String(b.prof) : "");
  const [init, setInit] = useState(b.init ? String(b.init) : "");
  const [spellDc, setSpellDc] = useState(b.spell_dc ? String(b.spell_dc) : "");
  const [spellAtk, setSpellAtk] = useState(b.spell_attack ? String(b.spell_attack) : "");
  const [saveX, setSaveX] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(b.saves ?? {}).map(([k, v]) => [k, String(v)])));
  const [skillX, setSkillX] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(b.skills ?? {}).map(([k, v]) => [k, String(v)])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // live totals while editing
  const mod = (a: Ability) => abilityMod(Number(scores[a]) || 10);
  const pbNow = prof.trim() !== "" ? toNum(prof) : profBonus(level);
  const saveTotal = (a: Ability) => mod(a) + (saves.includes(a) ? pbNow : 0) + toNum(saveX[a] ?? "");
  const skillTotal = (s: string) => mod(SKILLS[s]) + (skills.includes(s) ? pbNow : 0) + (expertise.includes(s) ? pbNow : 0) + toNum(skillX[s] ?? "");
  const caster = !!character.spells?.ability || (character.spells?.known?.length ?? 0) > 0;
  const spellMod = mod(character.spells?.ability ?? "INT");

  // a skill steps through: not proficient → proficient → expertise → not proficient
  const stepSkill = (s: string) => {
    if (!skills.includes(s)) setSkills([...skills, s]);
    else if (!expertise.includes(s)) setExpertise([...expertise, s]);
    else { setSkills(skills.filter((x) => x !== s)); setExpertise(expertise.filter((x) => x !== s)); }
  };

  function save() {
    setError(null);
    const num = (s: string) => (s.trim() === "" ? undefined : toNum(s));
    start(async () => {
      const r = await saveNumbers(character.id, {
        hp_max: toNum(hp), ac: toNum(ac), speed: toNum(speed),
        scores: Object.fromEntries(ABILITIES.map((a) => [a, toNum(scores[a])])) as Record<Ability, number>,
        saves, skills, expertise,
        bonuses: {
          prof: prof.trim() === "" ? null : toNum(prof), init: num(init), spell_dc: num(spellDc), spell_attack: num(spellAtk),
          saves: Object.fromEntries(Object.entries(saveX).map(([k, v]) => [k, toNum(v)])),
          skills: Object.fromEntries(Object.entries(skillX).map(([k, v]) => [k, toNum(v)])),
        },
      });
      if ("error" in r) return setError(r.error);
      onDone(r.homebrew);
    });
  }

  return (
    <div className="animate-rise mt-2 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-soft">Set any number by hand. Extras (+/−) are added on top of what the app works out, so they still count after a level-up.</p>

      <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">Basics</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <Field label="Max HP"><input value={hp} onChange={(e) => setHp(clean(e.target.value, false))} inputMode="numeric" className={box} /></Field>
        <Field label="AC"><input value={ac} onChange={(e) => setAc(clean(e.target.value, false))} inputMode="numeric" className={box} /></Field>
        <Field label="Speed"><input value={speed} onChange={(e) => setSpeed(clean(e.target.value, false))} inputMode="numeric" className={box} /></Field>
        <Field label="Initiative extra" note={`= ${signed(mod("DEX") + toNum(init))}`}>
          <input value={init} onChange={(e) => setInit(clean(e.target.value, true))} inputMode="text" placeholder="0" className={box} aria-label="Initiative extra" />
        </Field>
        <Field label="Proficiency" note={prof.trim() === "" ? `auto ${signed(profBonus(level))}` : "set by hand"}>
          <input value={prof} onChange={(e) => setProf(clean(e.target.value, false))} inputMode="numeric" placeholder={String(profBonus(level))} className={box} aria-label="Proficiency bonus" />
        </Field>
      </div>

      <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">Ability scores</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2 min-[400px]:grid-cols-6">
        {ABILITIES.map((a) => (
          <Field key={a} label={a} note={signed(mod(a))}>
            <input value={scores[a]} onChange={(e) => setScores({ ...scores, [a]: clean(e.target.value, false) })} inputMode="numeric" className={box} aria-label={`${a} score`} />
          </Field>
        ))}
      </div>

      <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">Saving throws · tap ● for proficiency</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2 min-[400px]:grid-cols-6">
        {ABILITIES.map((a) => {
          const on = saves.includes(a);
          return (
            <div key={a} className="flex flex-col items-center gap-1">
              <button type="button" aria-pressed={on} onClick={() => setSaves(on ? saves.filter((x) => x !== a) : [...saves, a])}
                className={`h-9 w-full rounded-lg border text-xs font-bold ${on ? "border-accent bg-accent-surface text-accent" : "border-line text-muted"}`}>{a} {on ? "●" : "○"}</button>
              <input value={saveX[a] ?? ""} onChange={(e) => setSaveX({ ...saveX, [a]: clean(e.target.value, true) })} placeholder="+0" aria-label={`${a} save extra`} className={`${box} h-9 text-sm`} />
              <span className="text-xs font-bold">{signed(saveTotal(a))}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">Skills · tap to step: ○ none, ● proficient, ●● expertise</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {Object.keys(SKILLS).map((s) => {
          const p = skills.includes(s), e = expertise.includes(s);
          return (
            <li key={s} className="grid grid-cols-[1fr_4.5rem_3rem] items-center gap-2">
              <button type="button" onClick={() => stepSkill(s)} aria-label={`${s}: ${e ? "expertise" : p ? "proficient" : "not proficient"}`}
                className="flex min-h-10 items-center gap-2 rounded-lg px-1 text-left text-sm">
                <span className={`w-6 shrink-0 text-xs ${p ? "text-accent" : "text-muted"}`}>{e ? "●●" : p ? "●" : "○"}</span>
                <span className="min-w-0 truncate">{s} <span className="text-xs text-muted">{SKILLS[s]}</span></span>
              </button>
              <input value={skillX[s] ?? ""} onChange={(ev) => setSkillX({ ...skillX, [s]: clean(ev.target.value, true) })} placeholder="+0" aria-label={`${s} extra`} className={`${box} h-9 text-sm`} />
              <span className="text-right text-sm font-bold">{signed(skillTotal(s))}</span>
            </li>
          );
        })}
      </ul>

      {caster && (
        <>
          <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">Spells</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <Field label="Spell DC extra" note={`DC ${8 + spellMod + pbNow + toNum(spellDc)}`}>
              <input value={spellDc} onChange={(e) => setSpellDc(clean(e.target.value, true))} placeholder="0" className={box} aria-label="Spell DC extra" />
            </Field>
            <Field label="Spell attack extra" note={signed(spellMod + pbNow + toNum(spellAtk))}>
              <input value={spellAtk} onChange={(e) => setSpellAtk(clean(e.target.value, true))} placeholder="0" className={box} aria-label="Spell attack extra" />
            </Field>
          </div>
        </>
      )}

      <p className="mt-4 text-xs text-muted">Weapon to-hit and damage: change them in Features → own rules (actions), or set a magic bonus on the item.</p>
      {error && <p className="mt-3 rounded-xl border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onDone(null)} className="h-11 rounded-xl border border-line text-sm font-bold text-soft">Cancel</button>
        <button type="button" onClick={save} disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-bold text-accent-text disabled:opacity-60">{pending ? "Saving…" : "Save numbers"}</button>
      </div>
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col items-center gap-1 text-center">
      <span className="text-xs text-muted">{label}</span>
      {children}
      {note && <span className="text-xs text-soft">{note}</span>}
    </label>
  );
}
