"use client";
// Builder steps 6-8: the class's level-1 features and choices (subclass, fighting style, mastery…), spells, starting equipment.
import { activeChoices } from "@/lib/levelup/engine";
import type { Choice, Plan } from "@/lib/levelup/types";
import { armorClass, extraSpells, finalScores, startingGear, weaponLines } from "@/lib/builder/engine";
import type { Draft, KitChoice, KitGroup } from "@/lib/builder/types";
import { ChoiceSection, FeatureCard } from "../../[id]/level-up/wizard";
import { Label, PickCard, StepTitle, sign } from "./ui";
import type { StepProps } from "./steps-who";

export const SPELL_KINDS = new Set(["cantrips", "spells"]);

function useToggle(d: Draft, set: StepProps["set"]) {
  return (c: Choice, name: string) => {
    const cur = d.level.picks[c.key] ?? [];
    let next = cur.includes(name) ? cur.filter((x) => x !== name) : c.choose === 1 ? [name] : cur.length >= c.choose ? cur : [...cur, name];
    if (c.kind === "subclass") next = cur.includes(name) ? [] : [name];
    set({ level: { ...d.level, picks: { ...d.level.picks, [c.key]: next } } });
  };
}

export function FeaturesStep({ d, set, data, plan, error }: StepProps & { plan: Plan | null; error: string | null }) {
  const toggle = useToggle(d, set);
  if (error) return <p className="rounded-xl border border-danger-line bg-danger-bg p-3 text-sm text-danger" role="alert">{error}</p>;
  if (!plan) return <div className="h-40 animate-pulse rounded-2xl bg-surface" aria-label="Loading" />;
  const scores = finalScores(d, data);
  const choices = activeChoices(plan, d.level).filter((c) => !SPELL_KINDS.has(c.kind));
  return (
    <div>
      <StepTitle title={`${d.cls} at level 1`} help={choices.length ? "What your class gives you, and the choices it asks for." : "What your class gives you. Nothing to choose here."} />
      {plan.gains.length > 0 && <ul className="mt-3 space-y-1 text-[15px] text-soft">{plan.gains.map((g) => <li key={g}>• {g}</li>)}</ul>}
      <ul className="mt-3 flex flex-col gap-2">{plan.auto.map((f) => <FeatureCard key={f.source + f.name} name={f.name} source={f.source} text={f.text} />)}</ul>
      {choices.map((c) => (
        <ChoiceSection key={c.key} c={c} picks={d.level.picks[c.key] ?? []} onToggle={(n) => toggle(c, n)}
          onCustom={(n) => set({ level: { ...d.level, picks: { ...d.level.picks, subclass: n ? [`custom:${n}`] : [] } } })}
          asi={undefined} onAsi={() => {}} scores={scores} newScores={scores} />
      ))}
    </div>
  );
}

export function SpellsStep({ d, set, data, plan }: StepProps & { plan: Plan | null }) {
  const toggle = useToggle(d, set);
  if (!plan) return <div className="h-40 animate-pulse rounded-2xl bg-surface" aria-label="Loading" />;
  const scores = finalScores(d, data);
  const choices = activeChoices(plan, d.level).filter((c) => SPELL_KINDS.has(c.kind));
  const extra = extraSpells(d, data).known;
  return (
    <div>
      <StepTitle title="Spells" help="Cantrips you can cast any time, and 1st-level spells that use your spell slots. Tap Info to read a spell." />
      {extra.length > 0 && <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm text-soft">You also know: {extra.join(", ")} (from your species or feat).</p>}
      {choices.map((c) => (
        <ChoiceSection key={c.key} c={c} picks={d.level.picks[c.key] ?? []} onToggle={(n) => toggle(c, n)} onCustom={() => {}}
          asi={undefined} onAsi={() => {}} scores={scores} newScores={scores} />
      ))}
    </div>
  );
}

function KitGroups({ groups, choices, onChange, data, title }: { groups: KitGroup[]; choices: KitChoice[]; onChange: (c: KitChoice[]) => void; data: StepProps["data"]; title: string }) {
  if (!groups.length) return null;
  const setGroup = (gi: number, c: KitChoice) => { const next = [...choices]; next[gi] = c; onChange(next); };
  return (
    <section aria-label={title}>
      <Label>{title}</Label>
      {groups.map((g, gi) => {
        const ch = choices[gi] ?? (g.options.length === 1 ? { option: 0, picks: [] } : undefined);
        return (
          <div key={gi} className="mt-3">
            {g.options.length > 1 && <p className="text-sm text-soft">{g.desc.replace(/^Choose A or B:\s*/i, "")}</p>}
            <ul className="mt-2 flex flex-col gap-2">
              {g.options.map((o, oi) => {
                const on = ch?.option === oi;
                const words = [...o.items.map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}`), ...o.picks.map((p) => p.label), ...(o.gp ? [`${o.gp} gp`] : [])];
                return (
                  <li key={oi}>
                    {g.options.length > 1
                      ? <PickCard on={on} onClick={() => setGroup(gi, { option: oi, picks: [] })} title={o.label ? `Option ${o.label}` : "Take this"} sub={words.join(", ") || "Nothing"} />
                      : <p className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-soft">{words.join(", ")}</p>}
                    {(on || g.options.length === 1) && o.picks.map((p, pi) => (
                      <div key={pi} className="mt-2 pl-2">
                        {Array.from({ length: p.choose }, (_, k) => {
                          const cur = ch?.picks?.[pi]?.[k] ?? "";
                          return (
                            <label key={k} className="mt-1 block text-sm text-muted">{p.choose > 1 ? `${p.label} (${k + 1} of ${p.choose})` : p.label}
                              <select value={cur} aria-label={`${p.label} ${k + 1}`}
                                onChange={(e) => {
                                  const picks = [...(ch?.picks ?? [])];
                                  const list = [...(picks[pi] ?? [])];
                                  list[k] = e.target.value;
                                  picks[pi] = list;
                                  setGroup(gi, { option: ch?.option ?? 0, picks });
                                }}
                                className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-2 text-[15px] text-text">
                                <option value="">Pick…</option>
                                {(data.categories[p.category]?.items ?? []).map((i) => <option key={i.ref ?? i.name} value={i.ref ?? i.name}>{i.name}{i.w ? ` (${i.w.damage} ${i.w.type.toLowerCase()})` : ""}</option>)}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

export function EquipmentStep({ d, set, data }: StepProps) {
  const cb = data.classes[d.cls];
  const bgList = data.backgrounds.find((b) => b.name === d.background);
  const gear = startingGear(d, data);
  const scores = finalScores(d, data);
  const ac = armorClass(gear.items, scores, d.cls, cb?.proficiencies ?? []);
  const weapons = weaponLines(gear.items, scores, 2);
  return (
    <div>
      <StepTitle title="Starting equipment" help="Pick a kit from your class and your background. Armor and weapons are put on for you." />
      {cb && <KitGroups title={`From your class (${d.cls})`} groups={cb.equipment} choices={d.kit} onChange={(kit) => set({ kit })} data={data} />}
      {cb && cb.equipmentFixed.length > 0 && <p className="mt-2 text-sm text-soft">Also: {cb.equipmentFixed.map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}`).join(", ")}</p>}
      {bgList && <KitGroups title={`From your background (${bgList.name})`} groups={bgList.equipment} choices={d.bgKit} onChange={(bgKit) => set({ bgKit })} data={data} />}
      {bgList?.equipmentFixed?.length ? <p className="mt-2 text-sm text-soft">Also: {bgList.equipmentFixed.map((i) => i.name).join(", ")}{bgList.gp ? `, ${bgList.gp} gp` : ""}</p> : null}
      {d.background === "Other" && <p className="mt-3 text-sm text-muted">A homemade background starts with {data.rules === "2024" ? "no extra gear" : "10 gp"}; add its gear in the Gear tab later.</p>}

      <section className="mt-6 rounded-2xl border border-line bg-surface p-4" aria-label="What this gives you">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">With this kit</p>
        <p className="mt-2 text-[15px]"><b>AC {ac.ac}</b> <span className="text-sm text-muted">({ac.how})</span></p>
        {weapons.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm text-soft">{weapons.map((w) => <li key={w.name}>{w.name}: {sign(w.hit)} to hit, {w.damage} {w.type}</li>)}</ul>
        )}
        <p className="mt-2 text-sm text-soft">Gold: {gear.gp} gp</p>
        {gear.missing.length > 0 && <p className="mt-2 text-sm text-muted">Still to choose: {gear.missing.join(", ")}.</p>}
      </section>
    </div>
  );
}
