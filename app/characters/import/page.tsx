// Make a character from a PDF character sheet (D&D Beyond export, the official fillable sheet, or any PDF with text).
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { aiProviders } from "@/lib/ai/client";
import { who } from "@/lib/items/server";
import { BottomNav } from "../../components/bottom-nav";
import { ImportFlow } from "./flow";

export default function ImportSheetPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Link href="/characters" className="text-xs uppercase tracking-[0.12em] text-muted">← Characters</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">Import a sheet</h1>
        <p className="mt-1 text-[15px] text-muted">Send your character sheet PDF and the app fills in the new character for you.</p>
        <Suspense fallback={<div className="mt-5 h-40 animate-pulse rounded-2xl bg-surface" />}><Flow /></Suspense>
      </main>
      <BottomNav active="characters" />
    </>
  );
}

async function Flow() {
  await connection();
  const { supabase, userId, campaignId, isDm } = await who();
  if (!userId) redirect("/login");
  if (!campaignId) return <p className="mt-5 text-sm text-muted">Join or start a campaign first on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>;
  const { data } = await supabase.from("campaigns").select("rule_set").eq("id", campaignId).maybeSingle();
  return <ImportFlow isDm={isDm} campaignRules={(data?.rule_set as string) ?? "2024"} aiReady={aiProviders().length > 0} />;
}
