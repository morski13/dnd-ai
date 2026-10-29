"use client";
// The parts of an imported sheet the creator form doesn't have: saving throws, expertise, attacks, spells,
// equipment, coins and features. Everything can be removed before saving; the libraries say what the app knows.
import { useEffect, useState } from "react";
import { ABILITIES, type Ability } from "@/lib/rules";
import type { ImportedSheet } from "@/lib/sheet-import/types";
import { checkLibrary } from "./actions";

export type Extras = Pick<ImportedSheet, "saves" | "expertise" | "attacks" | "spells" | "equipment" | "coins" | "features" | "spellAbility" | "unknownClasses">;

const chip = (on: boolean) => `h-9 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`;
const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${label}`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted active:bg-surface-2">✕</button>
  );
}

function Heading({ title, count, note }: { title: string; count?: number; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">{title}{count != null ? ` · ${count}` : ""}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

export function ImportedParts({ value, onChange, skills, rules }: { value: Extras; onChange: (v: Extras) => void; skills: string[]; rules: string }) {
  const set = (patch: Partial<Extras>) => onChange({ ...value, ...patch });
  const [lib, setLib] = useState<{ spells: Record<string, string | null>; items: Record<string, string | null> } | null>(null);
  const [openFeature, setOpenFeature] = useState<number | null>(null);

  // which spells and items the app's libraries know (looked up once per rules choice)
  const spellKey = value.spells.join("|"), itemKey = value.equipment.map((e) => e.name).join("|");
  useEffect(() => {
    let live = true;
    checkLibrary(rules, value.spells, value.equipment.map((e) => e.name)).then((r) => {
      if (!live) return;
      setLib({ spells: Object.fromEntries(r.spells.map((s) => [s.name, s.found])), items: Object.fromEntries(r.items.map((s) => [s.name, s.found])) });
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- look up again only when the lists or rules change
  }, [rules, spellKey, itemKey]);

  const toggleSave = (a: Ability) => set({ saves: value.saves.includes(a) ? value.saves.filter((x) => x !== a) : [...value.saves, a] });
  const toggleExpert = (s: string) => set({ expertise: value.expertise.includes(s) ? value.expertise.filter((x) => x !== s) : [...value.expertise, s] });
  const unknownSpells = lib ? value.spells.filter((s) => !lib.spells[s]) : [];

  return (
    <section aria-label="From your sheet" className="flex flex-col gap-5 rounded-2xl border border-accent-line bg-accent-surface/40 p-4">
      <p className="text-sm font-bold text-accent">From your sheet</p>

      <div>
        <Heading title="Saving throws" note="proficient" />
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Proficient saving throws">
          {ABILITIES.map((a) => <button key={a} type="button" aria-pressed={value.saves.includes(a)} onClick={() => toggleSave(a)} className={chip(value.saves.includes(a))}>{a}</button>)}
        </div>
      </div>

      {skills.length > 0 && (
        <div>
          <Heading title="Expertise" note="double proficiency" />
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Expertise">
            {skills.map((s) => <button key={s} type="button" aria-pressed={value.expertise.includes(s)} onClick={() => toggleExpert(s)} className={chip(value.expertise.includes(s))}>{s}</button>)}
          </div>
        </div>
      )}

      {value.attacks.length > 0 && (
        <div>
          <Heading title="Attacks" count={value.attacks.length} note="library weapons are equipped from your bag" />
          <ul className="mt-2 flex flex-col gap-1.5">
            {value.attacks.map((a, i) => (
              <li key={`${a.name}${i}`} className="flex items-center gap-2 rounded-xl bg-surface py-1 pl-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold [overflow-wrap:anywhere]">{a.name}</span>
                  <span className="block text-xs text-muted">{[a.bonus != null ? `${a.bonus >= 0 ? "+" : ""}${a.bonus} to hit` : null, [a.damage, a.damageType].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "no numbers"}</span>
                </span>
                <Remove label={a.name} onClick={() => set({ attacks: value.attacks.filter((_, j) => j !== i) })} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {value.spells.length > 0 && (
        <div>
          <Heading title="Spells" count={value.spells.length} note={lib ? `${value.spells.length - unknownSpells.length} found in the app` : "checking…"} />
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {value.spells.map((s) => {
              const known = lib ? !!lib.spells[s] : true;
              return (
                <li key={s} className={`flex items-center rounded-full border pl-3 text-sm ${known ? "border-line text-text" : "border-dashed border-line text-muted"}`}>
                  <span className="py-1">{lib?.spells[s] ?? s}{!known && <span className="text-xs"> · note only</span>}</span>
                  <Remove label={s} onClick={() => set({ spells: value.spells.filter((x) => x !== s) })} />
                </li>
              );
            })}
          </ul>
          {unknownSpells.length > 0 && <p className="mt-2 text-xs text-muted">Spells marked “note only” aren&apos;t in the free rules the app has; they&apos;re kept as a note in Features.</p>}
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-soft">
            Spellcasting ability
            <select value={value.spellAbility ?? ""} onChange={(e) => set({ spellAbility: (e.target.value || null) as Ability | null })}
              className="h-10 rounded-xl border border-line bg-bg px-2 text-[15px]">
              <option value="">From the class</option>
              {ABILITIES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
        </div>
      )}

      {value.equipment.length > 0 && (
        <div>
          <Heading title="Equipment" count={value.equipment.length} />
          <ul className="mt-2 flex flex-col gap-1">
            {value.equipment.map((e, i) => {
              const found = lib?.items[e.name];
              return (
                <li key={`${e.name}${i}`} className="flex items-center gap-2 rounded-xl bg-surface py-0.5 pl-3 text-[15px]">
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{found ?? e.name}{e.qty > 1 && <span className="text-muted"> ×{e.qty}</span>}
                    {lib && !found && <span className="block text-xs text-muted">not in the item library: added as written</span>}
                  </span>
                  <Remove label={e.name} onClick={() => set({ equipment: value.equipment.filter((_, j) => j !== i) })} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <Heading title="Coins" />
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {COINS.map((c) => (
            <label key={c} className="rounded-xl border border-line bg-surface px-1 py-1.5 text-center">
              <span className="block text-xs uppercase text-muted">{c}</span>
              <input value={value.coins[c]} inputMode="numeric" aria-label={`${c} coins`}
                onChange={(e) => set({ coins: { ...value.coins, [c]: Math.min(9_999_999, Number(e.target.value.replace(/\D/g, "")) || 0) } })}
                className="w-full min-w-0 bg-transparent text-center font-bold outline-none" />
            </label>
          ))}
        </div>
      </div>

      {value.features.length > 0 && (
        <div>
          <Heading title="Features & notes" count={value.features.length} note="go to the Features tab" />
          <ul className="mt-2 flex flex-col gap-1">
            {value.features.map((f, i) => (
              <li key={`${f.name}${i}`} className="rounded-xl bg-surface">
                <div className="flex items-center gap-2 pl-3">
                  <button type="button" onClick={() => setOpenFeature(openFeature === i ? null : i)} aria-expanded={openFeature === i}
                    className="min-h-10 min-w-0 flex-1 py-1 text-left text-[15px] font-semibold [overflow-wrap:anywhere]">{f.name}</button>
                  <Remove label={f.name} onClick={() => set({ features: value.features.filter((_, j) => j !== i) })} />
                </div>
                {openFeature === i && f.description && <p className="whitespace-pre-line px-3 pb-3 text-sm text-soft">{f.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
