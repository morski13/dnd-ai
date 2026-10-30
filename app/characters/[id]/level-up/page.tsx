// Level up: pick the class (when there's a choice), then see what you get and tap your choices.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { loadCharacter } from "@/lib/character-data";
import { rulesData } from "@/lib/levelup/data";
import { levelChoices, planLevelUp, type LevelChar } from "@/lib/levelup/engine";
import { loadSpellLite } from "@/lib/levelup/server";
import { totalLevel } from "@/lib/rules";
import { BottomNav } from "../../../components/bottom-nav";
import type { SavedPlan } from "./actions";
import { LevelHistory, type HistoryEntry } from "./history";
import { LevelUpWizard } from "./wizard";

export default function LevelUpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-2xl md:px-8 flex-1 px-5 pt-8 pb-48">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-56 rounded bg-surface" /><div className="h-40 rounded-[18px] bg-surface" /><div className="h-64 rounded-[18px] bg-surface" /></div>}>
          <LevelUp params={params} searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="characters" />
    </>
  );
}

async function LevelUp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, userId, character, canEdit } = await loadCharacter(id);
  if (!userId) redirect("/login");
  if (!character) notFound();
  if (!canEdit) redirect(`/characters/${id}`);

  const c = character as unknown as LevelChar;
  const data = rulesData(character.rule_set);
  const choice = levelChoices(c, data);
  // the history and a saved plan (each needs its SQL file; the page works without them)
  const { data: logRow } = await supabase.from("characters").select("level_log").eq("id", id).maybeSingle();
  const { data: planRow } = await supabase.from("characters").select("level_plan").eq("id", id).maybeSingle();
  const entries = ((logRow?.level_log as HistoryEntry[] | null) ?? []).map(({ className, level, kind, at, summary }) => ({ className, level, kind, at, summary }));
  const saved = (planRow?.level_plan as SavedPlan | null) ?? null;
  const history = <LevelHistory characterId={id} entries={entries} total={totalLevel(character.class_levels)}
    classes={character.class_levels.map((l) => ({ className: l.class, level: l.level }))} />;
  const wanted = typeof sp.class === "string" ? sp.class : null;
  const back = <Link href={`/characters/${id}`} className="text-sm text-muted">← {character.name}</Link>;

  if (!choice.canLevel) {
    return <>{back}<h1 className="mt-2 font-heading text-3xl font-bold">Level 20</h1><p className="mt-3 text-soft">{character.name} is already at the highest level.</p>
      {history}</>;
  }

  // Multiclassed (or asked to): first say which class goes up.
  const className = wanted && data.classes[wanted] ? wanted
    : sp.pick === "1" ? null
    : saved && data.classes[saved.className] ? saved.className
    : character.class_levels.length === 1 ? character.class_levels[0].class : null;
  if (!className) {
    return (
      <>
        {back}
        <h1 className="mt-2 font-heading text-3xl font-bold">Level up</h1>
        <p className="mt-1 text-soft">{character.name} is level {totalLevel(character.class_levels)}. Which class goes up a level?</p>
        {saved && data.classes[saved.className] && (
          <Link href={`/characters/${id}/level-up?class=${encodeURIComponent(saved.className)}`} className="mt-3 block rounded-xl border border-success-line bg-success-bg px-3 py-2 text-sm text-success">
            Your saved plan: {saved.className}. Open it ›
          </Link>
        )}
        <section className="mt-5" aria-label="Your classes">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Your classes</p>
          <ul className="mt-2 flex flex-col gap-2">
            {choice.mine.map((m) => (
              <li key={m.className}>
                <Link href={`/characters/${id}/level-up?class=${encodeURIComponent(m.className)}`}
                  className="flex items-center gap-3 rounded-2xl border border-accent-line bg-accent-surface px-4 py-3 active:border-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold">{m.className} {m.level - 1} → {m.level}</span>
                    {m.subclass && <span className="block text-sm text-muted">{m.subclass}</span>}
                  </span>
                  <span className="text-2xl text-accent" aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <details className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">Start a new class instead (multiclass)</summary>
          <p className="mt-2 text-sm text-muted">You keep everything you have and add level 1 of another class.</p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {choice.others.map((o) => (
              <li key={o.className}>
                <Link href={`/characters/${id}/level-up?class=${encodeURIComponent(o.className)}`}
                  className={`block rounded-xl border px-3 py-2 ${o.warning ? "border-line text-muted" : "border-line text-text"}`}>
                  <span className="block font-semibold">{o.className}</span>
                  <span className="block text-xs text-muted">{o.warning ? "Scores too low (ask your DM)" : "Can start"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
        {history}
      </>
    );
  }

  const plan = planLevelUp(c, className, data, await loadSpellLite(supabase));
  return (
    <>
      {back}
      <LevelUpWizard characterId={id} plan={plan} scores={character.ability_scores as Record<string, number>}
        hp={{ max: character.hp_max ?? 0, cur: character.hp_current ?? 0 }} multi={character.class_levels.length > 1 || plan.isNew}
        saved={saved && saved.className === className ? saved : null}
        goal={typeof sp.to === "string" && Number(sp.to) >= 2 ? Math.min(20, Math.floor(Number(sp.to))) : undefined} />
      {history}
    </>
  );
}
