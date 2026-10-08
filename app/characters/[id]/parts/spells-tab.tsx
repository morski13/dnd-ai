"use client";
// Spells tab: spell slots, the character's spells (tap to read + cast), and adding spells from the library.
import { useState, useTransition } from "react";
import { signed } from "@/lib/dice";
import {
  damageExpression, slotsLeft, spellAttackBonus, spellSaveDC, type Option, type SheetCharacter, type SpellBook, type SpellInfo,
} from "@/lib/rules";
import { addSpell, removeSpell, searchSpells, type SpellSummary } from "../actions";
import { ACTION_LABEL, Empty, Pips, RulesText, Tag } from "./ui";

const LEVEL_NAME = (l: number) => (l === 0 ? "Cantrips" : `Level ${l}`);

export function SpellsTab({ characterId, c, options, library, canEdit, pending, classes, onCast, onSlots, onRestoreSlots, onSpellsChange, onLibraryAdd }: {
  characterId: string;
  c: SheetCharacter;
  options: Option[];
  library: SpellInfo[];
  canEdit: boolean;
  pending: boolean;
  classes: string[];
  onCast: (key: string, slot?: number) => void;
  onSlots: (level: number, used: number) => void;
  onRestoreSlots: () => void;
  onSpellsChange: (spells: SpellBook) => void;
  onLibraryAdd: (s: SpellInfo) => void;
}) {
  const [adding, setAdding] = useState(false);
  const known = c.spells?.known ?? [];
  const slotLevels = Object.keys(c.spells?.slots ?? {}).map(Number).filter((l) => (c.spells.slots?.[String(l)] ?? 0) > 0).sort();
  const spells = known.map((n) => library.find((s) => s.name === n)).filter(Boolean) as SpellInfo[];
  const levels = [...new Set(spells.map((s) => s.level))].sort((a, b) => a - b);
  const hasCasting = !!c.spells?.ability;

  return (
    <div className="flex flex-col gap-4">
      {hasCasting && (
        <section className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-soft">
              Spell save DC <strong className="text-text">{spellSaveDC(c)}</strong> · Spell attack <strong className="text-text">{signed(spellAttackBonus(c))}</strong>
            </p>
            {canEdit && slotLevels.length > 0 && (
              <button type="button" onClick={onRestoreSlots} className="h-9 rounded-lg border border-line px-3 text-xs text-soft">Long rest</button>
            )}
          </div>
          {slotLevels.map((l) => (
            <div key={l} className="mt-2 flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs uppercase tracking-[0.12em] text-muted">Level {l}</span>
              <Pips max={c.spells.slots![String(l)]} used={c.spells.slots_used?.[String(l)] ?? 0} label={`level ${l} slot`} disabled={!canEdit} onChange={(u) => onSlots(l, u)} />
            </div>
          ))}
        </section>
      )}

      {spells.length === 0 && !adding && <Empty text={hasCasting ? "No spells yet. Add some below." : "This character doesn't cast spells (yet). You can still add spells, e.g. from a feat."} />}

      {levels.map((lvl) => (
        <section key={lvl}>
          <p className="text-xs uppercase tracking-[0.12em] text-muted">
            {LEVEL_NAME(lvl)}{lvl > 0 && ` · ${slotsLeft(c, lvl)} slot${slotsLeft(c, lvl) === 1 ? "" : "s"} left`}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {spells.filter((s) => s.level === lvl).map((s) => (
              <SpellCard
                key={s.name}
                s={s}
                c={c}
                option={options.find((o) => o.key === `spell:${s.name}`)}
                slotLevels={slotLevels}
                canEdit={canEdit}
                pending={pending}
                onCast={onCast}
                onRemove={async () => {
                  const res = await removeSpell(characterId, s.name);
                  if (!("error" in res)) onSpellsChange(res.spells);
                }}
              />
            ))}
          </div>
        </section>
      ))}

      {canEdit && (adding ? (
        <AddSpells
          characterId={characterId}
          classes={classes}
          known={known}
          onAdded={(spells, spell) => { onSpellsChange(spells); onLibraryAdd(spell); }}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="h-12 rounded-xl border border-dashed border-line text-[15px] text-soft">
          + Add spells
        </button>
      ))}

      <p className="text-[11px] leading-snug text-muted">
        Spell text: System Reference Document 5.2.1 by Wizards of the Coast LLC, CC-BY-4.0.
      </p>
    </div>
  );
}

function SpellCard({ s, c, option, slotLevels, canEdit, pending, onCast, onRemove }: {
  s: SpellInfo; c: SheetCharacter; option?: Option; slotLevels: number[]; canEdit: boolean; pending: boolean;
  onCast: (key: string, slot?: number) => void; onRemove: () => void;
}) {
  const key = `spell:${s.name}`;
  const castLevels = s.level === 0 ? [0] : slotLevels.filter((l) => l >= s.level);
  const rollText = option?.damage
    ? `${damageExpression(c, option, s.level || undefined)} ${option.kind === "heal" ? "healing" : option.damage_type ?? ""}`.trim()
    : null;

  return (
    <details className="group rounded-2xl bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{s.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag>{ACTION_LABEL[s.action] ?? s.casting_time}</Tag>
            {s.concentration && <Tag tone="accent">Concentration</Tag>}
            {s.ritual && <Tag>Ritual</Tag>}
            {rollText && <span className="text-xs text-muted">{rollText}</span>}
          </div>
        </div>
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>

      <div className="border-t border-line px-4 pb-4 pt-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <div><dt className="text-muted">Casting time</dt><dd className="text-soft">{s.casting_time}</dd></div>
          <div><dt className="text-muted">Range</dt><dd className="text-soft">{s.range}</dd></div>
          <div><dt className="text-muted">Components</dt><dd className="text-soft">{s.components}</dd></div>
          <div><dt className="text-muted">Duration</dt><dd className="text-soft">{s.duration}</dd></div>
          <div className="col-span-2"><dt className="text-muted">{s.level === 0 ? "Cantrip" : `Level ${s.level}`} · {s.school}</dt><dd className="text-soft">{s.classes.join(", ")}</dd></div>
        </dl>
        <div className="mt-3"><RulesText text={s.description} /></div>
        {s.higher_levels && <div className="mt-2"><RulesText text={s.higher_levels} /></div>}

        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            {castLevels.length === 0 && s.level > 0 && <p className="text-sm text-muted">No spell slots of level {s.level} or higher.</p>}
            {castLevels.map((l) => {
              const left = l === 0 ? Infinity : slotsLeft(c, l);
              return (
                <button
                  key={l}
                  type="button"
                  disabled={pending || left === 0}
                  onClick={() => onCast(key, l || undefined)}
                  className="h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-40"
                >
                  {l === 0 ? "Cast" : `Cast at level ${l}`}
                  {l > 0 && <span className="ml-1 font-normal opacity-80">({left} left)</span>}
                </button>
              );
            })}
            <button type="button" onClick={onRemove} className="ml-auto h-11 rounded-xl border border-line px-3 text-xs text-muted">
              Remove from list
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function AddSpells({ characterId, classes, known, onAdded, onClose }: {
  characterId: string; classes: string[]; known: string[];
  onAdded: (spells: SpellBook, spell: SpellInfo) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(classes.length > 0);
  const [results, setResults] = useState<SpellSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, startTransition] = useTransition();

  function search(q = query, mine = onlyMine) {
    startTransition(async () => {
      const res = await searchSpells(characterId, q, mine ? classes : null);
      if ("error" in res) setError(res.error);
      else { setError(null); setResults(res); }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Add spells</p>
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-muted">Done</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Spell name, e.g. fire"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent"
        />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-60">Search</button>
      </form>
      {classes.length > 0 && (
        <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-soft">
          <input type="checkbox" checked={onlyMine} onChange={(e) => { setOnlyMine(e.target.checked); search(query, e.target.checked); }} className="h-5 w-5 accent-[#E0913A]" />
          Only {classes.join(" / ")} spells
        </label>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {results && (
        <ul className="mt-2 flex max-h-96 flex-col gap-1.5 overflow-y-auto">
          {results.length === 0 && <li className="text-sm text-muted">No spells found.</li>}
          {results.map((s) => {
            const have = known.includes(s.name) || added.includes(s.name);
            return (
              <li key={s.name} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">{s.level === 0 ? "Cantrip" : `Level ${s.level}`} · {s.school}{s.concentration ? " · Concentration" : ""}</p>
                </div>
                <button
                  type="button"
                  disabled={have || busy}
                  onClick={() => startTransition(async () => {
                    const res = await addSpell(characterId, s.name);
                    if ("error" in res) setError(res.error);
                    else { setAdded([...added, s.name]); onAdded(res.spells, res.spell); }
                  })}
                  className="h-11 shrink-0 rounded-xl border border-line px-3 text-sm text-soft disabled:opacity-50"
                >
                  {have ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!results && <p className="mt-2 text-xs text-muted">Search by name, or press Search to see everything.</p>}
    </section>
  );
}
