// The Dice tab: roll any dice, as one of your characters, any time.
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { who } from "@/lib/items/server";
import { BottomNav } from "../components/bottom-nav";
import { DiceRoller } from "./roller";

export default function RollPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28 md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Dice</p>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">Dice roller</h1>
        <Suspense fallback={<div className="mt-5 h-96 animate-pulse rounded-2xl bg-surface" />}><Roller /></Suspense>
      </main>
      <BottomNav active="dice" />
    </>
  );
}

async function Roller() {
  await connection();
  const { supabase, userId, campaignId, isDm } = await who();
  if (!userId) redirect("/login");
  if (!campaignId) return <p className="mt-5 text-sm text-muted">Join or start a campaign first on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>;
  const [{ data: chars }, { data: session }] = await Promise.all([
    isDm
      ? supabase.from("characters").select("id, name").eq("campaign_id", campaignId).order("name")
      : supabase.from("characters").select("id, name").eq("campaign_id", campaignId).eq("owner_user_id", userId).order("name"),
    supabase.from("sessions").select("id, number").eq("campaign_id", campaignId).not("started_at", "is", null).is("ended_at", null)
      .order("number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: combat } = session
    ? await supabase.from("combats").select("id").eq("session_id", session.id).is("ended_at", null).limit(1).maybeSingle()
    : { data: null };
  return <DiceRoller characters={(chars ?? []) as { id: string; name: string }[]} isDm={isDm}
    live={{ session: (session?.number as number | undefined) ?? null, combat: !!combat }} />;
}
