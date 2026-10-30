// Make a new character: the step-by-step builder (everything from the free rules is offered),
// or the quick form for players who already know their numbers (?quick=1).
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { builderData, classCards, originFeatTexts } from "@/lib/builder/data";
import type { Rules, ScoreMethod } from "@/lib/builder/types";
import { who } from "@/lib/items/server";
import { BottomNav } from "../../components/bottom-nav";
import { Builder, ClientOnly } from "./builder/builder";
import { CharacterForm } from "./form";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function NewCharacterPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-8 pb-48">
        <Link href="/characters" className="text-xs uppercase tracking-[0.12em] text-muted">← Characters</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">New character</h1>
        <Suspense fallback={<div className="mt-5 h-96 animate-pulse rounded-2xl bg-surface" />}><Content searchParams={searchParams} /></Suspense>
      </main>
      <BottomNav active="characters" />
    </>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const { supabase, userId, campaignId, isDm } = await who();
  if (!userId) redirect("/login");
  if (!campaignId) return <p className="mt-5 text-sm text-muted">Join or start a campaign first on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>;
  const { data } = await supabase.from("campaigns").select("rule_set, settings").eq("id", campaignId).maybeSingle();
  const campaignRules = (data?.rule_set as string) ?? "2024";

  if (sp.quick === "1") {
    return (
      <>
        <Link href="/characters/new" className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-soft">
          <span aria-hidden className="text-accent">✦</span>
          <span className="min-w-0 flex-1">New to this? <span className="text-accent underline">Use the step-by-step builder</span></span>
        </Link>
        <Link href="/characters/import" className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-soft">
          <span aria-hidden className="text-accent">⤓</span>
          <span className="min-w-0 flex-1">Have a character sheet PDF? <span className="text-accent underline">Import it</span></span>
        </Link>
        <CharacterForm isDm={isDm} campaignRules={campaignRules} />
      </>
    );
  }

  const rules: Rules[] = campaignRules === "mixed" ? ["2024", "2014"] : [campaignRules === "2014" ? "2014" : "2024"];
  const house = ((data?.settings as { house_rules?: { ability_scores?: string } } | null)?.house_rules?.ability_scores ?? "") as string;
  const defaultMethod: ScoreMethod = /4d6|roll/i.test(house) ? "roll" : /point/i.test(house) ? "pointbuy" : "standard";
  return (
    <ClientOnly fallback={<div className="mt-5 h-96 animate-pulse rounded-2xl bg-surface" />}>
      <Builder isDm={isDm} campaignRules={campaignRules} defaultMethod={defaultMethod}
        datas={Object.fromEntries(rules.map((r) => [r, builderData(r)]))}
        cards={Object.fromEntries(rules.map((r) => [r, classCards(r)]))}
        feats={Object.fromEntries(rules.map((r) => [r, originFeatTexts(r)]))} />
    </ClientOnly>
  );
}
