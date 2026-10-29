"use client";
// Builder steps 9-10: name and personality (with the background's suggestions), then a summary before saving.
import { CLASSES } from "@/lib/classes";
import { activeChoices } from "@/lib/levelup/engine";
import type { Plan } from "@/lib/levelup/types";
import { armorClass, backgroundOf, extraSpells, finalScores, givenSkills, speciesOf, startingGear, subOf, weaponLines } from "@/lib/builder/engine";
import { ALIGNMENTS, speciesGives } from "@/lib/builder/special";
import { ABILITIES } from "@/lib/rules";
import { Chip, Label, StepTitle, mod, sign } from "./ui";
import type { StepProps } from "./steps-who";

const pickOne = (list: string[]) => list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
const field = "mt-1 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";

export function DetailsStep({ d, set, data, isDm }: StepProps & { isDm: boolean }) {
  const det = d.details;
  const setDet = (p: Partial<typeof det>) => set({ details: { ...det, ...p } });
  const tables = backgroundOf(d, data)?.tables ?? {};
  const suggest = (key: "personality" | "ideals" | "bonds" | "flaws", table: string) => {
    const list = tables[table] ?? [];
    if (list.length) setDet({ [key]: pickOne(list) });
  };
  return (
    <div>
      <StepTitle title="Who are they?" help="A name is all you need. The rest is for roleplay and can wait." />
      <label className="mt-4 block text-sm text-soft">Character name
        <input value={det.name} onChange={(e) => setDet({ name: e.target.value.slice(0, 60) })} placeholder="Nella Quickfoot" className={`${field} h-12`} />
      </label>
      {isDm && (
        <>
          <label className="mt-3 block text-sm text-soft">Player (optional)
            <input value={det.playerName} onChange={(e) => setDet({ playerName: e.target.value.slice(0, 40) })} placeholder="Who will play them?" className={`${field} h-12`} />
          </label>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-soft">
            <input type="checkbox" checked={d.forMe} onChange={(e) => set({ forMe: e.target.checked })} className="h-5 w-5 accent-accent" />
            This character is mine (otherwise a player claims it)
          </label>
        </>
      )}

      <Label>Start at level</Label>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => set({ targetLevel: Math.max(1, d.targetLevel - 1) })} aria-label="Lower level" className="h-11 w-11 rounded-xl border border-line text-lg">−</button>
        <span className="w-10 text-center font-heading text-2xl font-bold" aria-live="polite">{d.targetLevel}</span>
        <button type="button" onClick={() => set({ targetLevel: Math.min(20, d.targetLevel + 1) })} aria-label="Raise level" className="h-11 w-11 rounded-xl border border-line text-lg">+</button>
        <p className="min-w-0 flex-1 text-xs text-muted">{d.targetLevel > 1 ? `After saving, the app walks you through levels 2 to ${d.targetLevel} (hit points, new features, subclass, spells).` : "Most campaigns start at level 1."}</p>
      </div>

      <Label>Alignment (optional)</Label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ALIGNMENTS.map((a) => <Chip key={a} on={det.alignment === a} onClick={() => setDet({ alignment: det.alignment === a ? "" : a })}>{a}</Chip>)}
      </div>

      {([["personality", "Personality traits", "personality_traits"], ["ideals", "Ideals", "ideals"], ["bonds", "Bonds", "bonds"], ["flaws", "Flaws", "flaws"]] as const).map(([k, label, table]) => (
        <label key={k} className="mt-4 block text-sm text-soft">
          <span className="flex items-baseline justify-between">{label} (optional)
            {(tables[table]?.length ?? 0) > 0 && <button type="button" onClick={() => suggest(k, table)} className="inline-flex min-h-10 items-center text-accent underline">Suggest one</button>}
          </span>
          <textarea value={det[k]} onChange={(e) => setDet({ [k]: e.target.value.slice(0, 500) })} rows={2} className={`${field} py-2`} />
        </label>
      ))}
      <label className="mt-4 block text-sm text-soft">Backstory (optional)
        <textarea value={det.backstory} onChange={(e) => setDet({ backstory: e.target.value.slice(0, 2000) })} rows={4} className={`${field} py-2`} placeholder="Where they come from, who they left behind…" />
      </label>
    </div>
  );
}

export function ReviewStep({ d, data, plan, problems, goTo }: StepProps & { plan: Plan | null; problems: { step: string; label: string; text: string }[]; goTo: (s: string) => void }) {
  const sp = speciesOf(d, data), sub = subOf(d, data), bg = backgroundOf(d, data);
  const scores = finalScores(d, data);
  const gives = sp ? speciesGives(data.rules, sp.name, sub?.name ?? null) : { hpPerLevel: 0, speed: undefined };
  const hitDie = CLASSES[d.cls]?.hitDie ?? 8;
  const hp = Math.max(1, hitDie + mod(scores.CON) + (gives.hpPerLevel ?? 0));
  const gear = startingGear(d, data);
  const ac = armorClass(gear.items, scores, d.cls, data.classes[d.cls]?.proficiencies ?? []);
  const skills = [...new Set([...givenSkills(d, data).keys(), ...d.classSkills])];
  const picks = plan ? activeChoices(plan, d.level).flatMap((c) => (d.level.picks[c.key] ?? []).map((n) => n.replace(/^custom:/, ""))) : [];
  const spells = [...extraSpells(d, data).known, ...(d.level.picks.cantrips ?? []), ...(d.level.picks.spells ?? [])];
  const subclass = (d.level.picks.subclass?.[0] ?? "").replace(/^custom:/, "");
  return (
    <div>
      <StepTitle title={d.details.name || "Your character"} help={[sp?.name, sub && sp && sp.subs.length > 1 ? sub.name.replace(/^.*?:\s*/, "") : null, `${d.cls} 1${subclass ? ` (${subclass})` : ""}`, bg?.name].filter(Boolean).join(" · ")} />
      {problems.length > 0 && (
        <div className="mt-4 rounded-2xl border border-danger-line bg-danger-bg p-4 text-sm" role="alert">
          <p className="font-semibold text-danger">Still to do</p>
          <ul className="mt-1 space-y-1">
            {problems.map((p) => (
              <li key={p.step + p.text}><button type="button" onClick={() => goTo(p.step)} className="inline-flex min-h-9 items-center text-left text-soft underline">{p.label}: {p.text}</button></li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[["HP", hp], ["AC", ac.ac], ["Speed", gives.speed ?? sp?.speed ?? 30], ["Prof.", "+2"]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface py-2"><p className="text-xs text-muted">{l}</p><p className="text-xl font-bold">{v}</p></div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-6 gap-1.5 text-center">
        {ABILITIES.map((a) => (
          <div key={a} className="rounded-xl border border-line bg-surface py-1.5"><p className="text-[11px] text-muted">{a}</p><p className="font-bold">{sign(mod(scores[a]))}</p><p className="text-[11px] text-muted">{scores[a]}</p></div>
        ))}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <Row k="Saving throws" v={(CLASSES[d.cls]?.saves ?? []).join(", ")} />
        <Row k="Skills" v={skills.join(", ")} />
        {picks.filter((p) => p !== subclass && !spells.includes(p)).length > 0 && <Row k="Choices" v={picks.filter((p) => p !== subclass && !spells.includes(p)).join(", ")} />}
        {spells.length > 0 && <Row k="Spells" v={spells.join(", ")} />}
        <Row k="Features" v={(plan?.auto ?? []).map((f) => f.name).concat(sp?.traits.map((t) => t.name) ?? []).join(", ")} />
        <Row k="Equipment" v={gear.items.map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}`).join(", ")} />
        <Row k="Weapons" v={weaponLines(gear.items, scores, 2).map((w) => `${w.name} ${sign(w.hit)} (${w.damage})`).join(", ")} />
        <Row k="Gold" v={`${gear.gp} gp`} />
        {d.targetLevel > 1 && <Row k="Then" v={`Level up to ${d.targetLevel}, one level at a time.`} />}
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return <div className="rounded-xl bg-surface px-3 py-2"><dt className="text-xs uppercase tracking-[0.12em] text-muted">{k}</dt><dd className="mt-0.5 text-soft">{v}</dd></div>;
}
