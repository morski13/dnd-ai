"use client";
// Builder steps 1-3: class, species (race), background.
import type { ClassCard } from "@/lib/builder/data";
import { backgroundOf, featKeys, givenSkills, languageCount, MAGIC_LISTS, ORIGIN_FEATS, speciesOf, subOf } from "@/lib/builder/engine";
import { backgroundFit, bestSub, rankSpecies, type Fit } from "@/lib/builder/fit";
import { ALL_SKILLS, CLASS_BLURB, CLASS_ORDER, MENTAL, needsFor } from "@/lib/builder/special";
import type { BuilderData, Draft, FeatChoice } from "@/lib/builder/types";
import { resizeSteps } from "@/lib/levelup/multi";
import { ABILITIES, type Ability } from "@/lib/rules";
import { Chip, ChipPicker, Count, Label, MoreText, PickCard, SpellPicker, StepTitle, TraitList } from "./ui";

export type StepProps = { d: Draft; set: (p: Partial<Draft>) => void; data: BuilderData; cards: ClassCard[]; feats: Record<string, string> };

export function ClassStep({ d, set, cards, partyLevel, onRandom }: StepProps & { partyLevel?: number | null; onRandom?: (keepClass: boolean) => void }) {
  const card = cards.find((c) => c.name === d.cls);
  const setLevel = (n: number) => {
    const lvl = Math.max(1, Math.min(20, n));
    set({ targetLevel: lvl, ups: resizeSteps(d.ups ?? [], lvl - 1, d.cls) });
  };
  return (
    <div>
      <StepTitle title="Pick a class and level" help="Your class is what you're good at. Pick the level first: everything after it (features, spells, multiclassing) follows from it." />
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Starting level">
        <p className="font-semibold">Start at level</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setLevel(d.targetLevel - 1)} disabled={d.targetLevel <= 1} aria-label="Lower level" className="h-11 w-11 shrink-0 rounded-xl border border-line text-lg disabled:opacity-40">−</button>
          <label className="sr-only" htmlFor="start-level">Starting level</label>
          <select id="start-level" value={d.targetLevel} onChange={(e) => setLevel(Number(e.target.value))}
            className="h-11 w-20 shrink-0 rounded-xl border border-line bg-bg text-center font-heading text-xl font-bold">
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" onClick={() => setLevel(d.targetLevel + 1)} disabled={d.targetLevel >= 20} aria-label="Raise level" className="h-11 w-11 shrink-0 rounded-xl border border-line text-lg disabled:opacity-40">+</button>
          {partyLevel && partyLevel !== d.targetLevel && partyLevel <= 20 && (
            <button type="button" onClick={() => setLevel(partyLevel)} className="min-h-11 px-1 text-left text-sm text-accent underline">Your party is level {partyLevel}</button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">{d.targetLevel > 1
          ? `You'll pick level 1 as usual, then levels 2 to ${d.targetLevel} in one step (subclass, Ability Score Improvements or feats, and multiclassing if your scores allow it), then your spells.`
          : "Most campaigns start at level 1."}</p>
      </section>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => onRandom?.(!!d.cls)} disabled={!onRandom}
          className="flex h-11 items-center gap-1.5 rounded-xl border border-accent-line bg-accent-surface px-4 text-sm font-bold text-accent disabled:opacity-40">
          <span aria-hidden>🎲</span> {d.cls ? `Random ${d.cls}` : "Random character"}</button>
        {d.cls && onRandom && <button type="button" onClick={() => onRandom(false)} className="inline-flex min-h-10 items-center text-sm text-muted underline">or any class</button>}
        <span className="w-full text-xs text-muted">Fills in everything at level {d.targetLevel} with a fitting species, background and picks, then shows the review. Change anything you like after.</span>
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3 [&>li>button]:h-full">
        {cards.map((c) => (
          <li key={c.name}>
            <PickCard on={d.cls === c.name} onClick={() => set({ cls: c.name, classSkills: [], level: { picks: {}, hp: "average" }, kit: [], ups: resizeSteps([], d.targetLevel - 1, c.name) })}
              title={c.name} sub={CLASS_BLURB[c.name]} badge={`d${c.hitDie}`} />
          </li>
        ))}
      </ul>
      {card && (
        <section className="mt-5 rounded-2xl border border-line bg-surface p-4" aria-label={`${card.name} at level 1`}>
          <p className="font-heading text-xl font-bold">{card.name}</p>
          <p className="mt-1 text-sm text-soft">Hit die d{card.hitDie} · saving throws {card.saves.join(" & ")}{card.spell ? ` · casts spells with ${card.spell}` : ""}</p>
          <p className="mt-1 text-sm text-soft">Subclass at level {card.subclassLevel}: {card.subclasses.join(", ") || "none in the free rules"} (or your own from a book).</p>
          <Label>At level 1 you get</Label>
          <TraitList traits={card.level1} />
        </section>
      )}
    </div>
  );
}

export function SpeciesStep({ d, set, data, feats }: StepProps) {
  const sp = speciesOf(d, data);
  const sub = subOf(d, data);
  const needs = sp ? needsFor(data.rules, sp, sub ?? null) : {};
  const picks = d.speciesPicks;
  const setPicks = (p: Partial<Draft["speciesPicks"]>) => set({ speciesPicks: { ...picks, ...p } });
  const word = data.rules === "2014" ? "race" : "species";
  const ranked = d.cls ? rankSpecies(data.rules, d.cls, data.species) : data.species.map((x) => ({ sp: x, fit: { tier: null, score: 0, reasons: [] } as Fit }));
  const best = sp && d.cls ? bestSub(sp, d.cls) : null;
  return (
    <div>
      <StepTitle title={`Pick a ${word}`} help={`Your ${word} gives you a few traits: how you see in the dark, how fast you are, small magic…`} />
      {d.cls && <FitIntro rules={data.rules} cls={d.cls} best={ranked.filter((r) => r.fit.tier === "great" || r.fit.tier === "good").slice(0, 3).map((r) => r.sp.name)} word={word} />}
      <ul className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3 [&>li>button]:h-full">
        {ranked.map(({ sp: s, fit }) => (
          <li key={s.name}>
            <PickCard on={d.species === s.name} title={s.name} badge={fitBadge(fit)}
              sub={[`${s.speed} ft`, s.size, ...(data.rules === "2014" ? [s.asi.map((x) => `${x.a} +${x.b}`).join(", ")] : []), s.traits.map((t) => t.name).slice(0, 4).join(", ")].filter(Boolean).join(" · ")}
              onClick={() => {
                const best = d.cls ? bestSub(s, d.cls) : null;
                const auto = best ? s.subs.find((x) => x.name.replace(/^.*?:\s*/, "") === best)?.name ?? null : null;
                set({ species: s.name, sub: auto, speciesPicks: { skills: [], feat: null, cantrip: null, ability: needsFor(data.rules, s, null).ability && MENTAL.includes(CLASS_ORDER[d.cls]?.[0]) ? CLASS_ORDER[d.cls][0] : null, asi: [] } });
              }}>
              <FitReasons fit={fit} />
            </PickCard>
          </li>
        ))}
      </ul>
      {sp && (
        <section className="mt-5 rounded-2xl border border-line bg-surface p-4" aria-label={`${sp.name} traits`}>
          <p className="font-heading text-xl font-bold">{sp.name}</p>
          <TraitList traits={sp.traits} />

          {needs.sub && (
            <>
              <Label>{needs.sub}</Label>
              <ul className="mt-2 grid gap-2 md:grid-cols-2 [&>li>button]:h-full">
                {sp.subs.map((s) => (
                  <li key={s.name}>
                    <PickCard on={d.sub === s.name} onClick={() => set({ sub: s.name, speciesPicks: { ...picks, cantrip: null } })} title={s.name.replace(/^.*?:\s*/, "")}
                      sub={s.asi?.length ? s.asi.map((x) => `${x.a} +${x.b}`).join(", ") : undefined}
                      badge={best && s.name.replace(/^.*?:\s*/, "") === best ? `★ Best for ${d.cls}` : undefined}>
                      {d.sub === s.name && s.traits.length > 0 && <span className="mt-1 block w-full">{s.traits.map((t) => <MoreText key={t.name} text={`${t.name}. ${t.text}`} />)}</span>}
                    </PickCard>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!needs.sub && sub && <p className="mt-3 text-sm text-soft">Subrace: <b>{sub.name}</b> (the one in the free rules){sub.asi?.length ? ` · ${sub.asi.map((x) => `${x.a} +${x.b}`).join(", ")}` : ""}</p>}
          {!needs.sub && sub && <TraitList traits={sub.traits} />}

          {needs.asi && (
            <>
              <Label note={`+${needs.asi.bonus} each`}>Raise {needs.asi.choose} abilities</Label>
              <ChipPicker label="Abilities to raise" options={needs.asi.from} picked={picks.asi} choose={needs.asi.choose} onChange={(v) => setPicks({ asi: v as Ability[] })} />
            </>
          )}
          {needs.skills && (
            <>
              <Label note={needs.skills.why}>Pick {needs.skills.choose} skill{needs.skills.choose > 1 ? "s" : ""}</Label>
              <ChipPicker label={needs.skills.why} options={needs.skills.from} picked={picks.skills} choose={needs.skills.choose} onChange={(v) => setPicks({ skills: v })} />
            </>
          )}
          {needs.feat && (
            <>
              <Label note="Versatile">Pick an origin feat</Label>
              <FeatCards picked={picks.feat} onPick={(f) => setPicks({ feat: f })} feats={feats} />
            </>
          )}
          {needs.ability && (
            <>
              <Label note="for your lineage's spells">Spellcasting ability</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MENTAL.map((a) => <Chip key={a} on={picks.ability === a} onClick={() => setPicks({ ability: a })}>{a}</Chip>)}
              </div>
            </>
          )}
          {needs.cantrip && (
            <>
              <Label note={needs.cantrip.why}>Pick a {needs.cantrip.list} cantrip</Label>
              <SpellPicker rules={data.rules} list={needs.cantrip.list} level={0} choose={1} label={needs.cantrip.why}
                picked={picks.cantrip ? [picks.cantrip] : []} onChange={(v) => setPicks({ cantrip: v[0] ?? null })} />
            </>
          )}
        </section>
      )}
    </div>
  );
}

function FeatCards({ picked, onPick, feats }: { picked: string | null; onPick: (f: string | null) => void; feats: Record<string, string> }) {
  return (
    <ul className="mt-2 grid gap-2 md:grid-cols-2 [&>li>button]:h-full">
      {ORIGIN_FEATS.map((f) => (
        <li key={f}>
          <PickCard on={picked === f} onClick={() => onPick(picked === f ? null : f)} title={f}>
            {feats[f] && <MoreText text={feats[f]} max={140} />}
          </PickCard>
        </li>
      ))}
    </ul>
  );
}

/** Magic Initiate and Skilled ask for their own picks. */
function FeatPicks({ d, set, data }: StepProps) {
  const keys = featKeys(d, data);
  if (!keys.length) return null;
  const setFeat = (k: string, p: Partial<FeatChoice>) => set({ feats: { ...d.feats, [k]: { ...(d.feats[k] ?? {}), ...p } } });
  const known = givenSkills({ ...d, feats: { ...d.feats, Skilled: {} } }, data);
  return (
    <>
      {keys.map((f) => {
        const ch = d.feats[f.key] ?? {};
        if (f.name === "Magic Initiate") {
          const list = f.list ?? ch.list ?? null;
          return (
            <section key={f.key} className="mt-5 rounded-2xl border border-line bg-surface p-4" aria-label={f.key}>
              <p className="font-heading text-lg font-bold">{f.key} <span className="text-sm font-normal text-muted">· from {f.from}</span></p>
              <p className="text-sm text-muted">Two cantrips and one 1st-level spell (cast once per long rest for free).</p>
              {!f.list && (
                <>
                  <Label>Spell list</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">{MAGIC_LISTS.map((l) => <Chip key={l} on={ch.list === l} onClick={() => setFeat(f.key, { list: l, cantrips: [], spell: undefined })}>{l}</Chip>)}</div>
                </>
              )}
              {list && (
                <>
                  <div className="mt-4 flex items-baseline justify-between"><p className="text-sm font-semibold">{list} cantrips</p><Count have={(ch.cantrips ?? []).length} need={2} /></div>
                  <SpellPicker rules={data.rules} list={list} level={0} choose={2} label={`${f.key} cantrips`} picked={ch.cantrips ?? []} onChange={(v) => setFeat(f.key, { cantrips: v })} />
                  <div className="mt-4 flex items-baseline justify-between"><p className="text-sm font-semibold">{list} 1st-level spell</p><Count have={ch.spell ? 1 : 0} need={1} /></div>
                  <SpellPicker rules={data.rules} list={list} level={1} choose={1} label={`${f.key} spell`} picked={ch.spell ? [ch.spell] : []} onChange={(v) => setFeat(f.key, { spell: v[0] })} />
                </>
              )}
              <Label>Spellcasting ability for these</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">{MENTAL.map((a) => <Chip key={a} on={ch.ability === a} onClick={() => setFeat(f.key, { ability: a })}>{a}</Chip>)}</div>
            </section>
          );
        }
        if (f.name === "Skilled") {
          return (
            <section key={f.key} className="mt-5 rounded-2xl border border-line bg-surface p-4" aria-label="Skilled">
              <div className="flex items-baseline justify-between"><p className="font-heading text-lg font-bold">Skilled <span className="text-sm font-normal text-muted">· from {f.from}</span></p><Count have={(ch.skills ?? []).length} need={3} /></div>
              <p className="text-sm text-muted">Pick 3 skills.</p>
              <ChipPicker label="Skilled skills" options={ALL_SKILLS} picked={ch.skills ?? []} choose={3} locked={known} onChange={(v) => setFeat(f.key, { skills: v })} />
            </section>
          );
        }
        return null;
      })}
    </>
  );
}

export function BackgroundStep(p: StepProps) {
  const { d, set, data, feats } = p;
  const bg = backgroundOf(d, data);
  const isOther = d.background === "Other";
  const cb = d.customBackground;
  const setCustom = (x: Partial<Draft["customBackground"]>) => set({ customBackground: { ...cb, ...x } });
  const langs = languageCount(d, data);
  return (
    <div>
      <StepTitle title="Pick a background" help={`What you did before adventuring. It gives skills, a tool and gear${data.rules === "2024" ? ", ability score bonuses and an origin feat" : ""}.`} />
      <ul className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3 [&>li>button]:h-full">
        {data.backgrounds.map((b) => (
          <li key={b.name}>
            <PickCard on={d.background === b.name} title={b.name} badge={fitBadge(backgroundFit(data.rules, d.cls, b))}
              sub={[b.skills.join(", "), b.feat ? `feat: ${b.feat.name}${b.feat.note ? ` (${b.feat.note})` : ""}` : "", b.abilities ? `+ to ${b.abilities.join(", ")}` : ""].filter(Boolean).join(" · ")}
              onClick={() => set({ background: b.name, bgKit: [], bgAsi: bestBgAsi(b.abilities, d.cls), feats: {} })}>
              <FitReasons fit={backgroundFit(data.rules, d.cls, b)} />
            </PickCard>
          </li>
        ))}
        <li>
          <PickCard on={isOther} title="Other (from a book, or your own)" sub="Name it and pick its skills yourself"
            onClick={() => set({ background: "Other", bgKit: [], bgAsi: { mode: "1-1-1" }, feats: {} })} />
        </li>
      </ul>

      {isOther && (
        <section className="mt-5 rounded-2xl border border-line bg-surface p-4" aria-label="Your background">
          <label className="block text-sm text-soft">Background name
            <input value={cb.name} onChange={(e) => setCustom({ name: e.target.value.slice(0, 40) })} placeholder="e.g. Sailor, Folk Hero"
              className="mt-1 h-12 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent" />
          </label>
          <div className="mt-4 flex items-baseline justify-between"><p className="text-sm font-semibold">2 skills</p><Count have={cb.skills.length} need={2} /></div>
          <ChipPicker label="Background skills" options={ALL_SKILLS} picked={cb.skills} choose={2} onChange={(v) => setCustom({ skills: v })} />
          {data.rules === "2024" && (
            <>
              <div className="mt-4 flex items-baseline justify-between"><p className="text-sm font-semibold">3 abilities it raises</p><Count have={cb.abilities.length} need={3} /></div>
              <ChipPicker label="Background abilities" options={[...ABILITIES]} picked={cb.abilities} choose={3} onChange={(v) => setCustom({ abilities: v as Ability[] })} />
              <Label>Origin feat</Label>
              <FeatCards picked={cb.feat} onPick={(f) => setCustom({ feat: f })} feats={feats} />
            </>
          )}
        </section>
      )}

      {bg && !isOther && (
        <section className="mt-5 rounded-2xl border border-line bg-surface p-4" aria-label={`${bg.name} background`}>
          <p className="font-heading text-xl font-bold">{bg.name}</p>
          <p className="mt-1 text-sm text-soft">Skills: {bg.skills.join(", ")}{bg.tools.length ? ` · ${bg.tools.join(", ")}` : ""}</p>
          {bg.feat && <><Label>Origin feat: {bg.feat.name}{bg.feat.note ? ` (${bg.feat.note})` : ""}</Label><MoreText text={feats[bg.feat.name] ?? ""} /></>}
          {bg.feature && <><Label>{bg.feature.name}</Label><MoreText text={bg.feature.text} /></>}
        </section>
      )}

      {data.rules === "2024" && bg && (bg.abilities?.length ?? 0) === 3 && (
        <section className="mt-5" aria-label="Ability score increases">
          <Label>Ability scores from your background</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Chip on={d.bgAsi.mode === "1-1-1"} onClick={() => set({ bgAsi: { mode: "1-1-1" } })}>+1 to all three</Chip>
            <Chip on={d.bgAsi.mode === "2-1"} onClick={() => { const x = bestBgAsi(bg.abilities, d.cls, true); set({ bgAsi: x.mode === "2-1" ? x : { mode: "2-1", plus2: bg.abilities![0], plus1: bg.abilities![1] } }); }}>+2 to one, +1 to one</Chip>
          </div>
          {d.bgAsi.mode === "2-1" && (() => {
            const asi = d.bgAsi;
            return (
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted">+2 to</p><div className="mt-1 flex flex-wrap gap-1.5">{bg.abilities!.map((a) => <Chip key={a} on={asi.plus2 === a} onClick={() => set({ bgAsi: { ...asi, plus2: a, plus1: asi.plus1 === a ? bg.abilities!.find((x) => x !== a)! : asi.plus1 } })}>{a}</Chip>)}</div></div>
                <div><p className="text-muted">+1 to</p><div className="mt-1 flex flex-wrap gap-1.5">{bg.abilities!.filter((a) => a !== asi.plus2).map((a) => <Chip key={a} on={asi.plus1 === a} onClick={() => set({ bgAsi: { ...asi, plus1: a } })}>{a}</Chip>)}</div></div>
              </div>
            );
          })()}
          {d.bgAsi.mode === "1-1-1" && <p className="mt-2 text-sm text-soft">{bg.abilities!.map((a) => `${a} +1`).join(" · ")}</p>}
        </section>
      )}

      {bg && langs > 0 && (
        <section className="mt-5" aria-label="Languages">
          <Label note={data.rules === "2024" ? "you also know Common" : speciesOf(d, data)?.languages?.slice(0, 80)}>Pick {langs} language{langs > 1 ? "s" : ""}</Label>
          <ChipPicker label="Languages" options={data.languages.filter((l) => l !== "Common")} picked={d.languages} choose={langs} onChange={(v) => set({ languages: v })} />
        </section>
      )}

      <FeatPicks {...p} />
    </div>
  );
}

// ---------------------------------------------------------------- fit hints (which species / background suit the class)

export function fitBadge(fit: Fit): string | undefined {
  return fit.tier === "great" ? "★ Great fit" : fit.tier === "good" ? "Good fit" : fit.tier === "weak" ? "Weak fit" : undefined;
}

function FitReasons({ fit }: { fit: Fit }) {
  if (!fit.reasons.length) return null;
  const tone = fit.tier === "weak" ? "text-muted" : "text-success";
  return <span className={`mt-1 block w-full pl-7 text-xs ${tone}`}>{fit.tier === "weak" ? "⚠ " : "✓ "}{fit.reasons.join(" · ")}</span>;
}

function FitIntro({ rules, cls, best, word }: { rules: string; cls: string; best: string[]; word: string }) {
  return (
    <div className="mt-3 rounded-xl border border-accent-line bg-accent-surface px-3 py-2 text-sm text-soft">
      {best.length > 0 && <p><b className="text-text">Best for a {cls}:</b> {best.join(", ")}.</p>}
      <p className={best.length ? "mt-1 text-xs text-muted" : "text-xs text-muted"}>
        {rules === "2014"
          ? `Sorted for your class: ${word}s whose bonuses raise a ${cls}'s main scores (${(CLASS_ORDER[cls] ?? []).slice(0, 2).join(", ")}) come first.`
          : `In the 2024 rules your ${word} gives no ability bonuses (your background does), so these are sorted by traits that help a ${cls}. Any ${word} works.`}
      </p>
    </div>
  );
}

/** 2024 background bonus: +2 to the class's main score and +1 to the next one when the background has them. */
function bestBgAsi(abilities: Ability[] | undefined, cls: string, force = false): Draft["bgAsi"] {
  const ord = CLASS_ORDER[cls] ?? [];
  const mine = ord.filter((a) => abilities?.includes(a));
  if (mine.length >= 2 && (force || mine[0] === ord[0])) return { mode: "2-1", plus2: mine[0], plus1: mine[1] };
  return { mode: "1-1-1" };
}
