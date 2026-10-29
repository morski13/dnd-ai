// Make a new character.
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { who } from "@/lib/items/server";
import { BottomNav } from "../../components/bottom-nav";
import { CharacterForm } from "./form";

export default function NewCharacterPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Link href="/characters" className="text-xs uppercase tracking-[0.12em] text-muted">← Characters</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">New character</h1>
        <Link href="/characters/import" className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-soft">
          <span aria-hidden className="text-accent">⤓</span>
          <span className="min-w-0 flex-1">Have a character sheet PDF? <span className="text-accent underline">Import it</span></span>
        </Link>
        <Suspense fallback={<div className="mt-5 h-96 animate-pulse rounded-2xl bg-surface" />}><Form /></Suspense>
      </main>
      <BottomNav active="characters" />
    </>
  );
}

async function Form() {
  await connection();
  const { supabase, userId, campaignId, isDm } = await who();
  if (!userId) redirect("/login");
  if (!campaignId) return <p className="mt-5 text-sm text-muted">Join or start a campaign first on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>;
  const { data } = await supabase.from("campaigns").select("rule_set").eq("id", campaignId).maybeSingle();
  return <CharacterForm isDm={isDm} campaignRules={(data?.rule_set as string) ?? "2024"} />;
}
