"use client";
// The level-up screen: what you get (with the rules text), then each choice as a list to tap.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { activeChoices, checkAnswers, featAbilities } from "@/lib/levelup/engine";
import type { AsiAnswer, Answers, Choice, Opt, Plan, RulesData } from "@/lib/levelup/types";
import { ABILITIES, type Ability } from "@/lib/rules";
import { useDice } from "../../../components/dice/dice-provider";
import { clearLevelPlan, confirmLevelUp, previewLevelUp, saveLevelPlan, type SavedPlan } from "./actions";
import { UndoLevelUp } from "./undo";

const mod = (s: number) => Math.floor((s - 10) / 2);
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const NO_DATA = { feats: [] } as unknown as RulesData; // feat text comes with the options

export function LevelUpWizard({ characterId, plan, scores, hp, multi, saved, goal }: {
  characterId: string; plan: Plan; scores: Record<string, number>; hp: { max: number; cur: number }; multi: boolean; saved: SavedPlan | null;
  /** building a new character up to this level: after each level-up, offer the next one */
  goal?: number;
}) {
  const router = useRouter();
  const dice = useDice();
  // a saved plan fills in the choices (only the ones that still fit this level)
  const [picks, setPicks] = useState<Answers["picks"]>(() => {
    if (!saved) return {};
    const ok: Answers["picks"] = {};
    for (const c of plan.choices) {
      const got = (saved.picks[c.key] ?? []).filter((n) => c.options.some((o) => o.name === n) || (c.kind === "subclass" && n.startsWith("custom:")));
      if (got.length) ok[c.key] = got.slice(0, Math.max(1, c.choose));
    }
    return ok;
  });
  const [asi, setAsi] = useState<Record<string, AsiAnswer | undefined>>(() => Object.fromEntries(plan.choices.filter((c) => c.kind === "asi" && saved?.asi?.[c.key]).map((c) => [c.key, saved!.asi![c.key]])));
  const [hpMode, setHpMode] = useState<"average" | "roll">(saved?.hp ?? "average");
  const [savedAt, setSavedAt] = useState<string | null>(saved?.savedAt ?? null);
  const [preview, setPreview] = useState<{ summary: string[]; rows: { label: string; before: string; after: string }[] } | null>(null);
  // what was just done (the page refreshes behind it, so `plan` soon shows the next level)
  const [done, setDone] = useState<{ summary: string[]; cls: string; level: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const answers: Answers = { picks, asi: Object.fromEntries(Object.entries(asi).filter(([, v]) => v)) as Record<string, AsiAnswer>, hp: hpMode };
  const choices = activeChoices(plan, answers);
  const missing = checkAnswers(plan, answers, { ability_scores: scores } as never, NO_DATA);
  const required = choices.filter((c) => !c.optional);
  const made = required.filter((c) => (c.kind === "asi" ? !!asi[c.key] : (picks[c.key]?.length ?? 0) >= c.choose)).length;

  // the score after the Ability Score Improvement (for the HP preview: CON counts)
  const newScores = useMemo(() => {
    const s = { ...scores };
    for (const a of Object.values(asi)) {
      if (!a) continue;
      if (a.mode === "plus2") s[a.a] = (s[a.a] ?? 10) + 2;
      else if (a.mode === "split") { s[a.a] = (s[a.a] ?? 10) + 1; s[a.b] = (s[a.b] ?? 10) + 1; }
      else if (a.ability) s[a.ability] = (s[a.ability] ?? 10) + 1;
    }
    return s;
  }, [scores, asi]);
  const con = mod(newScores.CON ?? 10), oldCon = mod(scores.CON ?? 10);
  const avgGain = Math.max(1, plan.average + con) + (con - oldCon) * (plan.totalLevel - 1);

  const toggle = (c: Choice, name: string) => {
    const cur = picks[c.key] ?? [];
    let next = cur.includes(name) ? cur.filter((x) => x !== name) : c.choose === 1 ? [name] : cur.length >= c.choose ? cur : [...cur, name];
    if (c.kind === "subclass") next = cur.includes(name) ? [] : [name];
    setPicks({ ...picks, [c.key]: next });
    setPreview(null);
  };

  function savePlan() {
    setError(null);
    start(async () => {
      const r = await saveLevelPlan(characterId, plan.className, answers);
      if ("error" in r) return setError(r.error);
      setSavedAt(r.savedAt);
    });
  }
  function forgetPlan() {
    start(async () => { const r = await clearLevelPlan(characterId); if (r && "error" in r) setError(r.error); else setSavedAt(null); });
  }
  function showPreview() {
    setError(null);
    start(async () => { const r = await previewLevelUp(characterId, plan.className, answers); if ("error" in r) setError(r.error); else setPreview(r); });
  }

  function confirm() {
    setError(null);
    start(async () => {
      const r = await confirmLevelUp(characterId, plan.className, answers);
      if ("error" in r) return setError(r.error);
      if (r.hpRoll) await dice.show({ expression: `1d${r.hpRoll.die}`, dice: [r.hpRoll.value], diceAll: [r.hpRoll.value], total: r.hpRoll.value, label: "Hit points", tone: "heal" }, { force: true });
      setDone({ summary: r.summary, cls: plan.className, level: plan.toLevel, total: plan.totalLevel });
      router.refresh();
    });
  }

  if (done) {
    return (
      <section className="mt-4" aria-live="polite">
        <p className="text-sm uppercase tracking-[0.12em] text-accent">Level up!</p>
        <h1 className="mt-1 font-heading text-3xl font-bold">{done.cls} {done.level}</h1>
        <ul className="mt-4 space-y-2 rounded-2xl border border-success-line bg-success-bg p-4 text-[15px]">
          {done.summary.map((s) => <li key={s} className="text-soft">✓ {s}</li>)}
        </ul>
        {goal && done.total < goal ? (
          <>
            <a href={`/characters/${characterId}/level-up?to=${goal}`} className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-accent font-heading text-xl font-bold text-accent-text">
              Next: level {done.total + 1} of {goal} →</a>
            <Link href={`/characters/${characterId}`} className="mt-2 flex h-12 items-center justify-center rounded-2xl border border-line text-soft">Stop here, go to the sheet</Link>
          </>
        ) : (
          <Link href={`/characters/${characterId}`} className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-accent font-heading text-xl font-bold text-accent-text">
            {goal ? `Done: level ${done.total}! Go to the sheet` : "Back to the sheet"}</Link>
        )}
        <div className="mt-3"><UndoLevelUp characterId={characterId} label={`${done.cls} ${done.level}`} /></div>
      </section>
    );
  }

  return (
    <>
      <header className="mt-2">
        <h1 className="font-heading text-3xl font-bold">Level up: {plan.className} {plan.fromLevel ? `${plan.fromLevel} → ` : ""}{plan.toLevel}</h1>
        <p className="text-soft">Character level {plan.totalLevel}{plan.subclass ? ` · ${plan.subclass}` : ""}{plan.isNew ? " · new class" : ""}</p>
        {goal && goal >= plan.totalLevel && <p className="mt-1 rounded-xl bg-accent-surface px-3 py-2 text-sm text-soft">Building up to level {goal}: level {plan.totalLevel} now, one level at a time.</p>}
        {multi && <Link href={`/characters/${characterId}/level-up?pick=1`} className="mt-1 inline-block text-sm text-accent underline">Level a different class</Link>}
        {!multi && <Link href={`/characters/${characterId}/level-up?pick=1`} className="mt-1 inline-flex min-h-10 items-center text-sm text-muted underline">Start a new class instead</Link>}
      </header>

      {plan.warnings.map((w) => <p key={w} className="mt-3 rounded-xl border border-accent-line bg-accent-surface px-3 py-2 text-sm text-soft">⚠ {w}</p>)}

      <section className="mt-5" aria-label="You get">
        <h2 className="text-xs uppercase tracking-[0.12em] text-muted">You get (nothing to choose)</h2>
        <ul className="mt-2 space-y-1.5 text-[15px] text-soft">
          {plan.gains.map((g) => <li key={g}>• {g}</li>)}
        </ul>
        {plan.auto.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {plan.auto.map((f) => <FeatureCard key={f.source + f.name} name={f.name} source={f.source} text={f.text} />)}
          </ul>
        )}
        {!plan.auto.length && !plan.gains.length && <p className="mt-2 text-sm text-muted">No new features at this level, just more hit points.</p>}
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-4" aria-label="Hit points">
        <h2 className="font-bold">Hit points</h2>
        <p className="text-sm text-muted">d{plan.hitDie} {con ? `${sign(con)} CON` : ""}{con !== oldCon ? ` (and ${sign(con - oldCon)} for each earlier level, from your new CON)` : ""}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={hpMode === "average"} onClick={() => setHpMode("average")}
            className={`rounded-xl border px-3 py-3 text-left ${hpMode === "average" ? "border-accent-strong bg-accent-surface" : "border-line"}`}>
            <span className="block font-bold">Take the average</span><span className="block text-sm text-muted">+{avgGain} HP, no risk</span>
          </button>
          <button type="button" aria-pressed={hpMode === "roll"} onClick={() => setHpMode("roll")}
            className={`rounded-xl border px-3 py-3 text-left ${hpMode === "roll" ? "border-accent-strong bg-accent-surface" : "border-line"}`}>
            <span className="block font-bold">Roll d{plan.hitDie}</span><span className="block text-sm text-muted">+{Math.max(1, 1 + con) + (con - oldCon) * (plan.totalLevel - 1)} to +{plan.hitDie + con + (con - oldCon) * (plan.totalLevel - 1)} HP</span>
          </button>
        </div>
        <p className="mt-2 text-sm text-soft">Max HP {hp.max} → {hpMode === "average" ? hp.max + avgGain : `${hp.max} + roll`}</p>
      </section>

      {choices.map((c) => (
        <ChoiceSection key={c.key} c={c} picks={picks[c.key] ?? []} onToggle={(n) => toggle(c, n)} onCustom={(n) => { setPicks({ ...picks, subclass: n ? [`custom:${n}`] : [] }); setPreview(null); }}
          asi={asi[c.key]} onAsi={(a) => { setAsi({ ...asi, [c.key]: a }); setPreview(null); }} scores={scores} newScores={newScores} />
      ))}

      <section className="mt-8 rounded-2xl border border-line bg-surface p-4" aria-label="Plan ahead">
        <h2 className="font-bold">Plan ahead</h2>
        <p className="text-sm text-muted">Not levelling up yet? Save your choices now; next time they&apos;re already filled in.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={savePlan} disabled={pending} className="h-10 rounded-xl border border-line px-3 text-sm font-semibold text-soft">Save plan for later</button>
          <button type="button" onClick={showPreview} disabled={pending || !!missing} className="h-10 rounded-xl border border-line px-3 text-sm font-semibold text-soft disabled:opacity-40">Preview my sheet</button>
          {savedAt && <button type="button" onClick={forgetPlan} disabled={pending} className="h-10 px-2 text-sm text-muted underline">Forget the plan</button>}
        </div>
        {savedAt && <p className="mt-2 text-xs text-success" role="status">✓ Plan saved {new Date(savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>}
        {preview && (
          <div className="mt-3" aria-label="Preview">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-normal"></th><th className="py-1 font-normal">Now</th><th className="py-1 font-normal">After</th></tr></thead>
              <tbody>{preview.rows.map((r) => (
                <tr key={r.label} className="border-t border-line"><td className="py-1.5 pr-2 text-muted">{r.label}</td><td className="py-1.5 pr-2">{r.before}</td><td className="py-1.5 font-semibold text-success">{r.after}</td></tr>
              ))}</tbody>
            </table>
            <ul className="mt-2 space-y-0.5 text-sm text-soft">{preview.summary.slice(1).map((s) => <li key={s}>• {s}</li>)}</ul>
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface-2/95 backdrop-blur" role="region" aria-label="Level-up status">
        <div className="mx-auto max-w-md px-5 py-3">
          {error && <p className="mb-2 text-sm text-danger" role="alert">{error}</p>}
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted">{missing ? <>{required.length ? `${made} of ${required.length} choices made. ` : ""}<span className="text-soft">{missing}</span></> : "All set!"}</p>
            <button type="button" onClick={confirm} disabled={!!missing || pending}
              className="h-12 shrink-0 rounded-xl bg-accent px-5 font-bold text-accent-text disabled:opacity-40">{pending ? "Saving…" : "Level up"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

export function FeatureCard({ name, source, text }: { name: string; source?: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 160;
  return (
    <li className="rounded-xl border border-line bg-surface px-3 py-2">
      <p className="font-semibold">{name}{source && <span className="ml-1 text-xs font-normal text-muted">· {source}</span>}</p>
      {text && <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-soft">{open || !long ? text : text.slice(0, 150).trimEnd() + "…"}</p>}
      {long && <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-xs text-accent underline">{open ? "Less" : "Read all"}</button>}
    </li>
  );
}

export function ChoiceSection({ c, picks, onToggle, onCustom, asi, onAsi, scores, newScores }: {
  c: Choice; picks: string[]; onToggle: (n: string) => void; onCustom: (n: string) => void;
  asi: AsiAnswer | undefined; onAsi: (a: AsiAnswer | undefined) => void; scores: Record<string, number>; newScores: Record<string, number>;
}) {
  const count = c.kind === "asi" ? (asi ? 1 : 0) : picks.length;
  const full = c.kind === "asi" ? !!asi : count >= c.choose;
  return (
    <section className="mt-6" aria-label={c.title}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl font-bold">{c.title}</h2>
        {!c.optional && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${full ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>
          {full ? "✓ done" : `${count}/${c.choose}`}</span>}
      </div>
      <p className="text-sm text-muted">{c.help}</p>
      {c.kind === "asi" ? <AsiPicker c={c} value={asi} onChange={onAsi} scores={scores} newScores={newScores} />
        : <OptionList c={c} picks={picks} onToggle={onToggle} />}
      {c.kind === "subclass" && <CustomSubclass value={picks[0]?.startsWith("custom:") ? picks[0].slice(7) : ""} onChange={onCustom} />}
      {c.kind === "subclass" && picks[0] && c.gives?.[picks[0]] && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">{picks[0]} gives you now</p>
          <ul className="mt-2 flex flex-col gap-2">{c.gives[picks[0]].map((f) => <FeatureCard key={f.name} name={f.name} text={f.text} />)}</ul>
        </div>
      )}
    </section>
  );
}

function CustomSubclass({ value, onChange }: { value: string; onChange: (n: string) => void }) {
  return (
    <label className="mt-2 block text-xs text-muted">Or your own (homebrew) subclass
      <input value={value} onChange={(e) => onChange(e.target.value.slice(0, 32))} placeholder="e.g. Path of the Storm"
        className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] text-text outline-none focus:border-accent" />
    </label>
  );
}

const SPELLY = new Set(["cantrips", "spells", "swap-in", "swap-out"]);

export function OptionList({ c, picks, onToggle }: { c: Choice; picks: string[]; onToggle: (n: string) => void }) {
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState<number | null>(null);
  const spelly = SPELLY.has(c.kind) || (c.kind === "spells");
  const levels = spelly ? [...new Set(c.options.map((o) => o.level ?? 0))].sort((a, b) => a - b) : [];
  const shown = c.options.filter((o) => (!q || `${o.name} ${o.tags?.join(" ") ?? ""}`.toLowerCase().includes(q.toLowerCase())) && (lvl == null || o.level === lvl));
  const big = c.options.length > 10;
  // what you've picked stays at the top
  const sorted = [...shown].sort((a, b) => Number(picks.includes(b.name)) - Number(picks.includes(a.name)));
  return (
    <div className="mt-2">
      {big && (
        <div className="flex flex-col gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={spelly ? "Search spells (name, school…)" : "Search"} aria-label={`Search ${c.title}`}
            className="h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent" />
          {levels.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Spell level">
              <Chip on={lvl == null} onClick={() => setLvl(null)}>All</Chip>
              {levels.map((l) => <Chip key={l} on={lvl === l} onClick={() => setLvl(l)}>{l === 0 ? "Cantrips" : `Level ${l}`}</Chip>)}
            </div>
          )}
        </div>
      )}
      {c.options.length === 0 && <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-sm text-muted">Nothing left to pick here.</p>}
      <ul className={`mt-2 flex flex-col gap-1.5 ${big ? "max-h-[28rem] overflow-y-auto pr-1" : ""}`}>
        {sorted.map((o) => <OptionRow key={o.name} o={o} on={picks.includes(o.name)} disabled={!picks.includes(o.name) && c.choose > 1 && picks.length >= c.choose} onClick={() => onToggle(o.name)} />)}
        {big && !sorted.length && <li className="text-sm text-muted">No match.</li>}
      </ul>
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick}
    className={`h-8 shrink-0 rounded-full border px-3 text-xs ${on ? "border-accent-strong bg-accent-surface font-bold text-text" : "border-line text-muted"}`}>{children}</button>;
}

export function OptionRow({ o, on, disabled, onClick }: { o: Opt; on: boolean; disabled: boolean; onClick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`rounded-xl border ${on ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"} ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} className="flex min-h-12 min-w-0 flex-1 items-start gap-3 px-3 py-2 text-left">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${on ? "border-accent bg-accent text-accent-text" : "border-line"}`} aria-hidden>{on ? "✓" : ""}</span>
          <span className="min-w-0">
            <span className="block font-semibold leading-tight">{o.name}</span>
            {(o.tags?.length || o.prereq) && <span className="mt-0.5 block text-xs text-muted">{[...(o.tags ?? []), o.prereq ? `Needs: ${o.prereq}` : ""].filter(Boolean).join(" · ")}</span>}
          </span>
        </button>
        {o.text && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`What does ${o.name} do?`}
          className="h-12 shrink-0 px-3 text-sm text-accent">{open ? "Hide" : "Info"}</button>}
      </div>
      {open && <p className="whitespace-pre-line border-t border-line px-3 py-2 text-sm leading-relaxed text-soft">{o.text}</p>}
    </li>
  );
}

function AsiPicker({ c, value, onChange, scores, newScores }: {
  c: Choice; value: AsiAnswer | undefined; onChange: (a: AsiAnswer | undefined) => void; scores: Record<string, number>; newScores: Record<string, number>;
}) {
  const [mode, setMode] = useState<"plus2" | "split" | "feat">(c.boon ? "feat" : value?.mode ?? "plus2");
  const [first, setFirst] = useState<Ability | null>(null);
  const featName = value?.mode === "feat" ? value.feat : null;
  const feat = c.options.find((o) => o.name === featName);
  const raises = feat ? featAbilities(feat.text) : null;

  const tapScore = (a: Ability) => {
    if (mode === "plus2") return onChange(value?.mode === "plus2" && value.a === a ? undefined : { mode: "plus2", a });
    if (first === a) { setFirst(null); return onChange(undefined); }
    if (!first) { setFirst(a); return onChange(undefined); }
    onChange({ mode: "split", a: first, b: a });
    setFirst(null);
  };
  const chosen = (a: Ability) => (value?.mode === "plus2" && value.a === a) || (value?.mode === "split" && (value.a === a || value.b === a)) || first === a;

  return (
    <div className="mt-2">
      {!c.boon && (
        <div className="grid grid-cols-3 rounded-xl bg-surface p-1" role="group" aria-label="How to improve">
          {([["plus2", "+2 to one"], ["split", "+1 to two"], ["feat", "A feat"]] as const).map(([m, l]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setFirst(null); onChange(undefined); }}
              className={`h-10 rounded-lg text-sm ${mode === m ? "bg-bg font-bold" : "text-muted"}`}>{l}</button>
          ))}
        </div>
      )}
      {mode !== "feat" ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ABILITIES.map((a) => {
            const now = scores[a] ?? 10, after = newScores[a] ?? now;
            const capped = now + (mode === "plus2" ? 2 : 1) > 20;
            return (
              <button key={a} type="button" disabled={capped && !chosen(a)} onClick={() => tapScore(a)} aria-pressed={chosen(a)}
                className={`rounded-xl border px-2 py-2 text-center disabled:opacity-40 ${chosen(a) ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"}`}>
                <span className="block text-xs text-muted">{a}</span>
                <span className="block text-lg font-bold">{now}{after !== now ? <span className="text-success"> → {after}</span> : ""}</span>
                <span className="block text-xs text-muted">{sign(mod(after))}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <OptionList c={{ ...c, kind: "pick", choose: 1 }} picks={featName ? [featName] : []}
            onToggle={(n) => onChange(featName === n ? undefined : { mode: "feat", feat: n })} />
          {raises && value?.mode === "feat" && (
            <div className="mt-2">
              <p className="text-sm text-soft">{feat!.name} also raises a score by 1. Which one?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {raises.abilities.map((a) => (
                  <Chip key={a} on={value.ability === a} onClick={() => onChange({ ...value, ability: a })}>{a} {scores[a] ?? 10}</Chip>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
