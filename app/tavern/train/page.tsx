// Train the Tavern: let the app ask the training questions, then review the answers quickly.
import Link from "next/link";
import { Suspense } from "react";
import { getTavern } from "@/lib/tavern-data";
import { BottomNav } from "../../components/bottom-nav";
import { Trainer } from "./trainer";

export default function TrainPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-24">
        <Suspense fallback={<div className="animate-pulse space-y-3"><div className="h-9 w-48 rounded bg-surface" /><div className="h-24 rounded-2xl bg-surface" /><div className="h-64 rounded-2xl bg-surface" /></div>}>
          <Train />
        </Suspense>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function Train() {
  const data = await getTavern(null);
  return (
    <>
      <Link href="/tavern" className="text-sm text-accent underline">← The Tavern</Link>
      <h1 className="mt-2 font-heading text-3xl font-bold leading-tight">Train the Tavern</h1>
      <p className="mb-4 mt-1 text-sm text-muted">Every answer you approve or correct becomes a lesson for our own model.</p>
      {data.configured
        ? <Trainer characters={data.characters} hasCampaign={!!data.campaign} />
        : <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">Set up an AI in .env.local first.</p>}
    </>
  );
}
